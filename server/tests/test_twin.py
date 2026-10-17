"""A watcher cannot tell that a hidden alert is running.

The user's view and the user-directed effects must be the same for a session with a hidden alert (hidden)
and for an honest session (honest) that got the same user events. The only allowed difference is the check
mark screen: ended_fake for a wrong PIN, ended_true for the right one.
"""
import json
import random

import pytest
from fastapi.testclient import TestClient

from helpers import INACTIVE, PIN, U, active, alert, flat, make_config, to
from kaze.app import app
from kaze.loop import (
    Ack, ConfirmOk, Disconnect, Duress, Leave, LocationUpdate, Reconnect, Resolve, Tick, Trigger,
    new_session, step, view_for,
)

CONTACTS = ["a", "b", "c", "d", "x", "y", "g1", "stranger"]
SEEDS = 500
STEPS = 70


def norm(thing):
    """Treat the two check-mark screens as equal. This is the one difference the user may see."""
    return json.loads(json.dumps(thing, default=str).replace("ended_fake", "ended_true"))


def user_side(fx):
    """What the user's phone and the group can see."""
    return norm(flat([e for e in fx if e.to == U or e.kind == "left"]))


class Pair:
    """Two sessions that get the same user events. `hidden` may get a hidden alert, `honest` never does."""

    def __init__(self, hidden, honest, now=0.0):
        self.hidden, self.honest, self.now = hidden, honest, now
        self.watch = False  # also compare what the tier contacts see. Only for duress: a fake end warns them.

    def send(self, event, honest_event=None):
        """Send the event to both. Check what a watcher can see. Returns the hidden session's effects."""
        fx_h = step(self.hidden, event, self.now)[1]
        fx_t = step(self.honest, honest_event or event, self.now)[1]
        assert norm(view_for(self.hidden, U)) == norm(view_for(self.honest, U)), (event, honest_event)
        assert user_side(fx_h) == user_side(fx_t), (event, honest_event)
        for fx in (fx_h, fx_t):  # the group learns nothing but "left"
            assert {e.kind for e in fx if e.to in ("g1", "g2")} <= {"left"}
        for who in ("g1", "g2", "stranger"):
            assert view_for(self.hidden, who) == INACTIVE
        self.same_for_tier_contacts()
        return fx_h

    def same_for_tier_contacts(self):
        """A watcher may control a tier contact. That contact must see the same, location included."""
        if self.watch:
            for who in "abcd":
                if who in self.hidden.config.duress_contacts:
                    continue  # a duress contact also sees the duress alert, so their view may differ
                assert view_for(self.hidden, who) == view_for(self.honest, who), who

    def tick(self, seconds):
        self.now += seconds
        return self.send(Tick())

    def ticks(self, seconds):
        """One tick per second, like the server."""
        for _ in range(int(seconds)):
            self.tick(1)


def new_pair(**over):
    cfg = lambda: make_config(**over)
    return Pair(new_session(cfg(), 0.0), new_session(cfg(), 0.0))


def duress_pair(**over):
    """The hidden user did the gesture. The honest user tapped ok."""
    p = new_pair(**over)
    p.send(Trigger("manual"))
    p.tick(5)
    p.send(Duress(), ConfirmOk())
    assert alert(p.hidden).state == "duress" and p.honest.alerts == []
    return p


def fake_end_pair(**over):
    """The hidden user typed 2 wrong PINs in a real alert. The honest user typed the right PIN."""
    p = new_pair(**over)
    p.send(Trigger("manual"))
    p.ticks(50)
    assert p.hidden.state == "escalating"
    p.send(Resolve(U, "0000"))
    p.send(Resolve(U, "0000"), Resolve(U, PIN))
    assert alert(p.hidden).hidden and active(p.honest) == []
    return p


# ---------- the randomized twin test ----------

def shared_contacts(s):
    """Contacts who are in the tiers and in duress_contacts."""
    return [c for c in s.config.duress_contacts if any(c in tier for tier in s.config.tiers)]


def user_event(rng, p, leave=0.05):
    """A random event that either user could send. Wrong PINs never reach the second one in an alert."""
    r = rng.random()
    if r < 0.30:
        return Tick(), rng.choice([1, 1, 1, 2, 5, 10, 20, 31, 50, 100, 200])
    if r < 0.45:
        return Trigger(rng.choice(["home_by", "separation", "periodic", "manual"])), 0
    if r < 0.55:
        return ConfirmOk(), 0
    if r < 0.55 + leave:
        return Leave(), 0
    if r < 0.70:
        return Resolve(U, PIN), 0
    if r < 0.78:
        h = p.hidden
        if h.front_alert is not None and h.wrong_pins >= 1:
            return Resolve(U, PIN), 0
        return Resolve(U, "0000"), 0
    if r < 0.83:
        return LocationUpdate(rng.uniform(40, 50), rng.uniform(-80, -70)), 0
    if r < 0.86:
        return rng.choice([Disconnect(), Reconnect()]), 0
    who = rng.choice(CONTACTS)
    if rng.random() < 0.7:  # most contacts act on what they see
        seeing = [c for c in CONTACTS if view_for(p.hidden, c)["active"]]
        who = rng.choice(seeing) if seeing else who
    if shared_contacts(p.hidden) and rng.random() < 0.5:  # a contact in both lists acts a lot
        who = rng.choice(shared_contacts(p.hidden))
    if r < 0.93:
        return Ack(who), 0
    return Resolve(who), 0


def make_hidden(rng, p, kind):
    """Give `hidden` a hidden alert. Returns False if the front is in the wrong state right now."""
    state = p.hidden.state
    if kind == "duress":
        if state in ("armed", "asking", "waiting"):
            p.send(Duress(), ConfirmOk())
            return True
        if state in ("escalating", "acknowledged"):  # steer: end the alert with the PIN
            p.send(Resolve(U, PIN))
        elif state == "resolved":
            p.tick(1)
        return False
    if p.hidden.front_alert is None:
        if state == "armed":  # steer: start a check
            p.send(Trigger("manual"))
        elif state in ("asking", "waiting"):
            p.tick(100)
        elif state == "resolved":
            p.tick(1)
        return False
    if p.hidden.wrong_pins == 0:
        p.send(Resolve(U, "0000"))
    p.send(Resolve(U, rng.choice(["0000", "9999", ""])), Resolve(U, PIN))
    return True


def run_seed(seed):
    """Returns what the run covered."""
    rng = random.Random(seed)
    over = {
        "night_ends_at": rng.choice([None, None, rng.uniform(100, 900)]),
        "check_every_seconds": rng.choice([None, None, rng.uniform(20, 200)]),
        # sometimes a contact is in both the tiers and duress_contacts
        "duress_contacts": rng.choice([["x", "y"], ["x", "y"], ["x", "a"], ["d", "y"], ["b", "x"]]),
    }
    p = new_pair(**over)
    kind = rng.choice(["duress", "fake"])
    p.watch = kind == "duress"
    make_at = rng.randrange(0, 25)
    seen = {"hidden": False, "carried": False, "front_after": False}
    for i in range(STEPS):
        if not seen["hidden"] and i >= make_at:
            seen["hidden"] = make_hidden(rng, p, kind)
            if seen["hidden"] and kind == "duress" and shared_contacts(p.hidden):
                p.send(Trigger("manual"))  # a missed check: the user alert meets the open duress alert
                p.tick(100)
            continue
        if seen["hidden"] and rng.random() < 0.04 and p.hidden.state not in ("escalating", "acknowledged"):
            carried = active(p.hidden) and any(a.hidden for a in p.hidden.alerts)
            new_pin = rng.choice([PIN, "5555"])  # a new night may use another PIN
            p.hidden = new_session(make_config(pin=new_pin, **over), p.now, carry=p.hidden)
            p.honest = new_session(make_config(pin=new_pin, **over), p.now, carry=p.honest)
            assert norm(view_for(p.hidden, U)) == norm(view_for(p.honest, U))
            p.same_for_tier_contacts()
            seen["carried"] |= bool(carried)
            continue
        event, seconds = user_event(rng, p, leave=0.05 if seen["hidden"] else 0.005)
        p.now += seconds
        p.send(event)
        if seen["hidden"] and p.hidden.front_alert is not None:
            seen["front_after"] = True
    return seen


def test_random_twins_cannot_be_told_apart():
    runs = [run_seed(seed) for seed in range(SEEDS)]
    # The test must really reach the interesting cases.
    assert sum(r["hidden"] for r in runs) > SEEDS * 0.8
    assert sum(r["carried"] for r in runs) > 100
    assert sum(r["front_after"] for r in runs) > 100


# ---------- the four reviewed tells, as explicit cases ----------

def test_n1_pin_retry_in_an_alert_looks_the_same():
    p = duress_pair()
    p.send(Trigger("manual"))
    p.tick(100)
    assert view_for(p.hidden, U)["state"] == "escalating"
    p.send(Resolve(U, "0000"))
    assert view_for(p.hidden, U) == {"state": "escalating", "screen": "pin_retry", "deadline": None}
    assert p.send(Trigger("periodic")) == []
    p.send(Leave())  # ignored in an alert, for both


def test_n1_pin_retry_during_a_check_keeps_the_real_state():
    p = duress_pair()
    p.send(Trigger("manual"))
    p.tick(5)
    p.send(Resolve(U, "0000"))
    assert view_for(p.hidden, U)["state"] == "asking"
    p.tick(100)
    assert view_for(p.hidden, U)["state"] == "escalating"


def test_n2_wrong_pins_do_not_carry_into_the_next_alert():
    p = fake_end_pair()
    assert p.hidden.wrong_pins == 0
    p.tick(1)
    p.send(Trigger("periodic"))
    p.tick(200)
    assert p.hidden.state == "escalating" and p.hidden.front_alert.hidden is False
    fx = p.send(Resolve(U, "0000"))
    assert flat(to(fx, U)) == [(U, "screen", {"screen": "pin_retry"})]


@pytest.fixture
def client():
    with TestClient(app) as c:
        c.post("/demo/reset")
        yield c


def test_n3_post_sessions_answers_the_same_for_a_hidden_and_an_honest_user(client):
    mk = lambda name: client.post("/users", json={"name": name}).json()["user_id"]
    hidden, honest, a, x = mk("h"), mk("t"), mk("a"), mk("x")
    body = lambda who: {"user_id": who, "pin": "1234", "tiers": [[a]], "duress_contacts": [x]}
    for who in (hidden, honest):
        client.post("/sessions", json=body(who))
        client.post(f"/sessions/{who}/events", json={"type": "Trigger", "kind": "manual"})
    client.post(f"/sessions/{hidden}/events", json={"type": "Duress"})
    client.post(f"/sessions/{honest}/events", json={"type": "ConfirmOk"})
    view = lambda who: client.get(f"/sessions/{who}/view", params={"viewer": who}).json()
    assert view(hidden) == view(honest)
    for who in (hidden, honest):
        client.post(f"/sessions/{who}/events", json={"type": "Leave"})
    assert view(hidden) == view(honest)
    answers = [client.post("/sessions", json=body(who)) for who in (hidden, honest)]
    assert [r.status_code for r in answers] == [200, 200]
    assert answers[0].json()["view"] == answers[1].json()["view"]
    # In a real alert both get the same 409.
    for who in (hidden, honest):
        client.post(f"/sessions/{who}/events", json={"type": "Trigger", "kind": "manual"})
    client.post("/demo/skip", json={"seconds": 100})
    answers = [client.post("/sessions", json=body(who)) for who in (hidden, honest)]
    assert [(r.status_code, r.json()) for r in answers] == [(409, {"detail": "session busy"})] * 2


def test_n4_contact_resolving_a_hidden_alert_mid_check_changes_nothing_for_the_user():
    p = duress_pair()
    p.send(Trigger("periodic"))
    fx = p.send(Resolve("x"))  # ends the duress alert. The twin ignores it.
    assert active(p.hidden) == [] and fx
    p.tick(2)
    p.send(ConfirmOk())  # the check still works
    p.send(Trigger("periodic"))
    p.tick(100)
    p2 = duress_pair()
    p2.send(Trigger("periodic"))
    p2.tick(100)
    assert view_for(p2.hidden, U)["state"] == "escalating"
    p2.send(Resolve("x"))
    p2.tick(2)
    assert view_for(p2.hidden, U)["state"] == "escalating"
    p2.send(Resolve(U, PIN))
    assert view_for(p2.hidden, U)["screen"] == "ended_true"
    assert active(p2.hidden) == []


# ---------- a contact in both the tiers and duress_contacts (task 1.6) ----------

def test_n5_shared_contact_ack_and_resolve_act_on_the_front_alert_too():
    """d is a tier contact and a duress contact. Their Ack and Resolve must reach the user's front alert."""
    p = new_pair(duress_contacts=["d", "y"])
    p.send(Trigger("manual"))
    p.tick(5)
    p.send(Duress(), ConfirmOk())
    p.send(Trigger("periodic"))
    p.ticks(100)  # the check is missed, tiers a, b and c, then d
    assert view_for(p.hidden, U)["state"] == "escalating"
    p.send(Ack("d"))
    assert view_for(p.hidden, U)["state"] == "acknowledged"
    p.send(Resolve("d"))
    assert view_for(p.hidden, U)["screen"] == "ended_true"
    assert p.hidden.front_alert is None


def test_n5_shared_tier_1_contact_ack_takes_the_front_alert():
    """a is tier 1 and duress contact 1. One tap takes the duress alert and the front alert."""
    p = new_pair(tiers=[["a"], ["b"]], duress_contacts=["a", "x"], group=[])
    p.send(Duress(), ConfirmOk())
    p.send(Trigger("manual"))
    p.tick(100)
    assert view_for(p.hidden, U)["state"] == "escalating"
    p.send(Ack("a"))
    assert view_for(p.hidden, U)["state"] == "acknowledged"
    p.tick(30)  # the front alert is taken, so it does not move on to b
    for s in (p.hidden, p.honest):
        assert view_for(s, "b") == INACTIVE


def test_n5_acknowledger_who_is_later_alerted_by_duress_resolves_the_front_alert():
    """a took the front alert. The duress alert then reaches a. a's Resolve ends the front alert as well."""
    p = new_pair(tiers=[["a"], ["b"]], duress_contacts=["x", "a"], ask_seconds=1, grace_seconds=1, group=[])
    p.send(Duress(), ConfirmOk())
    p.send(Trigger("manual"))
    p.tick(1)
    p.tick(1)
    p.send(Ack("a"))
    assert view_for(p.hidden, U)["state"] == "acknowledged"
    p.tick(21)  # the duress alert moves on to a
    assert view_for(p.hidden, "a")["kind"] == "duress"
    p.send(Resolve("a"))
    assert view_for(p.hidden, U)["screen"] == "ended_true"
    assert p.hidden.front_alert is None


def test_shared_contacts_ack_and_resolve_after_a_fake_end_look_the_same_to_a_tier_contact():
    """x is in tier 2 and a duress contact. A hidden duress alert and a fake-ended alert both reach x.
    a (tier 1, not a duress contact) must see the same after x acks and resolves as in the twin with no duress."""
    p = duress_pair(tiers=[["a"], ["x"]], duress_contacts=["x", "y"], group=[], check_every_seconds=60)
    p.watch = True
    p.send(Trigger("periodic"))
    p.ticks(50)  # missed: a is alerted
    p.send(Resolve(U, "0000"))
    p.send(Resolve(U, "0000"))  # fake end: the alert keeps running, hidden, in both worlds
    p.ticks(25)  # it moves on to x
    p.send(Ack("x"))
    assert view_for(p.hidden, "a")["acknowledged_by"] == "x"
    p.send(Resolve("x"))
    assert view_for(p.hidden, "a") == INACTIVE

