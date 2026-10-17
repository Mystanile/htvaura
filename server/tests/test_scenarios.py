"""The 7 KAZE scenarios. Written from PLAN.md only, against the server logic, with fake time."""
import pytest

from helpers import (
    ACK, ASK, EVERYONE_ELSE, GRACE, GROUP, INACTIVE, PIN, U,
    advance, advance_until, flat, has_word, make, others, recipients, send, start, to,
)
from kaze.cards import card_for
from kaze.loop import (
    Ack, ConfirmOk, Disconnect, Duress, LocationUpdate, Reconnect, Resolve, Trigger, view_for,
)

LAT, LNG = 43.65, -79.38


# ---------- 1. Safe ----------

@pytest.mark.parametrize("state", ["asking", "waiting"])
def test_1_safe(state):
    """Tap ok inside the window: back to armed, nobody else ever hears anything."""
    s, now, fx = make(state)
    fx += send(s, ConfirmOk(), now)
    assert s.state == "armed"
    assert s.deadline is None
    assert flat(to(fx, U, "screen"))[-1] == (U, "screen", {"screen": "thanks"})
    assert others(fx) == []

    # Long after the old deadlines: still armed, nothing sent to anyone.
    now, later = advance(s, now, 300)
    assert s.state == "armed"
    assert later == []
    for who in EVERYONE_ELSE:
        assert view_for(s, who) == INACTIVE
    assert view_for(s, U)["state"] == "armed"
    assert view_for(s, U)["deadline"] is None


# ---------- 2. No response ----------

def test_2_no_response():
    """Silence through ask + grace: user is alarmed, then tier 1 (only) gets the alert with a card."""
    s, now = start()
    fx = send(s, Trigger("separation"), now)
    assert s.state == "asking"
    assert others(fx) == []

    now, f = advance_until(s, now, lambda s: s.state == "waiting", limit=ASK + 2)
    fx += f
    assert to(fx, U, "alarm"), "user phone should get a louder alarm when the ask window ends"
    assert "deadline" in to(fx, U, "alarm")[0].data
    assert others(fx) == []

    now, f = advance_until(s, now, lambda s: s.state == "escalating", limit=GRACE + 2)
    fx += f
    assert now <= ASK + GRACE + 3  # escalation is on time, not late

    alerts = to(fx, "a", "alert")
    assert len(alerts) == 1
    data = alerts[0].data
    assert data["user_id"] == "u"
    assert data["kind"] == "separation"
    assert data["card"] == card_for("separation")
    assert "tier" in data
    assert recipients(others(fx)) == {"a"}, "only tier 1 hears about it"

    assert view_for(s, U)["state"] == "escalating"
    seen = view_for(s, "a")
    assert seen["active"] is True
    assert seen["kind"] == "separation"
    assert seen["card"] == card_for("separation")
    assert seen["acknowledged_by"] is None
    for who in ["b", "c", "d", "x", "y", "g1", "g2"]:
        assert view_for(s, who) == INACTIVE


# ---------- 3. Duress ----------

def test_3_duress():
    """Duress looks exactly like a normal ok to the user, silently alerts duress contacts only."""
    s, now, _ = make("asking")
    twin, _, _ = make("asking")
    now, _ = advance(s, now, 5)
    advance(twin, 0.0, 5)

    fx = send(s, Duress(), now)
    fx_ok = send(twin, ConfirmOk(), now)

    assert s.state == "duress"
    assert view_for(s, U) == view_for(twin, U), "user view must match a normal ok"
    assert flat(to(fx, U)) == flat(to(fx_ok, U)), "user-directed effects must match a normal ok"
    assert not has_word([flat(to(fx, U))])

    # Duress contact 1 gets a silent alert with the duress card. Nobody else.
    assert recipients(others(fx)) == {"x"}
    alert = to(fx, "x", "alert")
    assert len(alert) == 1
    assert alert[0].data["user_id"] == "u"
    assert alert[0].data["kind"] == "duress"
    assert alert[0].data["card"] == card_for("duress")

    # Run a long time: contact 2 gets alerted, all duress contacts get re-alerted,
    # but no group member and no tier contact ever receives anything.
    t0 = now
    now, later = advance(s, now, 300)
    _, twin_later = advance(twin, t0, 300)
    everything = fx + later
    assert s.state == "duress"
    assert recipients(others(everything)) == {"x", "y"}
    for who in GROUP + ["d", "stranger"]:
        assert to(everything, who) == []
        assert view_for(s, who) == INACTIVE
    assert flat(to(later, U)) == flat(to(twin_later, U)), "no user-side tell after the gesture"

    assert view_for(s, "x")["active"] is True
    assert view_for(s, "x")["kind"] == "duress"
    assert not has_word(view_for(s, U))


# ---------- 4. Connectivity failure ----------

def test_4_connectivity_failure():
    """Phone disconnects after the countdown starts. The server still escalates, on time."""
    s, now, _ = make("asking")
    twin, tnow, _ = make("asking")

    now, _ = advance(s, now, 5)
    assert send(s, Disconnect(), now) == []
    assert s.connected is False
    assert s.state == "asking"

    # Ticks only from here: no events from the phone at all.
    now, f1 = advance_until(s, now, lambda s: s.state == "escalating", limit=ASK + GRACE + 2)
    assert s.connected is False
    assert s.state == "escalating"
    assert len(to(f1, "a", "alert")) == 1

    # Same timing as a session whose phone stayed connected.
    tnow, _ = advance_until(twin, tnow, lambda s: s.state == "escalating", limit=ASK + GRACE + 2)
    assert now == tnow

    # Phone comes back: nothing changes except the flag.
    assert send(s, Reconnect(), now) == []
    assert s.connected is True
    assert s.state == "escalating"


# ---------- 5. Unacknowledged alert ----------

def test_5_unacknowledged_alert():
    """Tier 1 stays silent: tier 2 gets alerted. Tier 2 acks: acknowledged, others told who owns it."""
    s, now, fx = make("escalating")
    assert s.alerted == ["a"]

    now, f = advance_until(s, now, lambda s: "b" in s.alerted, limit=ACK + 3)
    fx += f
    assert s.state == "escalating"
    assert len(to(fx, "a", "alert")) == 1, "tier 1 is not re-alerted yet"
    for who in ["b", "c"]:
        alerts = to(f, who, "alert")
        assert len(alerts) == 1
        assert alerts[0].data["user_id"] == "u"
        assert alerts[0].data["card"] == card_for("manual")
    assert to(fx, "d") == [], "tier 3 not alerted yet"
    assert s.alerted == ["a", "b", "c"]

    ack_fx = send(s, Ack("b"), now)
    assert s.state == "acknowledged"
    assert s.acknowledged_by == "b"
    assert s.deadline is None
    assert recipients(ack_fx, "owner") == {"a", "c"}
    for e in to(ack_fx, "a", "owner") + to(ack_fx, "c", "owner"):
        assert e.data == {"user_id": "u", "acknowledged_by": "b"}
    assert to(ack_fx, "b") == []
    assert recipients(others(ack_fx)) == {"a", "c"}

    # Acknowledged means the escalation stops for good.
    now, later = advance(s, now, 300)
    assert s.state == "acknowledged"
    assert others(later) == []
    assert to(later, "d") == []
    assert view_for(s, "b")["acknowledged_by"] == "b"
    assert view_for(s, "a")["acknowledged_by"] == "b"


# ---------- 6. False alarm ----------

@pytest.mark.parametrize("state", ["escalating", "acknowledged"])
def test_6_false_alarm_user_resolves(state):
    """User cancels with the correct PIN: resolved, contacts told, location stops."""
    s, now, _ = make(state)
    send(s, LocationUpdate(LAT, LNG), now)
    alerted = list(s.alerted)
    assert alerted

    fx = send(s, Resolve(U, PIN), now)
    assert s.state == "resolved"
    assert s.screen == "ended_true"
    assert s.location is None
    assert s.wrong_pins == 0
    assert recipients(fx, "resolved") == set(alerted)
    for e in to(fx, alerted[0], "resolved"):
        assert e.data["user_id"] == "u"
    assert recipients(others(fx)) == set(alerted), "only people who were alerted hear about it"
    for who in EVERYONE_ELSE:
        assert view_for(s, who) == INACTIVE
    assert view_for(s, U)["state"] == "armed"


def test_6_false_alarm_acknowledging_contact_resolves():
    """Only the contact who acked can resolve. Another alerted contact is ignored."""
    s, now, _ = make("escalating")
    now, _ = advance_until(s, now, lambda s: "b" in s.alerted, limit=ACK + 3)
    send(s, Ack("b"), now)
    send(s, LocationUpdate(LAT, LNG), now)

    assert send(s, Resolve("c"), now) == []
    assert s.state == "acknowledged"

    fx = send(s, Resolve("b"), now)
    assert s.state == "resolved"
    assert s.location is None
    assert recipients(fx, "resolved") == {"a", "b", "c"}
    assert recipients(others(fx)) == {"a", "b", "c"}
    for who in EVERYONE_ELSE:
        assert view_for(s, who) == INACTIVE


def test_6_wrong_pin_fake_ending():
    """1st wrong PIN: plain retry, nobody told. 2nd+: fake ended screen, contacts warned, alert goes on."""
    s, now, _ = make("escalating")
    now, _ = advance_until(s, now, lambda s: "b" in s.alerted, limit=ACK + 3)
    alerted = list(s.alerted)
    views_before = {w: view_for(s, w) for w in EVERYONE_ELSE}

    fx = send(s, Resolve(U, "0000"), now)
    assert flat(fx) == [(U, "screen", {"screen": "pin_retry"})]
    assert s.state == "escalating"
    assert s.screen == "pin_retry"
    assert {w: view_for(s, w) for w in EVERYONE_ELSE} == views_before

    for _ in range(2):  # second and third wrong PIN behave the same
        fx = send(s, Resolve(U, "9999"), now)
        assert flat(to(fx, U)) == [(U, "screen", {"screen": "ended_fake"})]
        assert recipients(others(fx), "wrong_pin_warning") == set(alerted)
        assert recipients(others(fx)) == set(alerted)
        for e in others(fx):
            assert e.data["user_id"] == "u"
        assert s.state == "escalating"
        assert s.screen == "ended_fake"
        # The watcher sees a calm armed screen; contacts still see a live alert.
        assert view_for(s, U)["state"] == "armed"
        for who in alerted:
            assert view_for(s, who)["active"] is True

    # The alert really keeps going: next tier still gets alerted.
    now, f = advance_until(s, now, lambda s: "d" in s.alerted, limit=ACK + 3)
    assert len(to(f, "d", "alert")) == 1
    assert s.state == "escalating"

    # The true PIN still works afterwards.
    send(s, Resolve(U, PIN), now)
    assert s.state == "resolved"
    assert s.screen == "ended_true"
    assert s.wrong_pins == 0


# ---------- 7. Privacy ----------

def test_7_privacy():
    """Location and details reach only permitted people, only during an active alert."""
    # Armed, asking, waiting: a stored location is visible to nobody.
    for state in ["armed", "asking", "waiting"]:
        s, now, _ = make(state)
        send(s, LocationUpdate(LAT, LNG), now)
        for who in EVERYONE_ELSE:
            assert view_for(s, who) == INACTIVE, (state, who)
        assert set(view_for(s, U)) == {"state", "screen", "deadline"}

    # share_location_with = "alerted": every alerted contact sees it, nobody else does.
    s, now, fx = make("escalating", share_location_with="alerted")
    send(s, LocationUpdate(LAT, LNG), now)
    assert tuple(view_for(s, "a")["location"]) == (LAT, LNG)
    for who in ["b", "c", "d", "x", "y", "g1", "g2", "stranger"]:
        assert view_for(s, who) == INACTIVE
    now, f = advance_until(s, now, lambda s: "b" in s.alerted, limit=ACK + 3)
    fx += f
    for who in ["a", "b", "c"]:
        assert tuple(view_for(s, who)["location"]) == (LAT, LNG)
    for who in ["d", "x", "y", "g1", "g2", "stranger"]:
        assert view_for(s, who) == INACTIVE
    # Location never travels inside the alert effect, only through the filtered view.
    for e in fx:
        if e.kind == "alert":
            assert "location" not in e.data

    # Resolved: location is gone for everyone, and a late update stays hidden.
    send(s, Resolve(U, PIN), now)
    for who in EVERYONE_ELSE:
        assert view_for(s, who) == INACTIVE
    send(s, LocationUpdate(LAT, LNG), now)
    for who in EVERYONE_ELSE:
        assert view_for(s, who) == INACTIVE

    # share_location_with = "acknowledger": only the contact who took it sees location.
    s, now, _ = make("escalating", share_location_with="acknowledger")
    now, _ = advance_until(s, now, lambda s: "b" in s.alerted, limit=ACK + 3)
    send(s, LocationUpdate(LAT, LNG), now)
    for who in ["a", "b", "c"]:
        v = view_for(s, who)
        assert v["active"] is True
        assert v["location"] is None, f"{who} must not see location before anyone acks"
    send(s, Ack("b"), now)
    assert tuple(view_for(s, "b")["location"]) == (LAT, LNG)
    for who in ["a", "c"]:
        v = view_for(s, who)
        assert v["active"] is True and v["acknowledged_by"] == "b"
        assert v["location"] is None
    for who in ["d", "x", "y", "g1", "g2", "stranger"]:
        assert view_for(s, who) == INACTIVE
    send(s, Resolve("b"), now)
    for who in EVERYONE_ELSE:
        assert view_for(s, who) == INACTIVE

    # Duress: only duress contacts see anything; group members never see it, and
    # nothing in the user's own view mentions it.
    s, now, fx = make("duress", share_location_with="alerted")
    send(s, LocationUpdate(LAT, LNG), now)
    v = view_for(s, "x")
    assert v["active"] is True and v["kind"] == "duress"
    assert tuple(v["location"]) == (LAT, LNG)
    for who in GROUP + ["d", "y", "stranger"]:
        assert view_for(s, who) == INACTIVE
    now, f = advance(s, now, 100)
    for who in GROUP + ["d", "stranger"]:
        assert view_for(s, who) == INACTIVE
        assert to(fx + f, who) == []
    assert not has_word(view_for(s, U))
    send(s, Resolve(U, PIN), now)
    for who in EVERYONE_ELSE:
        assert view_for(s, who) == INACTIVE
