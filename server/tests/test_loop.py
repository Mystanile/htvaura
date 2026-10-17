"""Edge transitions from "Rules beyond the state table" in PLAN.md. Written from the spec only."""
import copy
import json

import pytest

from helpers import (
    ACK, EVERYONE_ELSE, GROUP, INACTIVE, PIN, U,
    advance, advance_until, flat, has_word, make, others, recipients, send, start, ticks, to,
)
from kaze.cards import card_for
from kaze.loop import (
    Ack, ConfirmOk, Disconnect, Duress, Leave, LocationUpdate, Reconnect, Resolve, Tick,
    Trigger, view_for,
)

NON_ARMED = ["asking", "waiting", "escalating", "acknowledged", "duress"]


def assert_ignored(s, event, now):
    """An ignored event changes nothing and sends nothing."""
    before = copy.deepcopy(s)
    view_before = view_for(s, U)
    assert send(s, event, now) == []
    assert s == before
    assert view_for(s, U) == view_before


# ---------- ignored events ----------

@pytest.mark.parametrize("state", ["asking", "waiting", "escalating", "acknowledged"])
def test_trigger_ignored_unless_armed(state):
    """Trigger only works in armed. (A hidden alert runs a shadow check, see the twin tests.)"""
    s, now, _ = make(state)
    assert_ignored(s, Trigger("separation"), now)


def test_ack_from_non_alerted_contact_ignored():
    s, now, _ = make("escalating")  # only "a" is alerted
    for who in ["b", "c", "d", "x", "y", "g1", "stranger", U]:
        assert_ignored(s, Ack(who), now)
    assert s.state == "escalating"
    assert s.acknowledged_by is None

    s, now, _ = make("duress")  # only "x" is alerted
    for who in ["y", "a", "g1", "stranger"]:
        assert_ignored(s, Ack(who), now)
    assert s.acknowledged_by is None

    for state in ["armed", "asking", "waiting"]:  # nobody is alerted yet
        s, now, _ = make(state)
        assert_ignored(s, Ack("a"), now)


def test_unauthorized_resolve_ignored():
    # escalating, nobody has acked: no contact may resolve, not even with the right PIN.
    s, now, _ = make("escalating")
    for event in [Resolve("a"), Resolve("a", PIN), Resolve("b"), Resolve("g1"), Resolve("stranger", PIN)]:
        assert_ignored(s, event, now)

    # acknowledged by b: other alerted contacts and outsiders may not resolve.
    s, now, _ = make("escalating")
    now, _ = advance_until(s, now, lambda s: "b" in s.alerted, limit=ACK + 3)
    send(s, Ack("b"), now)
    for event in [Resolve("a"), Resolve("c"), Resolve("a", PIN), Resolve("d"), Resolve("g1")]:
        assert_ignored(s, event, now)

    # duress: only contacts from duress_contacts may resolve (not group, not tier contacts).
    s, now, _ = make("duress")
    for event in [Resolve("g1"), Resolve("a"), Resolve("a", PIN), Resolve("d"), Resolve("stranger", PIN)]:
        assert_ignored(s, event, now)

    # Not an alert yet: Resolve does nothing, even the user with the right or a wrong PIN.
    for state in ["armed", "asking", "waiting"]:
        s, now, _ = make(state)
        for event in [Resolve(U, PIN), Resolve(U, "0000"), Resolve("a"), Resolve("x")]:
            assert_ignored(s, event, now)


@pytest.mark.parametrize("state", ["escalating", "acknowledged"])
def test_confirm_ok_ignored_during_alert(state):
    """Once contacts are alerted, only the PIN ends it. A tap on ok does nothing."""
    s, now, _ = make(state)
    assert_ignored(s, ConfirmOk(), now)


def test_confirm_ok_cannot_end_duress():
    s, now, _ = make("duress")
    view = view_for(s, U)
    fx = send(s, ConfirmOk(), now)
    assert s.state == "duress"
    assert others(fx) == []
    assert view_for(s, U) == view


# ---------- duress is silent and separate ----------

def test_duress_ack_and_resolve_by_duress_contact():
    s, now, _ = make("duress")
    assert s.alerted == ["x"]
    now, _ = advance_until(s, now, lambda s: "y" in s.alerted, limit=ACK + 3)

    fx = send(s, Ack("y"), now)
    assert s.state == "duress"
    assert s.acknowledged_by == "y"
    assert s.deadline is None
    assert recipients(fx) == {"x"}
    assert to(fx, "x", "owner")[0].data == {"user_id": "u", "acknowledged_by": "y"}

    # Acknowledged: no re-alert no matter how long we wait.
    now, later = advance(s, now, 200)
    assert s.state == "duress"
    assert later == []

    fx = send(s, Resolve("y"), now)
    assert s.state == "resolved"
    assert recipients(fx, "resolved") == {"x", "y"}
    assert recipients(others(fx)) <= {"x", "y"}
    for who in GROUP + ["d"]:
        assert to(fx, who) == []


def test_any_duress_contact_can_resolve_even_if_not_yet_alerted():
    s, now, _ = make("duress")
    assert s.alerted == ["x"]
    send(s, LocationUpdate(1.0, 2.0), now)
    fx = send(s, Resolve("y"), now)
    assert s.state == "resolved"
    assert s.location is None
    assert to(fx, "x", "resolved")
    for who in GROUP + ["d"]:
        assert to(fx, who) == []


def test_duress_wrong_pin_warns_duress_contacts_only():
    s, now, _ = make("duress")
    now, _ = advance_until(s, now, lambda s: "y" in s.alerted, limit=ACK + 3)

    fx = send(s, Resolve(U, "0000"), now)
    assert flat(fx) == [(U, "screen", {"screen": "pin_retry"})]
    assert s.state == "duress"

    fx = send(s, Resolve(U, "0000"), now)
    assert flat(to(fx, U)) == [(U, "screen", {"screen": "ended_fake"})]
    assert recipients(others(fx), "wrong_pin_warning") == {"x", "y"}
    assert recipients(others(fx)) == {"x", "y"}
    assert s.state == "duress"
    assert view_for(s, U)["state"] == "armed"
    for who in GROUP + ["d"]:
        assert to(fx, who) == []
        assert view_for(s, who) == INACTIVE

    fx = send(s, Resolve(U, PIN), now)
    assert s.state == "resolved"
    assert s.wrong_pins == 0
    assert recipients(others(fx)) == {"x", "y"}
    assert recipients(fx, "resolved") == {"x", "y"}


@pytest.mark.parametrize("start_state", ["armed", "asking", "waiting"])
def test_duress_user_view_identical_to_confirm_ok(start_state):
    s, now, _ = make(start_state)
    twin, tnow, _ = make("asking" if start_state == "armed" else start_state)
    assert now == tnow  # both sessions are driven the same way, so same fake time

    send(s, Duress(), now)
    send(twin, ConfirmOk(), tnow)
    assert view_for(s, U) == view_for(twin, U)

    # Later on the state and deadline stay indistinguishable too.
    for (t1, _), (t2, _) in zip(ticks(s, now, 120), ticks(twin, tnow, 120)):
        a, b = view_for(s, U), view_for(twin, U)
        assert a["state"] == b["state"] == "armed"
        assert a["deadline"] == b["deadline"] is None


@pytest.mark.parametrize("start_state", ["armed", "asking", "waiting"])
def test_duress_effects_to_user_identical_to_confirm_ok(start_state):
    s, now, _ = make(start_state)
    twin, tnow, _ = make("asking" if start_state == "armed" else start_state)
    assert now == tnow

    fx = send(s, Duress(), now)
    fx_ok = send(twin, ConfirmOk(), tnow)

    assert flat(to(fx, U)) == flat(fx_ok) == [(U, "screen", {"screen": "thanks"})]
    # Exactly one silent alert to duress contact 1, nobody else.
    assert flat(others(fx))[0][:2] == ("x", "alert")
    assert len(others(fx)) == 1
    assert s.state == "duress"


def test_word_duress_never_in_user_view_or_user_effects():
    def check(s, fx):
        assert not has_word(view_for(s, U)), view_for(s, U)
        assert not has_word(flat(to(fx, U))), flat(to(fx, U))
        for who in GROUP + ["d"]:
            assert not has_word(view_for(s, who))

    s, now, fx = make("duress")
    check(s, fx)
    for now, f in ticks(s, now, 80):
        check(s, f)
    check(s, send(s, Ack("x"), now))
    check(s, send(s, LocationUpdate(1.0, 2.0), now))
    check(s, send(s, Resolve(U, "0000"), now))
    check(s, send(s, Resolve(U, "0000"), now))
    check(s, send(s, Resolve(U, PIN), now))
    check(s, send(s, Tick(), now + 1))

    s, now, fx = make("duress")
    check(s, send(s, Leave(), now))
    for now, f in ticks(s, now, 80):
        check(s, f)


# ---------- re-alert after the last tier ----------

def test_realert_all_tiers_after_last_tier():
    s, now, _ = make("escalating")
    rounds = []  # (time, effects) for each tick after tier 3 where alerts go out
    d_seen = False
    for now, fx in ticks(s, now, 200):
        alerts = [e for e in fx if e.kind == "alert"]
        if "d" in recipients(alerts):
            if not d_seen:
                d_seen = True
                continue  # this is tier 3 itself
        if d_seen and alerts:
            rounds.append((now, alerts))

    assert len(rounds) >= 2, "expected repeated re-alert rounds after the last tier"
    for _, alerts in rounds:
        assert sorted(e.to for e in alerts) == ["a", "b", "c", "d"], "every contact in every tier, once each"
        for e in alerts:
            assert e.data["user_id"] == "u"
            assert e.data["kind"] == "manual"
            assert e.data["card"] == card_for("manual")
    gap = rounds[1][0] - rounds[0][0]
    assert ACK - 1 <= gap <= ACK + 2, "ack timer restarts after each round"
    assert s.state == "escalating"
    assert s.alerted == ["a", "b", "c", "d"], "no duplicates in alerted"
    assert s.deadline is not None and s.deadline > now - 1


def test_realert_all_duress_contacts_after_last():
    s, now, fx = make("duress")
    rounds = []
    y_seen = False
    all_fx = list(fx)
    for now, f in ticks(s, now, 120):
        all_fx += f
        alerts = [e for e in f if e.kind == "alert"]
        if "y" in recipients(alerts) and not y_seen:
            y_seen = True
            continue
        if y_seen and alerts:
            rounds.append(alerts)
    assert len(rounds) >= 2
    for alerts in rounds:
        assert sorted(e.to for e in alerts) == ["x", "y"]
        assert all(e.data["kind"] == "duress" for e in alerts)
    assert s.state == "duress"
    assert s.alerted == ["x", "y"]
    for who in GROUP + ["d", "stranger"]:
        assert to(all_fx, who) == []


# ---------- Leave ----------

@pytest.mark.parametrize("state", ["armed", "asking", "waiting"])
def test_leave_before_alert_ends_session_and_tells_group_only(state):
    s, now, _ = make(state)
    fx = send(s, Leave(), now)
    assert s.state == "ended"
    assert recipients(others(fx), "left") == set(GROUP)
    assert recipients(others(fx)) == set(GROUP), "only group members hear anything"
    for e in others(fx):
        assert e.data == {"user_id": "u"}
    assert view_for(s, U)["state"] == "ended"
    # The old countdown must not wake up and escalate.
    now, later = advance(s, now, 200)
    assert s.state == "ended"
    assert others(later) == []


def test_leave_during_duress_keeps_alert_running_silently():
    s, now, _ = make("duress")
    fx = send(s, Leave(), now)
    assert s.left is True
    assert s.state == "duress"
    assert view_for(s, U)["state"] == "ended"
    assert recipients(others(fx), "left") == set(GROUP)
    for who in GROUP:
        assert [e.kind for e in to(fx, who)] == ["left"], "group learns only that the user left"
    assert recipients(others(fx)) <= set(GROUP) | {"x", "y"}
    assert to(fx, "d") == []

    now, later = advance_until(s, now, lambda s: "y" in s.alerted, limit=ACK + 3)
    assert len(to(later, "y", "alert")) == 1, "duress escalation continues after Leave"
    for who in GROUP + ["d"]:
        assert to(later, who) == []
    assert not has_word(view_for(s, U))


@pytest.mark.parametrize("state", ["escalating", "acknowledged"])
def test_leave_ignored_until_pin_cancels_alert(state):
    s, now, _ = make(state)
    assert_ignored(s, Leave(), now)
    assert s.left is False


# ---------- night end ----------

@pytest.mark.parametrize("state", ["escalating", "acknowledged", "duress"])
def test_night_end_never_ends_active_alert(state):
    s, now, _ = make(state, night_ends_at=100.0)
    now, _ = advance(s, now, 300)  # far past 100
    assert s.state == state
    # A hidden alert runs on, but the user view shows the night as ended (like an ok user's).
    assert (view_for(s, U)["state"] == "ended") == (state == "duress")
    # Resolve works, and only then does the night end on the next tick.
    send(s, Resolve(U, PIN), now)
    assert s.state == "resolved"
    send(s, Tick(), now + 1)
    assert s.state == "ended"
    assert view_for(s, U)["state"] == "ended"


def test_night_end_ends_armed_session_with_only_left_effects():
    s, now, _ = make("armed", night_ends_at=100.0)
    now, fx = advance(s, now, 99)
    assert s.state == "armed" and fx == []
    now, fx = advance(s, now, 5)
    assert s.state == "ended"
    assert {e.kind for e in others(fx)} == {"left"}
    assert recipients(others(fx)) == set(GROUP)
    assert len(others(fx)) == len(GROUP)
    now, fx = advance(s, now, 50)
    assert s.state == "ended" and others(fx) == []


# ---------- resolved -> armed ----------

def test_resolved_returns_to_armed_on_next_tick_and_next_alert_is_fresh():
    s, now, _ = make("acknowledged")
    send(s, Resolve(U, PIN), now)
    assert s.state == "resolved"
    assert view_for(s, U)["state"] == "armed"

    fx = send(s, Tick(), now + 1)
    now += 1
    assert s.state == "armed"
    assert others(fx) == []
    assert view_for(s, "a") == INACTIVE

    # A new alert starts over at tier 1; nothing stale from the last one.
    send(s, Trigger("home_by"), now)
    assert s.state == "asking"
    assert s.acknowledged_by is None
    now, fx = advance_until(s, now, lambda s: s.state == "escalating", limit=60)
    assert recipients(others(fx), "alert") == {"a"}
    assert to(fx, "a", "alert")[0].data["kind"] == "home_by"
    assert s.alerted == ["a"]
    assert view_for(s, "b") == INACTIVE


def test_resolved_state_does_not_resend_resolved_on_tick():
    s, now, _ = make("escalating")
    send(s, Resolve(U, PIN), now)
    fx = send(s, Tick(), now + 1)
    assert others(fx) == []


# ---------- location and wrong PIN bookkeeping ----------

@pytest.mark.parametrize("state,resolver", [
    ("escalating", lambda: Resolve(U, PIN)),
    ("acknowledged", lambda: Resolve(U, PIN)),
    ("acknowledged", lambda: Resolve("a")),
    ("duress", lambda: Resolve(U, PIN)),
    ("duress", lambda: Resolve("y")),
])
def test_location_cleared_on_resolve(state, resolver):
    s, now, _ = make(state)
    send(s, LocationUpdate(43.0, -79.0), now)
    assert s.location is not None
    send(s, resolver(), now)
    assert s.state == "resolved"
    assert s.location is None
    for who in EVERYONE_ELSE:
        assert view_for(s, who) == INACTIVE


def test_wrong_pin_counter_resets_after_alert_ends():
    s, now, _ = make("escalating")
    send(s, Resolve(U, "0000"), now)
    send(s, Resolve(U, "0000"), now)
    assert s.wrong_pins == 2
    send(s, Resolve(U, PIN), now)
    assert s.wrong_pins == 0
    send(s, Tick(), now + 1)
    now += 1
    assert s.state == "armed"

    send(s, Trigger("manual"), now)
    now, _ = advance_until(s, now, lambda s: s.state == "escalating", limit=60)
    fx = send(s, Resolve(U, "0000"), now)
    assert flat(fx) == [(U, "screen", {"screen": "pin_retry"})], "first wrong PIN of a new alert is a retry again"


# ---------- connection and location events ----------

@pytest.mark.parametrize("state", ["armed", "asking", "escalating", "duress"])
def test_disconnect_reconnect_only_flip_connected(state):
    s, now, _ = make(state)
    before = copy.deepcopy(s)
    assert send(s, Disconnect(), now) == []
    before.connected = False
    assert s == before
    assert send(s, Reconnect(), now) == []
    before.connected = True
    assert s == before


@pytest.mark.parametrize("state", ["armed", "asking", "escalating", "duress"])
def test_location_update_only_stores_location(state):
    s, now, _ = make(state)
    before = copy.deepcopy(s)
    assert send(s, LocationUpdate(43.1, -79.2), now) == []
    assert tuple(s.location) == (43.1, -79.2)
    s.location = before.location
    assert s == before


# ---------- other small checks ----------

def test_confirm_ok_sends_exactly_one_effect_and_clears_deadline():
    for state in ["asking", "waiting"]:
        s, now, _ = make(state)
        fx = send(s, ConfirmOk(), now)
        assert flat(fx) == [(U, "screen", {"screen": "thanks"})]
        assert s.state == "armed"
        assert s.deadline is None
        assert s.screen == "thanks"
        assert view_for(s, U)["deadline"] is None


def test_user_view_deadline_only_in_asking_and_waiting():
    for state in ["armed", "escalating", "acknowledged", "duress", "resolved"]:
        s, now, _ = make(state)
        assert view_for(s, U)["deadline"] is None, state
    for state in ["asking", "waiting"]:
        s, now, _ = make(state)
        assert view_for(s, U)["deadline"] is not None, state
        assert view_for(s, U)["deadline"] > now - 1, state


def test_view_for_user_is_json_serializable():
    s, now, _ = make("escalating")
    json.dumps(view_for(s, U))
    json.dumps(view_for(s, "a"))
    json.dumps(view_for(s, "b"))


# ---------- Resolve needs a real, matching contact ----------

@pytest.mark.parametrize("state", ["escalating", "acknowledged", "duress"])
def test_resolve_by_none_ignored(state):
    """Before: Resolve(None) matched acknowledged_by=None in escalating and ended the alert."""
    s, now, _ = make(state)
    if state == "duress":
        s.acknowledged_by = None
    assert_ignored(s, Resolve(None), now)
    assert_ignored(s, Resolve(None, PIN), now)
    assert s.state == state


# ---------- hidden alerts: the user sees what an ok twin sees ----------

def hidden_pair(kind, **over):
    """(hidden session, ok twin, now). The twin never had an alert."""
    if kind == "duress":
        s, now, _ = make("asking", **over)
        t, _, _ = make("asking", **over)
        send(s, Duress(), now)
        send(t, ConfirmOk(), now)
    else:  # ended_fake: the watcher saw a fake "Alert ended"
        s, now, _ = make("escalating", **over)
        send(s, Resolve(U, "0000"), now)
        send(s, Resolve(U, "0000"), now)
        t, _ = start(**over)
        t.screen = "ended_fake"
    assert s.screen == t.screen
    assert view_for(s, U) == view_for(t, U)
    return s, t, now


def user_side(fx):
    """What the user's phone and the group can see: user effects and left."""
    return flat([e for e in fx if e.to == U or e.kind == "left"])


def both(s, t, event, now):
    """Same event to both. User-side effects and user views must match. Returns the hidden effects."""
    fx = send(s, event, now)
    assert user_side(fx) == user_side(send(t, event, now)), event
    assert view_for(s, U) == view_for(t, U), event
    return fx


def both_ticks(s, t, now, seconds):
    out = []
    for _ in range(seconds):
        now += 1.0
        out += both(s, t, Tick(), now)
    return now, out


KINDS = ["duress", "ended_fake"]


@pytest.mark.parametrize("kind", KINDS)
def test_twin_shadow_check_runs_to_alert_active(kind):
    s, t, now = hidden_pair(kind)
    fx = both(s, t, Trigger("periodic"), now)
    assert flat(to(fx, U)) == [(U, "check", {"kind": "periodic", "deadline": now + 30})]
    assert s.screen == "asking" and s.user_deadline == now + 30
    assert view_for(s, U) == {"state": "asking", "screen": "asking", "deadline": now + 30}
    start_t = now
    now, _ = both_ticks(s, t, now, 31)
    assert s.screen == "alarm" and s.user_deadline == start_t + 45
    assert view_for(s, U) == {"state": "waiting", "screen": "alarm", "deadline": start_t + 45}
    now, fx = both_ticks(s, t, now, 15)
    assert s.screen == "alert_active" and s.user_deadline is None
    assert view_for(s, U) == {"state": "escalating", "screen": "alert_active", "deadline": None}
    assert user_side(send(s, Trigger("manual"), now)) == []  # no new check while the alert shows
    now, _ = both_ticks(s, t, now, 100)
    assert s.state == ("duress" if kind == "duress" else "escalating")  # real alert still running


@pytest.mark.parametrize("kind", KINDS)
def test_twin_shadow_big_tick_skip_catches_up(kind):
    s, t, now = hidden_pair(kind)
    both(s, t, Trigger("manual"), now)
    both(s, t, Tick(), now + 500)
    assert s.screen == "alert_active" and s.user_deadline is None


@pytest.mark.parametrize("kind", KINDS)
@pytest.mark.parametrize("wait", [5, 35])
@pytest.mark.parametrize("answer", [ConfirmOk(), Duress()])
def test_twin_shadow_check_answered(kind, wait, answer):
    s, t, now = hidden_pair(kind)
    both(s, t, Trigger("home_by"), now)
    now, _ = both_ticks(s, t, now, wait)
    fx = both(s, t, answer, now)
    assert flat(to(fx, U)) == [(U, "screen", {"screen": "thanks"})]
    assert s.screen == "thanks" and s.user_deadline is None
    now, _ = both_ticks(s, t, now, 100)
    assert view_for(s, U)["state"] == "armed"
    both(s, t, Trigger("separation"), now)  # and a second check works


def test_shadow_never_alerts_a_contact():
    s, t, now = hidden_pair("duress")
    both(s, t, Trigger("manual"), now)
    now, fx = both_ticks(s, t, now, 150)
    for who in GROUP + ["d"]:
        assert to(fx, who) == []
    assert recipients(others(fx), "alert") <= {"x", "y"}
    assert s.alerted == ["x", "y"] and s.alert_kind == "duress"

    s, t, now = hidden_pair("ended_fake")
    kinds_before = s.alert_kind
    both(s, t, Trigger("separation"), now)
    both_ticks(s, t, now, 150)
    assert s.alert_kind == kinds_before == "manual"  # the shadow kind never reaches contacts
    assert s.state == "escalating"


@pytest.mark.parametrize("kind", KINDS)
def test_twin_leave(kind):
    s, t, now = hidden_pair(kind)
    both_ticks(s, t, now, 3)
    fx = both(s, t, Leave(), now)
    assert recipients(others(fx), "left") == set(GROUP)
    assert s.left is True
    assert view_for(s, U)["state"] == "ended"
    both(s, t, Trigger("manual"), now)
    both_ticks(s, t, now, 100)
    assert view_for(s, U)["state"] == "ended"
    assert s.state == ("duress" if kind == "duress" else "escalating")  # alert keeps running
    assert to(send(s, Leave(), now), "g1") == []  # second leave ignored


@pytest.mark.parametrize("kind", KINDS)
def test_twin_leave_during_shadow_check(kind):
    s, t, now = hidden_pair(kind)
    both(s, t, Trigger("manual"), now)
    both(s, t, Leave(), now + 1)
    assert view_for(s, U) == {"state": "ended", "screen": "asking", "deadline": None}
    both_ticks(s, t, now + 1, 100)  # the shadow does not run on after leaving


@pytest.mark.parametrize("kind", KINDS)
def test_twin_night_end(kind):
    s, t, now = hidden_pair(kind, night_ends_at=400.0)
    now, _ = both_ticks(s, t, now, 340 - int(now))
    now, fx = both_ticks(s, t, now, 80)
    assert s.left is True
    assert recipients(others(fx), "left") == set(GROUP)
    assert len([e for e in fx if e.kind == "left"]) == len(GROUP)
    assert view_for(s, U)["state"] == "ended"
    assert s.state == ("duress" if kind == "duress" else "escalating")
    now, fx = both_ticks(s, t, now, 50)
    assert [e for e in fx if e.kind == "left"] == []  # only once


@pytest.mark.parametrize("kind", KINDS)
def test_twin_night_end_waits_for_shadow_check(kind):
    s, t, now = hidden_pair(kind, night_ends_at=400.0)
    now, _ = both_ticks(s, t, now, 380 - int(now))
    both(s, t, Trigger("manual"), now)
    now, _ = both_ticks(s, t, now, 25)  # night is over but the check is still asking
    assert s.left is False and view_for(s, U)["state"] == "asking"
    both(s, t, ConfirmOk(), now)
    both_ticks(s, t, now, 2)
    assert s.left is True and view_for(s, U)["state"] == "ended"


def hidden_contact_resolver(kind, s, now):
    """Return the contact who may resolve this hidden alert."""
    if kind == "duress":
        return "y"
    send(s, Ack("a"), now)
    return "a"


@pytest.mark.parametrize("kind", KINDS)
def test_twin_contact_resolve_sends_nothing_to_user(kind):
    s, t, now = hidden_pair(kind)
    now, _ = both_ticks(s, t, now, 4)
    who = hidden_contact_resolver(kind, s, now)
    screen = s.screen
    fx = both(s, t, Resolve(who), now)
    assert s.state == "resolved"
    assert to(fx, U) == []
    assert s.screen == screen
    assert recipients(fx, "resolved")  # the contacts are told
    now, _ = both_ticks(s, t, now, 3)  # resolved -> armed keeps the screen
    assert s.state == "armed" and s.screen == screen
    both(s, t, Trigger("manual"), now)  # nothing hidden any more: a real check
    assert s.state == "asking"


@pytest.mark.parametrize("kind", KINDS)
def test_twin_contact_resolve_after_leave_stays_ended(kind):
    s, t, now = hidden_pair(kind)
    both(s, t, Leave(), now)
    both(s, t, Resolve(hidden_contact_resolver(kind, s, now)), now)
    assert view_for(s, U)["state"] == "ended"
    both_ticks(s, t, now, 3)
    assert s.state == "ended" and view_for(s, U)["state"] == "ended"


@pytest.mark.parametrize("kind", KINDS)
def test_user_correct_pin_after_hidden_still_ends_true(kind):
    s, t, now = hidden_pair(kind)
    fx = send(s, Resolve(U, PIN), now)
    assert flat(to(fx, U)) == [(U, "screen", {"screen": "ended_true"})]
    assert s.state == "resolved" and s.screen == "ended_true"
    assert s.user_deadline is None


def test_ended_fake_alert_can_still_be_acked_and_resolved_by_contact():
    """Ack and resolve work on the real alert even while the user sees the fake end."""
    s, now, _ = make("escalating")
    send(s, Resolve(U, "0000"), now)
    send(s, Resolve(U, "0000"), now)
    send(s, Ack("a"), now)
    assert s.state == "acknowledged"
    assert view_for(s, U)["state"] == "armed"
    assert_ignored(s, Resolve("b"), now)
    assert_ignored(s, Resolve(None), now)
    send(s, Resolve("a"), now)
    assert s.state == "resolved"
