"""Shared helpers for the loop tests. Written from PLAN.md only, never from loop.py.

Time is a fake float. Tests move it with Tick events, one per second.
"""
import json

from kaze.loop import (
    Ack, Config, ConfirmOk, Duress, Resolve, Tick, Trigger,
    new_session, step, view_for,
)

U = "u"
PIN = "1234"
GROUP = ["g1", "g2", "a", "b", "c"]          # friends at the event
TIER_CONTACTS = ["a", "b", "c", "d"]         # d is the sober contact, not in the group
DURESS_CONTACTS = ["x", "y"]                 # private list, not in the group
EVERYONE_ELSE = ["a", "b", "c", "d", "x", "y", "g1", "g2", "stranger"]
INACTIVE = {"user_id": U, "active": False}
ASK, GRACE, ACK = 30, 15, 20


def make_config(**over):
    base = dict(
        user_id=U, pin=PIN,
        tiers=[["a"], ["b", "c"], ["d"]],
        duress_contacts=list(DURESS_CONTACTS),
        group=list(GROUP),
        ask_seconds=ASK, grace_seconds=GRACE, ack_seconds=ACK,
    )
    base.update(over)
    return Config(**base)


def start(**over):
    """New armed session at fake time 0. Returns (session, now)."""
    return new_session(make_config(**over), 0.0), 0.0


def send(s, event, now):
    """Run one event, return only the effects."""
    return step(s, event, now)[1]


def ticks(s, now, seconds):
    """Tick once per second. Yields (now, effects) for each tick."""
    for _ in range(int(seconds)):
        now += 1.0
        yield now, send(s, Tick(), now)


def advance(s, now, seconds):
    """Tick for `seconds`. Returns (now, all effects)."""
    out = []
    for now, fx in ticks(s, now, seconds):
        out += fx
    return now, out


def advance_until(s, now, cond, limit=300):
    """Tick until cond(s) is true. Fails if it takes more than `limit` seconds."""
    out = []
    for _ in range(int(limit) + 1):
        if cond(s):
            return now, out
        now += 1.0
        out += send(s, Tick(), now)
    raise AssertionError(f"condition not reached in {limit}s, state={s.state}")


def make(state, kind="manual", **over):
    """Drive a fresh session to `state`. Returns (session, now, all effects so far).

    states: armed asking waiting escalating acknowledged duress resolved
    Acknowledged means tier 1 contact "a" tapped "I'm on it".
    """
    s, now = start(**over)
    fx = []
    if state == "armed":
        return s, now, fx
    fx += send(s, Trigger(kind), now)
    if state == "asking":
        return s, now, fx
    if state == "duress":
        now, f = advance(s, now, 5)
        return s, now, fx + f + send(s, Duress(), now)
    now, f = advance_until(s, now, lambda s: s.state == "waiting")
    fx += f
    if state == "waiting":
        return s, now, fx
    now, f = advance_until(s, now, lambda s: s.state == "escalating")
    fx += f
    if state == "escalating":
        return s, now, fx
    fx += send(s, Ack("a"), now)
    if state == "acknowledged":
        return s, now, fx
    fx += send(s, Resolve(U, PIN), now)
    assert state == "resolved", state
    return s, now, fx


def to(fx, who, kind=None):
    """Effects addressed to `who`, optionally only of one kind."""
    return [e for e in fx if e.to == who and (kind is None or e.kind == kind)]


def others(fx):
    """Effects not addressed to the user."""
    return [e for e in fx if e.to != U]


def recipients(fx, kind=None):
    return {e.to for e in fx if kind is None or e.kind == kind}


def flat(fx):
    """Effects as plain tuples, easy to compare."""
    return [(e.to, e.kind, e.data) for e in fx]


def has_word(thing, word="duress"):
    return word in json.dumps(thing, default=str).lower()


def location_of(view):
    return view.get("location")
