"""Edge transitions from "Rules beyond the state table" in PLAN.md. Written from the spec only."""
import copy
import json

import pytest

from helpers import (
    ACK, ASK, EVERYONE_ELSE, GRACE, GROUP, INACTIVE, PIN, U,
    active, advance, advance_until, alert, flat, has_word, make, make_config, others, recipients, send, start, ticks, to,
)
from kaze.cards import card_for
from kaze.loop import (
    new_session,
    Ack, ConfirmOk, Disconnect, Duress, Leave, LocationUpdate, Reconnect, Resolve, Tick,
    Trigger, view_for,
)

LAT, LNG = 43.65, -79.38

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
    assert alert(s).acknowledged_by is None

    s, now, _ = make("duress")  # only "x" is alerted
    for who in ["y", "a", "g1", "stranger"]:
        assert_ignored(s, Ack(who), now)
    assert alert(s).acknowledged_by is None

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
    now, _ = advance_until(s, now, lambda s: "b" in alert(s).alerted, limit=ACK + 3)
    send(s, Ack("b"), now)
    for event in [Resolve("a"), Resolve("c"), Resolve("a", PIN), Resolve("d"), Resolve("g1")]:
        assert_ignored(s, event, now)

    # duress: only contacts from duress_contacts may resolve (not group, not tier contacts).
    s, now, _ = make("duress")
    for event in [Resolve("g1"), Resolve("a"), Resolve("a", PIN), Resolve("d"), Resolve("stranger", PIN)]:
        assert_ignored(s, event, now)

    # Not an alert yet: Resolve by a contact does nothing.
    for state in ["armed", "asking", "waiting"]:
        s, now, _ = make(state)
        for event in [Resolve("a"), Resolve("x")]:
            assert_ignored(s, event, now)


@pytest.mark.parametrize("state", ["armed", "asking", "waiting"])
def test_user_pin_without_alert_changes_only_the_screen(state):
    """The user can type the PIN at any time. With no alert it only changes the screen."""
    s, now, _ = make(state)
    state_before, deadline_before = s.state, s.deadline
    assert flat(send(s, Resolve(U, "0000"), now)) == [(U, "screen", {"screen": "pin_retry"})]
    assert flat(send(s, Resolve(U, "0000"), now)) == [(U, "screen", {"screen": "ended_fake"})]
    assert s.wrong_pins == 0
    assert flat(send(s, Resolve(U, PIN), now)) == [(U, "screen", {"screen": "ended_true"})]
    assert (s.state, s.deadline, s.alerts) == (state_before, deadline_before, [])


def test_user_pin_ignored_once_ended():
    s, now, _ = make("armed")
    send(s, Leave(), now)
    assert_ignored(s, Resolve(U, PIN), now)
    assert_ignored(s, Resolve(U, "0000"), now)


@pytest.mark.parametrize("state", ["escalating", "acknowledged"])
def test_confirm_ok_ignored_during_alert(state):
    """Once contacts are alerted, only the PIN ends it. A tap on ok does nothing."""
    s, now, _ = make(state)
    assert_ignored(s, ConfirmOk(), now)


def test_confirm_ok_cannot_end_duress():
    s, now, _ = make("duress")
    view = view_for(s, U)
    fx = send(s, ConfirmOk(), now)
    assert alert(s).state == "duress"
    assert others(fx) == []
    assert view_for(s, U) == view


# ---------- duress is silent and separate ----------

def test_duress_ack_and_resolve_by_duress_contact():
    s, now, _ = make("duress")
    assert alert(s).alerted == ["x"]
    now, _ = advance_until(s, now, lambda s: "y" in alert(s).alerted, limit=ACK + 3)

    fx = send(s, Ack("y"), now)
    assert alert(s).state == "duress"
    assert alert(s).acknowledged_by == "y"
    assert alert(s).deadline is None
    assert recipients(fx) == {"x"}
    assert to(fx, "x", "owner")[0].data == {"user_id": "u", "acknowledged_by": "y"}

    # Acknowledged: no re-alert no matter how long we wait.
    now, later = advance(s, now, 200)
    assert alert(s).state == "duress"
    assert later == []

    fx = send(s, Resolve("y"), now)
    assert active(s) == []
    assert recipients(fx, "resolved") == {"x", "y"}
    assert recipients(others(fx)) <= {"x", "y"}
    for who in GROUP + ["d"]:
        assert to(fx, who) == []


def test_any_duress_contact_can_resolve_even_if_not_yet_alerted():
    s, now, _ = make("duress")
    assert alert(s).alerted == ["x"]
    send(s, LocationUpdate(1.0, 2.0), now)
    fx = send(s, Resolve("y"), now)
    assert active(s) == []
    assert all(a.location is None for a in s.alerts)  # the alert forgets its position
    assert to(fx, "x", "resolved")
    for who in GROUP + ["d"]:
        assert to(fx, who) == []


def test_duress_wrong_pin_warns_duress_contacts_only():
    s, now, _ = make("duress")
    now, _ = advance_until(s, now, lambda s: "y" in alert(s).alerted, limit=ACK + 3)

    fx = send(s, Resolve(U, "0000"), now)
    assert flat(fx) == [(U, "screen", {"screen": "pin_retry"})]
    assert alert(s).state == "duress"

    fx = send(s, Resolve(U, "0000"), now)
    assert flat(to(fx, U)) == [(U, "screen", {"screen": "ended_fake"})]
    assert recipients(others(fx), "wrong_pin_warning") == {"x", "y"}
    assert recipients(others(fx)) == {"x", "y"}
    assert alert(s).state == "duress"
    assert view_for(s, U)["state"] == "armed"
    for who in GROUP + ["d"]:
        assert to(fx, who) == []
        assert view_for(s, who) == INACTIVE

    fx = send(s, Resolve(U, PIN), now)
    assert active(s) == []
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
    assert alert(s).state == "duress"


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
    assert alert(s).alerted == ["a", "b", "c", "d"], "no duplicates in alerted"
    assert alert(s).deadline is not None and alert(s).deadline > now - 1


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
    assert alert(s).state == "duress"
    assert alert(s).alerted == ["x", "y"]
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
    assert s.state == "ended"
    assert alert(s).state == "duress"
    assert view_for(s, U)["state"] == "ended"
    assert recipients(others(fx), "left") == set(GROUP)
    for who in GROUP:
        assert [e.kind for e in to(fx, who)] == ["left"], "group learns only that the user left"
    assert recipients(others(fx)) <= set(GROUP) | {"x", "y"}
    assert to(fx, "d") == []

    now, later = advance_until(s, now, lambda s: "y" in alert(s).alerted, limit=ACK + 3)
    assert len(to(later, "y", "alert")) == 1, "duress escalation continues after Leave"
    for who in GROUP + ["d"]:
        assert to(later, who) == []
    assert not has_word(view_for(s, U))


@pytest.mark.parametrize("state", ["escalating", "acknowledged"])
def test_leave_ignored_until_pin_cancels_alert(state):
    s, now, _ = make(state)
    assert_ignored(s, Leave(), now)
    assert s.state == state


# ---------- night end ----------

@pytest.mark.parametrize("state", ["escalating", "acknowledged", "duress"])
def test_night_end_never_ends_active_alert(state):
    s, now, _ = make(state, night_ends_at=100.0)
    now, _ = advance(s, now, 300)  # far past 100
    assert alert(s).state == state
    if state == "duress":
        # The front is armed, so it ends with the night. The hidden alert runs on.
        assert s.state == "ended" and view_for(s, U)["state"] == "ended"
        assert send(s, Resolve("y"), now)  # a duress contact ends it
        assert active(s) == []
    else:
        assert s.state == state
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
    assert s.front_alert is None
    now, fx = advance_until(s, now, lambda s: s.state == "escalating", limit=60)
    assert recipients(others(fx), "alert") == {"a"}
    assert to(fx, "a", "alert")[0].data["kind"] == "home_by"
    assert alert(s).alerted == ["a"]
    assert view_for(s, "b") == INACTIVE


def test_resolved_state_does_not_resend_resolved_on_tick():
    s, now, _ = make("escalating")
    send(s, Resolve(U, PIN), now)
    fx = send(s, Tick(), now + 1)
    assert others(fx) == []


# ---------- location and wrong PIN bookkeeping ----------

@pytest.mark.parametrize("state,resolver,front_ends", [
    ("escalating", lambda: Resolve(U, PIN), True),
    ("acknowledged", lambda: Resolve(U, PIN), True),
    ("acknowledged", lambda: Resolve("a"), True),
    ("duress", lambda: Resolve(U, PIN), True),
    ("duress", lambda: Resolve("y"), False),  # a hidden alert ends. The front keeps its own position.
])
def test_location_cleared_on_resolve(state, resolver, front_ends):
    s, now, _ = make(state)
    send(s, LocationUpdate(43.0, -79.0), now)
    assert s.location is not None and all(a.location is not None for a in active(s))
    send(s, resolver(), now)
    assert active(s) == []
    assert all(a.location is None for a in s.alerts)
    assert (s.location is None) == front_ends
    for who in EVERYONE_ELSE:
        assert view_for(s, who) == INACTIVE


def test_wrong_pin_counter_resets_after_alert_ends():
    s, now, _ = make("escalating")
    send(s, Resolve(U, "0000"), now)
    assert s.wrong_pins == 1
    send(s, Resolve(U, "0000"), now)  # the fake end counts as an end
    assert s.wrong_pins == 0
    send(s, Tick(), now + 1)
    now += 1
    assert s.state == "armed"
    assert alert(s).hidden is True  # and the real alert runs on

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
    assert all(tuple(a.location) == (43.1, -79.2) for a in active(s))
    s.location = before.location
    for a, b in zip(s.alerts, before.alerts):
        a.location = b.location
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
    assert_ignored(s, Resolve(None), now)
    assert_ignored(s, Resolve(None, PIN), now)
    assert alert(s).state == state


# ---------- hidden alerts ----------
# The twin tests in test_twin.py show the user cannot tell. These show the alerts themselves behave.

def hidden_session(kind, **over):
    """A session whose front is calm and whose alert is hidden. Returns (session, now, resolver).

    kind "duress": the user did the gesture. kind "fake": the user typed 2 wrong PINs in an alert.
    The resolver is a contact who may end the alert.
    """
    if kind == "duress":
        s, now, _ = make("asking", **over)
        send(s, Duress(), now)
        return s, now, "y"
    s, now, _ = make("escalating", **over)
    send(s, Resolve(U, "0000"), now)
    send(s, Resolve(U, "0000"), now)
    send(s, Ack("a"), now)
    return s, now, "a"


KINDS = ["duress", "fake"]


@pytest.mark.parametrize("kind", KINDS)
def test_hidden_alert_is_hidden_and_front_is_calm(kind):
    s, now, _ = hidden_session(kind)
    assert alert(s).hidden is True
    assert s.front_alert is None
    assert s.state in ("armed", "resolved")


def test_second_duress_does_not_start_a_second_alert():
    s, now, _ = hidden_session("duress")
    assert flat(send(s, Duress(), now)) == [(U, "screen", {"screen": "thanks"})]
    assert len(active(s)) == 1


def test_missed_check_while_hidden_alert_runs_escalates_to_the_normal_tiers():
    """A hidden alert does not hide or replace the next missed check-in."""
    s, now, _ = hidden_session("duress")
    send(s, Trigger("periodic"), now)
    now, fx = advance_until(s, now, lambda s: s.state == "escalating", limit=ASK + GRACE + 3)
    assert recipients(others(fx), "alert") >= {"a"}
    assert len(active(s)) == 2
    assert s.front_alert is not None and s.front_alert.hidden is False
    # Tier 1 sees the periodic alert. A duress contact still sees the duress alert.
    assert view_for(s, "a")["kind"] == "periodic"
    assert view_for(s, "x")["kind"] == "duress"
    for who in GROUP[:2] + ["d"]:
        assert view_for(s, who) == INACTIVE


@pytest.mark.parametrize("kind", KINDS)
def test_contact_resolve_of_hidden_alert_tells_the_user_nothing(kind):
    s, now, who = hidden_session(kind)
    view, screen = view_for(s, U), s.screen
    fx = send(s, Resolve(who), now)
    assert active(s) == []
    assert to(fx, U) == []
    assert recipients(fx, "resolved")
    assert (view_for(s, U), s.screen) == (view, screen)
    now, later = advance(s, now, 3)  # and the front still behaves the same
    assert s.state == "armed" and s.screen == screen


def test_fake_ended_alert_can_still_be_acked_and_resolved_by_contact():
    s, now, _ = make("escalating")
    send(s, Resolve(U, "0000"), now)
    send(s, Resolve(U, "0000"), now)
    send(s, Ack("a"), now)
    assert alert(s).state == "acknowledged"
    assert s.state == "resolved"  # the front is not touched
    assert_ignored(s, Resolve("b"), now)
    assert_ignored(s, Resolve(None), now)
    send(s, Resolve("a"), now)
    assert active(s) == []


def unacked(kind, **over):
    """A hidden alert nobody has acked yet. Returns (session, now, a contact it has not reached yet)."""
    if kind == "duress":
        s, now, _ = make("asking", **over)
        send(s, Duress(), now)
        return s, now, "y"
    s, now, _ = make("escalating", **over)
    send(s, Resolve(U, "0000"), now)
    send(s, Resolve(U, "0000"), now)
    return s, now, "d"


@pytest.mark.parametrize("kind", KINDS)
def test_hidden_alert_keeps_escalating_after_leave(kind):
    s, now, later_contact = unacked(kind)
    fx = send(s, Leave(), now)
    assert s.state == "ended" and view_for(s, U)["state"] == "ended"
    assert recipients(fx) == set(GROUP), "the group hears only that the user left"
    assert later_contact not in alert(s).alerted
    now, later = advance(s, now, 200)
    assert later_contact in alert(s).alerted
    assert alert(s).state != "resolved"
    assert view_for(s, later_contact)["active"] is True
    assert_ignored(s, Resolve(U, PIN), now)  # the front is ended, so the PIN does nothing
    assert view_for(s, U) == {"state": "ended", "screen": s.screen, "deadline": None}


@pytest.mark.parametrize("kind", KINDS)
def test_hidden_alert_keeps_escalating_after_night_end(kind):
    s, now, later_contact = unacked(kind, night_ends_at=100.0)
    now, fx = advance(s, now, 300)
    assert recipients(fx, "left") == set(GROUP)
    assert view_for(s, U)["state"] == "ended"
    assert later_contact in alert(s).alerted
    assert recipients(fx, "alert"), "alerts went on after the night ended"
    assert alert(s).state != "resolved"


def test_new_session_carries_hidden_alert_and_pin_resolves_it():
    s, now, _ = hidden_session("duress")
    send(s, LocationUpdate(LAT, LNG), now)
    send(s, Leave(), now)
    n = new_session(make_config(pin="9876"), now, carry=s)
    assert n.state == "armed" and n.alerts == s.alerts and n.location is None
    assert view_for(n, U) == {"state": "armed", "screen": "armed", "deadline": None}
    assert view_for(n, "x")["location"] == (LAT, LNG)
    now, later = advance(n, now, 120)  # it keeps escalating in the new session
    assert recipients(later, "alert") == {"x", "y"}
    # The new night's PIN looks right to the front but does not end the old night's alert.
    fx = send(n, Resolve(U, "9876"), now)
    assert flat(fx) == [(U, "screen", {"screen": "ended_true"})]
    assert len(active(n)) == 1 and alert(n).location == (LAT, LNG)
    # The PIN the alert was raised under ends it. The front sees only a wrong PIN.
    fx = send(n, Resolve(U, PIN), now)
    assert flat(to(fx, U)) == [(U, "screen", {"screen": "pin_retry"})]
    assert recipients(others(fx), "resolved") == {"x", "y"}
    assert active(n) == [] and all(a.location is None for a in n.alerts)


def test_new_night_pin_cannot_end_a_carried_fake_ended_alert():
    s, now, _ = make("escalating")
    send(s, Resolve(U, "0000"), now)
    send(s, Resolve(U, "0000"), now)  # fake end: the alert goes on, hidden
    n = new_session(make_config(pin="0000"), now, carry=s)
    send(n, Resolve(U, "0000"), now)
    assert len(active(n)) == 1 and view_for(n, "a")["active"] is True
    send(n, Resolve(U, PIN), now)
    assert active(n) == []


def test_second_duress_after_the_first_was_taken_alerts_again():
    s, now, _ = hidden_session("duress")
    send(s, Ack("x"), now)
    fx = send(s, Duress(), now)
    assert flat(to(fx, U)) == [(U, "screen", {"screen": "thanks"})]
    assert recipients(others(fx), "alert") == {"x"}
    assert len(active(s)) == 2


def test_second_duress_with_new_contacts_alerts_them_over_a_carried_alert():
    s, now, _ = hidden_session("duress")
    send(s, Ack("x"), now)
    send(s, Leave(), now)
    n = new_session(make_config(duress_contacts=["y", "z"]), now + 3600, carry=s)
    fx = send(n, Duress(), now + 3600)
    assert recipients(others(fx), "alert") == {"y"}
    assert view_for(n, "y")["active"] is True


def test_acknowledger_keeps_location_when_another_alert_is_a_duress_alert():
    s, now = start(tiers=[["x"]], duress_contacts=["x", "y"], share_location_with="acknowledger")
    send(s, Duress(), now)
    now, _ = advance(s, now, ACK + 1)  # x is silent, so y is alerted
    send(s, Ack("y"), now)
    send(s, LocationUpdate(LAT, LNG), now)
    send(s, Trigger("manual"), now)
    now, _ = advance_until(s, now, lambda s: s.state == "escalating", limit=ASK + GRACE + 3)
    send(s, Ack("x"), now)
    assert s.front_alert.acknowledged_by == "x"
    assert view_for(s, "x")["location"] == (LAT, LNG)
    assert view_for(s, "y")["location"] == (LAT, LNG) and view_for(s, "y")["kind"] == "duress"


def test_new_session_carries_only_active_hidden_alerts():
    s, now, _ = make("escalating")  # a normal alert is not carried
    assert new_session(make_config(), now, carry=s).alerts == []
    s, now, who = hidden_session("duress")
    send(s, Resolve(who), now)  # a resolved one is not carried
    n = new_session(make_config(), now, carry=s)
    assert n.alerts == [] and n.location is None
    assert new_session(make_config(), now).alerts == []


def test_correct_pin_ends_the_front_alert_and_hidden_alerts_together():
    s, now, _ = hidden_session("duress")
    send(s, Trigger("manual"), now)
    now, _ = advance_until(s, now, lambda s: s.state == "escalating", limit=ASK + GRACE + 3)
    assert len(active(s)) == 2
    fx = send(s, Resolve(U, PIN), now)
    assert active(s) == [] and s.state == "resolved"
    assert flat(to(fx, U)) == [(U, "screen", {"screen": "ended_true"})]
    assert sorted(e.to for e in fx if e.kind == "resolved") == ["a", "x", "y"], "each contact is told once"


def test_wrong_pin_warns_contacts_of_every_active_alert():
    s, now, _ = hidden_session("duress")
    send(s, Trigger("manual"), now)
    now, _ = advance_until(s, now, lambda s: s.state == "escalating", limit=ASK + GRACE + 3)
    send(s, Resolve(U, "0000"), now)
    fx = send(s, Resolve(U, "0000"), now)
    assert recipients(others(fx), "wrong_pin_warning") == {"a", "x", "y"}
    assert all(a.hidden for a in active(s)) and s.front_alert is None


# ---------- third review: location, one alert per contact action, the polled view ----------

def watcher_config(**over):
    """W is the only tier contact. x and y are the private duress contacts."""
    return make_config(tiers=[["w"]], duress_contacts=["x", "y"], group=[], **over)


def watcher_session(hidden):
    s = new_session(watcher_config(), 0.0)
    send(s, LocationUpdate(LAT, LNG), 0.0)
    send(s, Trigger("manual"), 0.0)
    send(s, Duress() if hidden else ConfirmOk(), 1.0)
    return s


def lapse(s, now):
    """A check-in is missed. Returns the time after the alert reached the tier."""
    send(s, Tick(), now)  # resolved goes back to armed
    send(s, Trigger("manual"), now)
    now, _ = advance_until(s, now, lambda s: s.state == "escalating", limit=ASK + GRACE + 3)
    return now


def test_location_a_front_alert_shows_the_same_with_or_without_a_hidden_alert():
    """W takes and ends front alert F while a duress alert runs. The next alert F2 has no new location."""
    seen = []
    for hidden in (True, False):
        s = watcher_session(hidden)
        now = lapse(s, 2.0)
        send(s, Ack("w"), now)
        send(s, Resolve("w"), now)
        now = lapse(s, now + 1)
        seen.append(view_for(s, "w")["location"])
    assert seen == [None, None]


def test_location_ending_a_hidden_alert_does_not_clear_what_a_front_alert_shows():
    seen = []
    for hidden in (True, False):
        s = watcher_session(hidden)
        if hidden:
            send(s, Resolve("x"), 5.0)  # a duress contact checks on the user
        lapse(s, 6.0)
        seen.append(view_for(s, "w")["location"])
    assert seen == [(LAT, LNG), (LAT, LNG)]


def test_location_a_carried_alert_does_not_leak_into_the_next_night():
    seen = []
    for hidden in (True, False):
        s = watcher_session(hidden)
        send(s, Leave(), 3.0)
        n = new_session(watcher_config(pin="9999"), 4.0, carry=s)
        lapse(n, 4.0)
        seen.append(view_for(n, "w")["location"])
    assert seen == [None, None]


def test_location_a_hidden_alert_keeps_its_own_position_up_to_date():
    s = watcher_session(True)
    send(s, Leave(), 3.0)
    n = new_session(watcher_config(pin="9999"), 4.0, carry=s)
    send(n, LocationUpdate(1.0, 2.0), 5.0)
    assert view_for(n, "x")["location"] == (1.0, 2.0)
    assert n.location == (1.0, 2.0)  # the new front keeps its own copy


def test_resolving_a_front_alert_does_not_end_a_duress_alert_the_contact_never_saw():
    s, now = start(tiers=[["y"]], duress_contacts=["x", "y"], ack_seconds=60)
    send(s, Duress(), now)
    assert view_for(s, "y") == INACTIVE
    now = lapse(s, now)
    send(s, Ack("y"), now)
    fx = send(s, Resolve("y"), now)
    assert recipients(fx, "resolved") == {"y"}
    assert [(a.kind, a.state) for a in s.alerts] == [("duress", "duress"), ("manual", "resolved")]
    assert view_for(s, "x")["kind"] == "duress"


def test_one_ack_takes_one_alert():
    s, now = start(tiers=[["y"]], duress_contacts=["x", "y"], ack_seconds=60)
    send(s, Duress(), now)
    now = lapse(s, now)
    now, _ = advance(s, now, 60)  # x is silent, so the duress alert reaches y too
    assert all("y" in a.alerted for a in s.alerts)
    send(s, Ack("y"), now)
    taken = [a for a in s.alerts if a.acknowledged_by == "y"]
    assert len(taken) == 1 and taken[0].kind == "duress"
    send(s, Ack("y"), now)  # the next tap takes the other one
    assert all(a.acknowledged_by == "y" for a in s.alerts)


def test_resolving_a_new_front_alert_does_not_end_an_older_fake_ended_alert():
    s, now = start(tiers=[["a"], ["b"]], ack_seconds=ACK)
    now = lapse(s, now)
    send(s, Ack("a"), now)
    send(s, Resolve(U, "0000"), now)
    send(s, Resolve(U, "0000"), now)  # fake end
    send(s, Tick(), now + 1)
    now = lapse(s, now + 2)
    send(s, Ack("a"), now)  # a's screen shows the new alert, the old one is already taken by a
    send(s, Resolve("a"), now)
    assert s.alerts[1].state == "resolved"
    assert s.alerts[0].state == "acknowledged"


@pytest.mark.parametrize("mode", ["alerted", "acknowledger"])
def test_polled_view_shows_the_duress_alert_to_a_contact_who_took_a_normal_one(mode):
    s, now = start(tiers=[["y"]], duress_contacts=["x", "y"], share_location_with=mode, ack_seconds=60)
    send(s, Duress(), now)
    now = lapse(s, now)
    send(s, Ack("y"), now)
    assert view_for(s, "y")["kind"] == "manual"
    now, fx = advance(s, now, 60)  # x is silent, so the duress alert reaches y
    assert [e.data["kind"] for e in to(fx, "y", "alert")] == ["duress"]
    assert view_for(s, "y")["kind"] == "duress"
    send(s, Resolve("y"), now)  # ends what is on screen: the duress alert
    assert view_for(s, "y")["kind"] == "manual" and view_for(s, "y")["acknowledged_by"] == "y"
