"""KAZE server: REST + WebSocket around loop.step. In-memory store saved to KAZE_STATE each second, no auth.

All state changes go through `run`, which calls loop.step and pushes the effects.
"""
import asyncio
import dataclasses
import hashlib
import hmac
import json
import logging
import math
import os
import pickle
import secrets
import time
import traceback
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from . import safekeeps
from .safekeeps import router as safekeeps_router
from pydantic import BaseModel, Field

from . import loop
from .loop import Config, view_for

EVENTS = {c.__name__: c for c in (
    loop.Trigger, loop.ConfirmOk, loop.Duress, loop.Tick, loop.Ack, loop.Ping, loop.Resolve,
    loop.Disconnect, loop.Reconnect, loop.LocationUpdate, loop.Leave,
)}
TRIGGER_KINDS = ("home_by", "separation", "periodic", "manual")

users: dict[str, str] = {}              # user_id -> name
groups: dict[str, list[str]] = {}       # code -> member ids
sessions: dict[str, loop.Session] = {}  # user_id -> session
sockets: dict[str, list[WebSocket]] = {}  # id -> open sockets
offset = 0.0                            # demo time skip, seconds


def now() -> float:
    return time.time() + offset


def is_profile(user_id: str) -> bool:
    """True for any Safekeeps profile, whether or not it has a night, so no answer depends on a night."""
    if not safekeeps.DB_PATH.exists():
        return False
    with safekeeps.connect() as db:
        return db.execute("SELECT 1 FROM people WHERE id = ?", (user_id,)).fetchone() is not None


background: set[asyncio.Task] = set()   # keeps the send tasks alive until they finish


async def send_all(ws, messages) -> None:
    for m in messages:
        try:
            await ws.send_json(m)
        except Exception:
            return  # a dead socket: the app can GET the view


async def deliver(effects) -> None:
    """Each socket gets its own messages in order. Sockets are sent to at the same time,
    so one stuck socket delays nobody else."""
    per_socket: dict = {}
    for e in effects:
        if is_profile(e.to):
            continue  # a socket opened on this id before it was protected has no token, so it gets nothing
        for ws in list(sockets.get(e.to, [])):
            per_socket.setdefault(ws, []).append({"kind": e.kind, "data": e.data})
    await asyncio.gather(*(send_all(ws, m) for ws, m in per_socket.items()))


def ntfy_topic(contact_id: str) -> str | None:
    """The contact's own ntfy topic, or None when push is off. Not guessable: it is an HMAC of the id."""
    if not os.environ.get("KAZE_NTFY_URL"):
        return None
    secret = os.environ.get("KAZE_NTFY_SECRET")
    if not secret:
        if not getattr(ntfy_topic, "warned", False):
            ntfy_topic.warned = True
            logging.getLogger("uvicorn.error").warning("KAZE_NTFY_URL is set but KAZE_NTFY_SECRET is not: push is off")
        return None
    return "kaze-" + hmac.new(secret.encode(), contact_id.encode(), hashlib.sha256).hexdigest()[:20]


async def send_ntfy(url: str, topic: str) -> None:
    """One push. The text carries no name, no location, nothing personal. A failure is logged and dropped."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.post(f"{url.rstrip('/')}/{topic}", content="A SafeKeeps alert is waiting for you. Open the app.",
                                  headers={"Title": "SafeKeeps", "Priority": "high", "Tags": "warning"})
            r.raise_for_status()  # a 429 or 5xx from ntfy is a failed send too
    except Exception:
        logging.getLogger("uvicorn.error").warning("ntfy push failed", exc_info=True)


async def notify(effects) -> None:
    # a contact only, never the user's own id. Sent together so one slow request delays no other push.
    topics = [t for e in effects if e.kind == "alert" and e.to != e.data.get("user_id") and (t := ntfy_topic(e.to))]
    await asyncio.gather(*(send_ntfy(os.environ["KAZE_NTFY_URL"], t) for t in topics))


async def push(effects) -> None:
    """Send each effect to its id's open sockets. No socket means dropped (the app can GET the view).

    The sends run in the background. A stuck contact socket must not slow the user's request,
    or the user's phone would answer slower when a hidden alert sends to that contact.
    """
    if effects:
        task = asyncio.create_task(deliver(effects))
        background.add(task)
        task.add_done_callback(background.discard)
        if os.environ.get("KAZE_NTFY_URL"):
            task = asyncio.create_task(notify(effects))
            background.add(task)
            task.add_done_callback(background.discard)


async def run(user_id: str, event) -> None:
    _, effects = loop.step(sessions[user_id], event, now())
    await push(effects)


async def tick_all() -> None:
    for uid in list(sessions):
        try:
            await run(uid, loop.Tick())
        except Exception:
            traceback.print_exc()  # one bad session must not stop the other countdowns


def state_path() -> Path:
    return Path(os.environ.get("KAZE_STATE", Path(__file__).resolve().parents[1] / "kaze_state.pickle"))


_saved: tuple | None = None  # (path, bytes) last written, so an unchanged state is not written again


def save() -> None:
    """Write the live state to KAZE_STATE so a restart mid-alert carries on. Sockets are not saved.

    Called once a second by the ticker, never inside a user's request: a write that only some
    events cause (a duress makes a hidden alert) would make those answers a little slower."""
    global _saved
    try:
        path = state_path()
        data = pickle.dumps({"users": users, "groups": groups, "sessions": sessions, "offset": offset})
        if (path, data) == _saved:
            return
        tmp = path.with_name(path.name + ".tmp")
        tmp.write_bytes(data)
        os.replace(tmp, path)  # atomic: a crash mid-write leaves the old file whole
        _saved = (path, data)
    except Exception:
        traceback.print_exc()  # a sync route changing a dict mid-pickle, or a full disk: try again next second


def load() -> None:
    """Read the state save() wrote, if there is one. A bad file is logged and the server starts empty."""
    global offset
    path = state_path()
    if not path.exists():
        return
    users.clear(), groups.clear(), sessions.clear()  # cleared in place: the bridge and panel hold these dicts
    offset = 0.0
    try:
        state = pickle.loads(path.read_bytes())  # ponytail: trusts the file, it is the server's own
        users.update(state["users"])
        groups.update(state["groups"])
        sessions.update(state["sessions"])
        offset = float(state["offset"])
    except Exception:
        logging.getLogger("uvicorn.error").exception("could not load %s, starting empty", path)
        users.clear(), groups.clear(), sessions.clear()
        offset = 0.0
        return
    for uid, s in sessions.items():
        s.connected = is_profile(uid)  # no socket survives a restart; Safekeeps phones poll, as in begin_night


async def ticker() -> None:
    while True:
        await asyncio.sleep(1)
        await tick_all()
        save()


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not os.environ.get("KAZE_DEMO_KEY"):
        logging.getLogger("uvicorn.error").warning("KAZE_DEMO_KEY is not set: /demo/state, /demo/event, /demo/skip and /demo/reset are open to anyone who can reach this server")
    load()
    task = asyncio.create_task(ticker())
    yield
    task.cancel()
    save()


app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST"], allow_headers=["Content-Type", "Authorization"])


@app.exception_handler(RequestValidationError)
async def bad_body(request: Request, exc: RequestValidationError):
    """The usual 422, without the sent value: it can hold a PIN or a duress PIN, and an error must never echo either."""
    return JSONResponse(status_code=422, content={"detail": [{k: _jsonable(v) for k, v in e.items() if k != "input"} for e in exc.errors()]})


def _jsonable(v):
    try:
        json.dumps(v, allow_nan=False)
        return v
    except (ValueError, TypeError):
        return str(v)


def need_user(user_id: str) -> None:
    if user_id not in users:
        raise HTTPException(400, f"unknown user {user_id}")


def refuse_profiles(*ids: str) -> None:
    """The phase 1 endpoints have no token, so they refuse an id that the bridge protects."""
    if any(is_profile(i) for i in ids):
        raise HTTPException(403, "that id belongs to a Safekeeps phone: use /safekeeps with its token")


def need_session(user_id: str) -> loop.Session:
    if user_id not in sessions:
        raise HTTPException(404, f"no session for {user_id}")
    return sessions[user_id]


class UserIn(BaseModel):
    name: str


class GroupIn(BaseModel):
    user_id: str


Seconds = Annotated[float, Field(ge=0, allow_inf_nan=False)]  # NaN and infinity would stop a timer


class SessionIn(BaseModel):
    user_id: str
    pin: str
    duress_pin: str | None = None
    tiers: list[list[str]]
    duress_contacts: list[str] = []
    group_code: str | None = None
    share_location_with: str = "alerted"
    ask_seconds: Seconds = 30
    grace_seconds: Seconds = 15
    ack_seconds: Seconds = 20
    ack_hold_seconds: Seconds = 120
    night_ends_at: Annotated[float, Field(allow_inf_nan=False)] | None = None
    home_by: Annotated[float, Field(allow_inf_nan=False)] | None = None
    check_every_seconds: Annotated[float, Field(gt=0, allow_inf_nan=False)] | None = None


class SkipIn(BaseModel):
    seconds: Annotated[float, Field(allow_inf_nan=False)]


@app.post("/users")
def create_user(body: UserIn):
    user_id = secrets.token_hex(4)
    users[user_id] = body.name
    return {"user_id": user_id}


@app.post("/groups")
def create_group(body: GroupIn):
    refuse_profiles(body.user_id)  # before need_user, whose answer changes once a night names this id
    need_user(body.user_id)
    code = secrets.token_hex(2).upper()
    while code in groups:
        code = secrets.token_hex(2).upper()
    groups[code] = [body.user_id]
    return {"code": code}


@app.post("/groups/{code}/join")
def join_group(code: str, body: GroupIn):
    if code not in groups:
        raise HTTPException(404, f"unknown group {code}")
    refuse_profiles(body.user_id)
    need_user(body.user_id)
    if body.user_id not in groups[code]:
        groups[code].append(body.user_id)
    return {"code": code, "members": groups[code]}


MAX_CONTACTS = 50


def begin_night(user_id: str, members: list[str], **fields) -> dict:
    """The checks and the new session that POST /sessions and POST /safekeeps/night share.

    `fields` are the Config fields: pin, tiers, duress_contacts, timers and so on."""
    config = Config(user_id=user_id, group=[m for m in members if m != user_id], **fields)
    if config.share_location_with not in ("alerted", "acknowledger"):
        raise HTTPException(400, "share_location_with must be 'alerted' or 'acknowledger'")
    if not config.duress_contacts:
        raise HTTPException(400, "duress_contacts must not be empty")
    if config.duress_pin == "":  # an empty duress PIN would turn an empty PIN entry into a silent alert
        raise HTTPException(400, "duress_pin must not be empty")
    if config.duress_pin == config.pin:  # never echo either PIN
        raise HTTPException(400, "duress_pin must be different from pin")
    if not config.tiers or not all(config.tiers):
        raise HTTPException(400, "tiers must not be empty and every tier needs a contact")
    contacts = [c for t in config.tiers for c in t] + config.duress_contacts
    if len(contacts) > MAX_CONTACTS:  # every ack timeout builds an effect per entry, on the shared ticker
        raise HTTPException(400, f"at most {MAX_CONTACTS} contacts in all")
    if user_id in contacts:
        raise HTTPException(400, "the user cannot be their own contact")
    old = sessions.get(user_id)
    if old and old.state in ("escalating", "acknowledged"):  # what the user's own view shows
        raise HTTPException(409, "session busy")
    for c in contacts:
        need_user(c)
    session = loop.new_session(config, now(), carry=old)  # hidden alerts keep running
    session.connected = is_profile(user_id) or bool(sockets.get(user_id))  # Safekeeps phones poll, they never open a socket
    sessions[user_id] = session
    return {"user_id": user_id, "view": view_for(session, user_id)}


@app.post("/sessions")
def start_session(body: SessionIn):
    refuse_profiles(body.user_id, *(c for t in body.tiers for c in t), *body.duress_contacts)
    need_user(body.user_id)
    if body.group_code is not None and body.group_code not in groups:
        raise HTTPException(404, f"unknown group {body.group_code}")
    members = groups[body.group_code] if body.group_code else []
    return begin_night(body.user_id, members, **body.model_dump(exclude={"user_id", "group_code"}))


def _coord(v, limit: float) -> bool:
    """A real number within +-limit. NaN, infinity, strings and booleans are not."""
    return isinstance(v, (int, float)) and not isinstance(v, bool) and abs(v) <= limit  # NaN and infinity fail this too


@app.post("/sessions/{user_id}/events")
async def post_event(user_id: str, body: dict):
    refuse_profiles(user_id)
    return await apply_event(user_id, body)


async def apply_event(user_id: str, body: dict) -> dict:
    """Check one event body and run it. The bridge calls this after its own token checks."""
    need_session(user_id)
    fields = dict(body)
    name = fields.pop("type", None)
    if "pin" in fields and fields["pin"] is not None and not isinstance(fields["pin"], str):
        raise HTTPException(400, "pin must be a string")
    if name not in EVENTS:
        raise HTTPException(400, f"unknown event type {name}")
    try:
        event = EVENTS[name](**fields)
    except TypeError as err:
        raise HTTPException(400, f"bad fields for {name}: {err}")
    if name == "Trigger" and event.kind not in TRIGGER_KINDS:
        raise HTTPException(400, f"kind must be one of {TRIGGER_KINDS}")
    if name == "LocationUpdate" and not (_coord(event.lat, 90) and _coord(event.lng, 180)):
        raise HTTPException(400, "lat and lng must be numbers on the map")
    await run(user_id, event)
    return {"ok": True}


@app.get("/time")
def get_time():
    return {"now": now()}


@app.get("/groups/{code}")
def get_group(code: str):
    if code not in groups:
        raise HTTPException(404, f"unknown group {code}")
    return {"code": code, "members": [{"user_id": m, "name": users[m]} for m in groups[code]]}


@app.get("/alerts")
def get_alerts(viewer: str):
    """Active alerts this viewer may see, for a contact whose socket dropped."""
    refuse_profiles(viewer)
    views = (view_for(s, viewer) for s in list(sessions.values()))  # a copy: another request may start a night
    return {"alerts": [v for v in views if v.get("active") is True]}


@app.get("/sessions/{user_id}/view")
def get_view(user_id: str, viewer: str):
    refuse_profiles(user_id, viewer)
    return view_for(need_session(user_id), viewer)


@app.websocket("/ws/{id}")
async def ws_endpoint(ws: WebSocket, id: str):
    if is_profile(id):
        await ws.close(code=1008)  # Safekeeps phones poll with a token
        return
    await ws.accept()
    sockets.setdefault(id, []).append(ws)
    if id in sessions:
        await run(id, loop.Reconnect())
    try:
        while True:
            await ws.receive_text()  # the app sends nothing; this waits for the close
    except WebSocketDisconnect:
        pass
    finally:
        sockets[id].remove(ws)
        if id in sessions and not sockets[id]:
            await run(id, loop.Disconnect())


def demo_key(x_demo_key: str | None = Header(default=None)) -> None:
    """The demo routes need the header X-Demo-Key to match KAZE_DEMO_KEY when that variable is set.
    Header only: a key in the URL would land in access logs, browser history and screen shares."""
    want = os.environ.get("KAZE_DEMO_KEY")
    if want and not secrets.compare_digest((x_demo_key or "").encode(), want.encode()):
        raise HTTPException(401, "a demo key is needed")


MAX_SKIP = 1e9  # about 30 years: a bigger total makes deadlines overflow to infinity


@app.post("/demo/skip", dependencies=[Depends(demo_key)])
async def demo_skip(body: SkipIn):
    global offset
    if abs(offset + body.seconds) > MAX_SKIP:
        raise HTTPException(400, f"the total skip must stay within +-{MAX_SKIP:g} seconds")
    offset += body.seconds
    await tick_all()
    save()
    return {"offset": offset}


@app.post("/demo/reset", dependencies=[Depends(demo_key)])
async def demo_reset():  # async so it runs on the ticker's thread and no save lands halfway through it
    global offset, _saved
    offset = 0.0
    users.clear()
    groups.clear()
    sessions.clear()
    state_path().unlink(missing_ok=True)
    _saved = None
    return {"ok": True}


# Safekeeps mobile demo: persistent profiles, friends, and check-ins.
# The bridge imports from this module, so it is included last.
from .bridge import router as bridge_router  # noqa: E402
from .panel import router as panel_router  # noqa: E402

app.include_router(safekeeps_router)
app.include_router(bridge_router)
app.include_router(panel_router)
