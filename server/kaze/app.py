"""KAZE server: REST + WebSocket around loop.step. In-memory store, no auth.

All state changes go through `run`, which calls loop.step and pushes the effects.
"""
import asyncio
import dataclasses
import json
import math
import secrets
import time
import traceback
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from .safekeeps import router as safekeeps_router
from pydantic import BaseModel, Field

from . import loop
from .loop import Config, view_for

EVENTS = {c.__name__: c for c in (
    loop.Trigger, loop.ConfirmOk, loop.Duress, loop.Tick, loop.Ack, loop.Resolve,
    loop.Disconnect, loop.Reconnect, loop.LocationUpdate, loop.Leave,
)}
TRIGGER_KINDS = ("home_by", "separation", "periodic", "manual")

users: dict[str, str] = {}              # user_id -> name
groups: dict[str, list[str]] = {}       # code -> member ids
sessions: dict[str, loop.Session] = {}  # user_id -> session
profile_ids: set[str] = set()           # ids of Safekeeps phones (set by the bridge). They act only with a token.
sockets: dict[str, list[WebSocket]] = {}  # id -> open sockets
offset = 0.0                            # demo time skip, seconds


def now() -> float:
    return time.time() + offset


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
        if e.to in profile_ids:
            continue  # a socket opened on this id before it was protected has no token, so it gets nothing
        for ws in list(sockets.get(e.to, [])):
            per_socket.setdefault(ws, []).append({"kind": e.kind, "data": e.data})
    await asyncio.gather(*(send_all(ws, m) for ws, m in per_socket.items()))


async def push(effects) -> None:
    """Send each effect to its id's open sockets. No socket means dropped (the app can GET the view).

    The sends run in the background. A stuck contact socket must not slow the user's request,
    or the user's phone would answer slower when a hidden alert sends to that contact.
    """
    if effects:
        task = asyncio.create_task(deliver(effects))
        background.add(task)
        task.add_done_callback(background.discard)


async def run(user_id: str, event) -> None:
    _, effects = loop.step(sessions[user_id], event, now())
    await push(effects)


async def ticker() -> None:
    while True:
        await asyncio.sleep(1)
        try:
            for uid in list(sessions):
                await run(uid, loop.Tick())
        except Exception:
            traceback.print_exc()  # never let one bad tick stop the countdowns


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(ticker())
    yield
    task.cancel()


app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST"], allow_headers=["Content-Type", "Authorization"])


@app.exception_handler(RequestValidationError)
async def bad_body(request: Request, exc: RequestValidationError):
    """The usual 422. An input that JSON cannot hold (NaN or infinity, alone or inside a list or object) is shown as text."""
    return JSONResponse(status_code=422, content={"detail": [e | {"input": _jsonable(e.get("input"))} for e in exc.errors()]})


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
    if any(i in profile_ids for i in ids):
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
    tiers: list[list[str]]
    duress_contacts: list[str] = []
    group_code: str | None = None
    share_location_with: str = "alerted"
    ask_seconds: Seconds = 30
    grace_seconds: Seconds = 15
    ack_seconds: Seconds = 20
    night_ends_at: Annotated[float, Field(allow_inf_nan=False)] | None = None
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
    need_user(body.user_id)
    refuse_profiles(body.user_id)
    code = secrets.token_hex(2).upper()
    while code in groups:
        code = secrets.token_hex(2).upper()
    groups[code] = [body.user_id]
    return {"code": code}


@app.post("/groups/{code}/join")
def join_group(code: str, body: GroupIn):
    if code not in groups:
        raise HTTPException(404, f"unknown group {code}")
    need_user(body.user_id)
    refuse_profiles(body.user_id)
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
    session.connected = bool(sockets.get(user_id))
    sessions[user_id] = session
    return {"user_id": user_id, "view": view_for(session, user_id)}


@app.post("/sessions")
def start_session(body: SessionIn):
    need_user(body.user_id)
    refuse_profiles(body.user_id, *(c for t in body.tiers for c in t), *body.duress_contacts)
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
    views = (view_for(s, viewer) for s in sessions.values())
    return {"alerts": [v for v in views if v.get("active") is True]}


@app.get("/sessions/{user_id}/view")
def get_view(user_id: str, viewer: str):
    refuse_profiles(user_id, viewer)
    return view_for(need_session(user_id), viewer)


@app.websocket("/ws/{id}")
async def ws_endpoint(ws: WebSocket, id: str):
    if id in profile_ids:
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


MAX_SKIP = 1e9  # about 30 years: a bigger total makes deadlines overflow to infinity


@app.post("/demo/skip")
async def demo_skip(body: SkipIn):
    global offset
    if abs(offset + body.seconds) > MAX_SKIP:
        raise HTTPException(400, f"the total skip must stay within +-{MAX_SKIP:g} seconds")
    offset += body.seconds
    for uid in list(sessions):
        await run(uid, loop.Tick())
    return {"offset": offset}


@app.post("/demo/reset")
def demo_reset():
    global offset
    offset = 0.0
    users.clear()
    profile_ids.clear()
    groups.clear()
    sessions.clear()
    return {"ok": True}


# Safekeeps mobile demo: persistent profiles, friends, and check-ins.
# The bridge imports from this module, so it is included last.
from .bridge import router as bridge_router  # noqa: E402

app.include_router(safekeeps_router)
app.include_router(bridge_router)
