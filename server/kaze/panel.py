"""The demo control panel: a page, a state dump for judges, and a way to fire events from it.

It shows hidden alerts on purpose, so set KAZE_DEMO_KEY when the server is public (see app.demo_key).
"""
import os
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from . import app as server, loop
from .app import apply_event, demo_key, now, sessions, users
from .loop import view_for

router = APIRouter()
locked = [Depends(demo_key)]
PAGE = Path(__file__).parent.parent / "panel" / "index.html"
PANEL_EVENTS = ("Trigger", "Disconnect", "Reconnect", "LocationUpdate")


def name(user_id: str) -> str:
    return users.get(user_id, user_id)


def alert_row(a: loop.Alert) -> dict:
    return {
        "kind": a.kind, "hidden": a.hidden, "state": a.state, "tier_index": a.tier_index, "tier_count": len(a.tiers),
        "alerted": [name(c) for c in a.alerted], "acknowledged_by": a.acknowledged_by and name(a.acknowledged_by),
        "deadline": a.deadline,
    }


def privacy_rows(s: loop.Session) -> list[dict]:
    """What each person in this night would get from view_for. Roles come from the night's own config."""
    c = s.config
    roles: dict[str, list[str]] = {}
    for i, tier in enumerate(c.tiers):
        for p in tier:
            roles.setdefault(p, []).append(f"tier {i + 1}")
    for p in c.duress_contacts:
        roles.setdefault(p, []).append("duress contact")
    for p in c.group:
        roles.setdefault(p, []).append("group")
    rows = []
    for p, r in roles.items():
        v = view_for(s, p)
        rows.append({"name": name(p), "role": ", ".join(r), "sees_alert": v["active"], "kind": v.get("kind"),
                     "sees_location": v.get("location") is not None})
    return rows


def session_row(uid: str, s: loop.Session) -> dict:
    c = s.config
    return {
        "user_id": uid, "name": name(uid), "state": s.state, "screen": s.screen, "deadline": s.deadline,
        "connected": s.connected, "location": s.location, "next_check": s.next_check,
        "config": {"tiers": [[name(p) for p in t] for t in c.tiers], "duress_contacts": [name(p) for p in c.duress_contacts],
                   "group": [name(p) for p in c.group], "share_location_with": c.share_location_with},
        "alerts": [alert_row(a) for a in s.alerts],
        "privacy": privacy_rows(s),
    }


@router.get("/panel")
def panel_page():
    """No key here: the page holds no data. It asks for the key and sends it as a header."""
    return FileResponse(PAGE, headers={"Cache-Control": "no-store"})  # the page changes while we build it


@router.get("/demo/state", dependencies=locked)
def demo_state():
    # offset is a module variable that /demo/skip rebinds, so read it through the module
    return {"now": now(), "key_set": bool(os.environ.get("KAZE_DEMO_KEY")), "offset": server.offset, "sessions": [session_row(u, s) for u, s in list(sessions.items())]}


@router.post("/demo/event", dependencies=locked)
async def demo_event(body: dict):
    """Fire one event at any session, Safekeeps ones too. Same checks and effects as POST /sessions/{id}/events."""
    fields = dict(body)
    user_id = fields.pop("user_id", None)
    if not isinstance(user_id, str) or fields.get("type") not in PANEL_EVENTS:
        raise HTTPException(400, f"user_id is needed and type must be one of {PANEL_EVENTS}")
    return await apply_event(user_id, fields)
