"""Small persistent, token-authenticated API for the two-phone Safekeeps demo."""
from contextlib import contextmanager
import os
import secrets
import sqlite3
import time
from pathlib import Path

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from . import loop

router = APIRouter(prefix="/safekeeps")
DB_PATH = Path(os.environ.get("SAFEKEEPS_DB", Path(__file__).resolve().parents[1] / "safekeeps.sqlite3"))


@contextmanager
def connect():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.executescript("""
        CREATE TABLE IF NOT EXISTS people (
            id TEXT PRIMARY KEY, token TEXT UNIQUE NOT NULL,
            code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, last_check_in INTEGER
        );
        CREATE TABLE IF NOT EXISTS friendships (
            owner TEXT NOT NULL, friend TEXT NOT NULL, PRIMARY KEY(owner, friend)
        );
        CREATE TABLE IF NOT EXISTS friend_names (
            owner TEXT NOT NULL, friend TEXT NOT NULL, name TEXT NOT NULL,
            PRIMARY KEY(owner, friend)
        );
        CREATE TABLE IF NOT EXISTS friend_requests (
            sender TEXT NOT NULL, target TEXT NOT NULL, created_at INTEGER NOT NULL,
            PRIMARY KEY(sender, target)
        );
        CREATE TABLE IF NOT EXISTS requests (
            sender TEXT NOT NULL, target TEXT NOT NULL,
            requested_at INTEGER NOT NULL, resolved_at INTEGER,
            PRIMARY KEY(sender, target)
        );
    """)
    try:
        with db:
            yield db
    finally:
        db.close()


def identity(db, authorization):
    token = authorization.removeprefix("Bearer ") if authorization else ""
    user = db.execute("SELECT * FROM people WHERE token = ?", (token,)).fetchone()
    if user is None:
        raise HTTPException(401, "Please create or reconnect your profile.")
    return user


def snapshot(db, user):
    friends = db.execute("""
        SELECT p.id, COALESCE(n.name, p.name) AS name, p.last_check_in,
               r.requested_at, r.resolved_at
        FROM friendships f JOIN people p ON p.id = f.friend
        LEFT JOIN friend_names n ON n.owner = f.owner AND n.friend = f.friend
        LEFT JOIN requests r ON r.sender = f.owner AND r.target = f.friend
        WHERE f.owner = ? ORDER BY name COLLATE NOCASE
    """, (user["id"],)).fetchall()
    incoming = db.execute("""
        SELECT p.id, COALESCE(n.name, p.name) AS name, r.requested_at
        FROM requests r JOIN people p ON p.id = r.sender
        LEFT JOIN friend_names n ON n.owner = r.target AND n.friend = r.sender
        WHERE r.target = ? AND r.resolved_at IS NULL ORDER BY r.requested_at DESC
    """, (user["id"],)).fetchall()
    return {
        "friendRequests": [dict(p) for p in db.execute(
            "SELECT p.id, p.name FROM friend_requests r JOIN people p ON p.id = r.sender WHERE r.target = ?",
            (user["id"],)).fetchall()],
        "sentRequests": [dict(p) for p in db.execute(
            "SELECT p.id, COALESCE(n.name, p.name) AS name FROM friend_requests r JOIN people p ON p.id = r.target "
            "LEFT JOIN friend_names n ON n.owner = r.sender AND n.friend = r.target WHERE r.sender = ?",
            (user["id"],)).fetchall()],
        "me": {"id": user["id"], "name": user["name"], "code": user["code"],
               "lastCheckIn": user["last_check_in"]},
        "friends": [
            {"id": p["id"], "name": p["name"], "lastCheckIn": p["last_check_in"],
             "requestedAt": p["requested_at"], "resolvedAt": p["resolved_at"]}
            for p in friends
        ],
        "incoming": [
            {"id": p["id"], "name": p["name"], "requestedAt": p["requested_at"]}
            for p in incoming
        ],
    }


class ProfileIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)


class FriendIn(BaseModel):
    code: str = Field(min_length=1, max_length=32)
    name: str = Field(default="", max_length=40)


@router.post("/profiles")
def create_profile(body: ProfileIn):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Enter your name.")
    token, uid = secrets.token_urlsafe(32), secrets.token_hex(16)
    with connect() as db:
        while True:
            code = secrets.token_hex(4).upper()
            if not db.execute("SELECT 1 FROM people WHERE code = ?", (code,)).fetchone():
                break
        db.execute("INSERT INTO people VALUES (?, ?, ?, ?, NULL)", (uid, token, code, name))
        user = db.execute("SELECT * FROM people WHERE id = ?", (uid,)).fetchone()
        return {"token": token, "snapshot": snapshot(db, user)}


@router.get("/state")
def get_state(authorization: str | None = Header(default=None)):
    with connect() as db:
        return snapshot(db, identity(db, authorization))


@router.post("/friends")
def add_friend(body: FriendIn, authorization: str | None = Header(default=None)):
    with connect() as db:
        user = identity(db, authorization)
        other = db.execute("SELECT * FROM people WHERE code = ?", (body.code.strip().upper(),)).fetchone()
        if other is None:
            raise HTTPException(404, "No friend has that code. Check it and try again.")
        if other["id"] == user["id"]:
            raise HTTPException(400, "Use the code from the other phone.")
        if not db.execute("SELECT 1 FROM friendships WHERE owner = ? AND friend = ?", (user["id"], other["id"])).fetchone():
            db.execute("INSERT OR IGNORE INTO friend_requests VALUES (?, ?, ?)", (user["id"], other["id"], int(time.time() * 1000)))
        if body.name.strip():
            db.execute("""
                INSERT INTO friend_names VALUES (?, ?, ?)
                ON CONFLICT(owner, friend) DO UPDATE SET name = excluded.name
            """, (user["id"], other["id"], body.name.strip()))
        return snapshot(db, user)


@router.post("/friend-requests/{sender_id}/accept")
def accept_friend(sender_id: str, authorization: str | None = Header(default=None)):
    with connect() as db:
        user = identity(db, authorization)
        if not db.execute("SELECT 1 FROM friend_requests WHERE sender = ? AND target = ?", (sender_id, user["id"])).fetchone():
            raise HTTPException(404, "This friend request is no longer available.")
        db.execute("INSERT OR IGNORE INTO friendships VALUES (?, ?)", (user["id"], sender_id))
        db.execute("INSERT OR IGNORE INTO friendships VALUES (?, ?)", (sender_id, user["id"]))
        db.execute("DELETE FROM friend_requests WHERE (sender = ? AND target = ?) OR (sender = ? AND target = ?)",
                   (sender_id, user["id"], user["id"], sender_id))
        return snapshot(db, user)


@router.post("/friend-requests/{sender_id}/decline")
def decline_friend(sender_id: str, authorization: str | None = Header(default=None)):
    with connect() as db:
        user = identity(db, authorization)
        db.execute("DELETE FROM friend_requests WHERE sender = ? AND target = ?", (sender_id, user["id"]))
        return snapshot(db, user)


def record_check_in(db, user):
    """The check-in record. Also used by the bridge, so ok and duress leave the same trace."""
    now = int(time.time() * 1000)
    db.execute("UPDATE people SET last_check_in = ? WHERE id = ?", (now, user["id"]))
    db.execute("UPDATE requests SET resolved_at = ? WHERE target = ? AND resolved_at IS NULL", (now, user["id"]))


@router.post("/check-ins")
async def check_in(authorization: str | None = Header(default=None)):
    from .bridge import send  # the bridge imports app.py, which imports this file
    with connect() as db:
        user = identity(db, authorization)
        record_check_in(db, user)
        result = snapshot(db, db.execute("SELECT * FROM people WHERE id = ?", (user["id"],)).fetchone())
    await send(user["id"], loop.ConfirmOk())  # the check-in loop, if a night is running
    return result


@router.post("/friends/{friend_id}/requests")
async def request_check_in(friend_id: str, authorization: str | None = Header(default=None)):
    from .bridge import ask_to_check_in
    with connect() as db:
        user = identity(db, authorization)
        if not db.execute("SELECT 1 FROM friendships WHERE owner = ? AND friend = ?", (user["id"], friend_id)).fetchone():
            raise HTTPException(403, "Add this person as a friend first.")
        db.execute("""
            INSERT INTO requests VALUES (?, ?, ?, NULL)
            ON CONFLICT(sender, target) DO UPDATE SET requested_at = excluded.requested_at, resolved_at = NULL
        """, (user["id"], friend_id, int(time.time() * 1000)))
        result = snapshot(db, user)
    await ask_to_check_in(user["id"], friend_id)  # a real check on the friend's phone, if the bridge allows it
    return result


@router.post("/guests")
def create_guest():
    """No credentials required; each device receives its own saved guest session."""
    return create_profile(ProfileIn(name="Guest " + secrets.token_hex(2).upper()))


@router.post("/friends/{friend_id}/remove")
def remove_friend(friend_id: str, authorization: str | None = Header(default=None)):
    with connect() as db:
        user = identity(db, authorization)
        pair = (user["id"], friend_id, friend_id, user["id"])
        for table in ("friendships", "friend_names"):
            db.execute(f"DELETE FROM {table} WHERE (owner = ? AND friend = ?) OR (owner = ? AND friend = ?)", pair)
        db.execute("DELETE FROM requests WHERE (sender = ? AND target = ?) OR (sender = ? AND target = ?)", pair)
        db.execute("DELETE FROM friend_requests WHERE (sender = ? AND target = ?) OR (sender = ? AND target = ?)", pair)
        return snapshot(db, user)
