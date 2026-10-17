"""Links the Safekeeps profiles and friends (SQLite, Bearer tokens) to the check-in loop.

A person's SQLite id is their loop user id. The loop decides who may do what. This file only
checks who is calling and that every contact is an accepted friend.
"""
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from . import loop
from .app import Seconds, apply_event, begin_night, need_session, now, run, sessions, users
from .loop import view_for
from .safekeeps import connect, identity, record_check_in

router = APIRouter(prefix="/safekeeps")
EVENT_TYPES = ("ConfirmOk", "Duress", "Resolve", "LocationUpdate", "Leave")  # the rest are server or panel events


async def send(user_id: str, event) -> None:
    """Send an event to this person's night, if one is running."""
    if user_id in sessions:
        await run(user_id, event)


async def ask_to_check_in(sender: str, target: str) -> None:
    """A friend asked `target` to check in. That starts a real check if the night names the sender
    (a contact or a friend at the start). The loop ignores it while a check is already running."""
    s = sessions.get(target)
    if s is None:
        return
    c = s.config
    if sender not in {x for t in c.tiers for x in t} | set(c.duress_contacts) | set(c.group):
        return
    await run(target, loop.Trigger("manual"))


class NightIn(BaseModel):
    pin: str
    duress_pin: str | None = None  # passed to the loop with the other fields
    tiers: list[list[str]]
    duress_contacts: list[str]
    check_every_minutes: Annotated[float, Field(gt=0, allow_inf_nan=False)] | None = None
    ask_seconds: Seconds = 30
    grace_seconds: Seconds = 15
    ack_seconds: Seconds = 20
    ack_hold_seconds: Seconds = 120
    night_ends_at: Annotated[float, Field(allow_inf_nan=False)] | None = None
    home_by: Annotated[float, Field(allow_inf_nan=False)] | None = None
    share_location_with: str = "alerted"  # or "acknowledger"


@router.post("/night")
def start_night(body: NightIn, authorization: str | None = Header(default=None)):
    with connect() as db:
        me = identity(db, authorization)
        friends = db.execute(
            "SELECT p.id, p.name FROM friendships f JOIN people p ON p.id = f.friend WHERE f.owner = ?",
            (me["id"],)).fetchall()
    ids = {f["id"] for f in friends}
    if not set(c for t in body.tiers for c in t) | set(body.duress_contacts) <= ids:
        raise HTTPException(400, "every contact must be an accepted friend")
    users[me["id"]] = me["name"]
    users.update({f["id"]: f["name"] for f in friends})
    fields = body.model_dump(exclude={"check_every_minutes"})
    if body.check_every_minutes is not None:
        fields["check_every_seconds"] = body.check_every_minutes * 60
    return begin_night(me["id"], sorted(ids), **fields)


@router.get("/night")
def get_night(authorization: str | None = Header(default=None)):
    with connect() as db:
        me = identity(db, authorization)["id"]
        mine = sessions.get(me)
        views = (view_for(s, me) for uid, s in list(sessions.items()) if uid != me)  # never my own night. A copy: another request may start a night
        alerts = [v for v in views if v.get("active") is True]  # the loop decides from the night's own contacts
        # The name travels with the alert: a contact who removed this friend during the night still sees who it is.
        alerts = [{**v, "name": display_name(db, me, v["user_id"])} for v in alerts]
    return {"now": now(), "view": view_for(mine, me) if mine else None, "alerts": alerts}


def display_name(db, viewer: str, person: str) -> str | None:
    """What the viewer calls this person: the viewer's own name for them, else the name they picked."""
    row = db.execute("SELECT COALESCE(n.name, p.name) FROM people p LEFT JOIN friend_names n ON n.owner = ? AND n.friend = p.id "
                     "WHERE p.id = ?", (viewer, person)).fetchone()
    return row[0] if row else None


@router.post("/night/events")
async def night_event(body: dict, authorization: str | None = Header(default=None)):
    with connect() as db:
        me = identity(db, authorization)
        body = dict(body)
        if body.get("type") not in EVENT_TYPES:
            raise HTTPException(400, f"type must be one of {EVENT_TYPES}")
        need_session(me["id"])
        if body["type"] == "Resolve":
            if not isinstance(body.get("pin"), str):
                raise HTTPException(400, "pin must be a string")
            body["by"] = me["id"]  # nobody else's name goes in
        await apply_event(me["id"], body)
        if body["type"] in ("ConfirmOk", "Duress"):
            record_check_in(db, me)  # the same record for both, so friends' data cannot tell them apart
    return {"ok": True}


async def act_on_alert(owner_id: str, authorization, event) -> dict:
    """The answer is always the same, so it cannot tell a caller whether the owner has a night. The loop decides
    whether the act counts, from the contacts the night started with."""
    with connect() as db:
        me = identity(db, authorization)["id"]
    if owner_id == me:
        raise HTTPException(400, "that is your own night: use /safekeeps/night/events")
    await send(owner_id, event(me))
    return {"ok": True}


@router.post("/alerts/{owner_id}/ack")
async def ack_alert(owner_id: str, authorization: str | None = Header(default=None)):
    return await act_on_alert(owner_id, authorization, loop.Ack)


@router.post("/alerts/{owner_id}/resolve")
async def resolve_alert(owner_id: str, authorization: str | None = Header(default=None)):
    return await act_on_alert(owner_id, authorization, lambda me: loop.Resolve(by=me))


@router.post("/alerts/{owner_id}/ping")
async def ping_alert(owner_id: str, authorization: str | None = Header(default=None)):
    """Make the owner's phone ring. The loop counts it only for a visible alert, never a hidden one."""
    return await act_on_alert(owner_id, authorization, loop.Ping)
