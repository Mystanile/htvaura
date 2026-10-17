"""Links the Safekeeps profiles and friends (SQLite, Bearer tokens) to the check-in loop.

A person's SQLite id is their loop user id. The loop decides who may do what. This file only
checks who is calling and that every contact is an accepted friend.
"""
import time
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from . import loop
from .app import Seconds, apply_event, begin_night, need_session, now, profile_ids, run, sessions, users
from .loop import view_for
from .safekeeps import connect, identity, record_check_in

router = APIRouter(prefix="/safekeeps")
MANUAL_COOLDOWN = 30  # seconds after a check-in before a friend's request starts another check
EVENT_TYPES = ("ConfirmOk", "Duress", "Resolve", "LocationUpdate", "Leave")  # the rest are server or panel events


async def send(user_id: str, event) -> None:
    """Send an event to this person's night, if one is running."""
    if user_id in sessions:
        await run(user_id, event)


async def ask_to_check_in(sender: str, target: str) -> None:
    """A friend asked `target` to check in. That starts a real check only if the night names the
    sender (a contact or a friend at the start) and `target` has not just checked in."""
    s = sessions.get(target)
    if s is None:
        return
    c = s.config
    if sender not in {x for t in c.tiers for x in t} | set(c.duress_contacts) | set(c.group):
        return
    with connect() as db:
        last = db.execute("SELECT last_check_in FROM people WHERE id = ?", (target,)).fetchone()["last_check_in"]
    if last is None or time.time() * 1000 - last >= MANUAL_COOLDOWN * 1000:
        await run(target, loop.Trigger("manual"))


def reaches(view: dict, is_friend: bool) -> bool:
    """An alert is mine if it is active for me and its owner is still my friend. A duress alert is mine even after
    the owner's phone removed me: removing a friend must not be a way to cancel a silent alert."""
    return view.get("active") is True and (is_friend or view["kind"] == "duress")


def friend_ids(db, me: str) -> set[str]:
    """Who is my friend now. A night keeps the list from when it started, so every read and act checks this."""
    return {r["friend"] for r in db.execute("SELECT friend FROM friendships WHERE owner = ?", (me,))}


class NightIn(BaseModel):
    pin: str
    tiers: list[list[str]]
    duress_contacts: list[str]
    check_every_minutes: Annotated[float, Field(gt=0, allow_inf_nan=False)] | None = None
    ask_seconds: Seconds = 30
    grace_seconds: Seconds = 15
    ack_seconds: Seconds = 20
    night_ends_at: Annotated[float, Field(allow_inf_nan=False)] | None = None


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
    profile_ids.update(ids | {me["id"]})
    users.update({f["id"]: f["name"] for f in friends})
    fields = body.model_dump(exclude={"check_every_minutes"})
    if body.check_every_minutes is not None:
        fields["check_every_seconds"] = body.check_every_minutes * 60
    return begin_night(me["id"], sorted(ids), **fields)


@router.get("/night")
def get_night(authorization: str | None = Header(default=None)):
    with connect() as db:
        me = identity(db, authorization)["id"]
        friends = friend_ids(db, me)
    mine = sessions.get(me)
    views = ((uid, view_for(s, me)) for uid, s in sessions.items() if uid != me)  # never my own night
    return {
        "now": now(),
        "view": view_for(mine, me) if mine else None,
        "alerts": [v for uid, v in views if reaches(v, uid in friends)],
    }


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
    with connect() as db:
        me = identity(db, authorization)["id"]
        friends = friend_ids(db, me)
    if owner_id == me:
        raise HTTPException(400, "that is your own night: use /safekeeps/night/events")
    if owner_id not in friends and not (owner_id in sessions and reaches(view_for(sessions[owner_id], me), False)):
        raise HTTPException(404, f"no session for {owner_id}")  # the same answer as for no night, so it tells nothing
    need_session(owner_id)
    await run(owner_id, event(me))
    return {"ok": True}


@router.post("/alerts/{owner_id}/ack")
async def ack_alert(owner_id: str, authorization: str | None = Header(default=None)):
    return await act_on_alert(owner_id, authorization, loop.Ack)


@router.post("/alerts/{owner_id}/resolve")
async def resolve_alert(owner_id: str, authorization: str | None = Header(default=None)):
    return await act_on_alert(owner_id, authorization, lambda me: loop.Resolve(by=me))
