"""Integration tests for app.py. Scenario 4 runs over real WebSockets."""
import pytest
from fastapi.testclient import TestClient

from kaze.app import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        c.post("/demo/reset")
        yield c


def make_user(c, name):
    return c.post("/users", json={"name": name}).json()["user_id"]


def start_night(c, user, contact, **extra):
    body = {"user_id": user, "pin": "1234", "tiers": [[contact]], "duress_contacts": [contact]}
    return c.post("/sessions", json=body | extra)


def test_scenario4_disconnect_still_escalates(client):
    user, contact = make_user(client, "u"), make_user(client, "c")
    assert start_night(client, user, contact).status_code == 200
    with client.websocket_connect(f"/ws/{contact}") as contact_ws:
        with client.websocket_connect(f"/ws/{user}"):
            client.post(f"/sessions/{user}/events", json={"type": "Trigger", "kind": "manual"})
        # user's socket is closed now: phone gone after the countdown started
        client.post("/demo/skip", json={"seconds": 50})
        msg = contact_ws.receive_json()
    assert msg["kind"] == "alert"
    assert msg["data"]["user_id"] == user
    assert msg["data"]["card"]["do"]
    view = client.get(f"/sessions/{user}/view", params={"viewer": contact}).json()
    assert view["active"] is True
    assert client.get(f"/sessions/{user}/view", params={"viewer": user}).json()["state"] == "escalating"


def test_create_group_join_start_session(client):
    a, b, c = make_user(client, "a"), make_user(client, "b"), make_user(client, "c")
    code = client.post("/groups", json={"user_id": a}).json()["code"]
    assert client.post(f"/groups/{code}/join", json={"user_id": b}).json()["members"] == [a, b]
    r = start_night(client, a, c, group_code=code)
    assert r.status_code == 200
    assert r.json()["view"]["state"] == "armed"


def test_bad_requests(client):
    user, contact = make_user(client, "u"), make_user(client, "c")
    start_night(client, user, contact)
    events = f"/sessions/{user}/events"
    assert client.post(events, json={"type": "Nope"}).status_code == 400
    assert client.post(events, json={"type": "Trigger", "kind": "bogus"}).status_code == 400
    assert client.post(events, json={"type": "Ack"}).status_code == 400  # missing contact_id
    assert client.post("/groups", json={"user_id": "nobody"}).status_code == 400
    assert start_night(client, "nobody", contact).status_code == 400
    assert start_night(client, user, contact, group_code="ZZZZ").status_code == 404
    assert client.post("/groups/ZZZZ/join", json={"user_id": user}).status_code == 404
    assert client.post("/sessions/nobody/events", json={"type": "Tick"}).status_code == 404
    assert client.get("/sessions/nobody/view", params={"viewer": user}).status_code == 404


def reach_escalating(c, user, contact):
    start_night(c, user, contact)
    c.post(f"/sessions/{user}/events", json={"type": "Trigger", "kind": "manual"})
    c.post("/demo/skip", json={"seconds": 50})
    return c.get(f"/sessions/{user}/view", params={"viewer": user}).json()


def test_restart_during_live_alert_is_409_and_keeps_old_session(client):
    user, contact = make_user(client, "u"), make_user(client, "c")
    assert reach_escalating(client, user, contact)["state"] == "escalating"
    r = start_night(client, user, contact)
    assert r.status_code == 409 and r.json() == {"detail": "session busy"}
    assert client.get(f"/sessions/{user}/view", params={"viewer": user}).json()["state"] == "escalating"
    assert client.get(f"/sessions/{user}/view", params={"viewer": contact}).json()["active"] is True


def test_new_night_during_duress_carries_the_hidden_alert(client):
    """Same answer as for an honest user (200, since the view says armed). The duress alert moves over."""
    user, contact = make_user(client, "u"), make_user(client, "c")
    assert start_night(client, user, contact).status_code == 200
    assert start_night(client, user, contact).status_code == 200  # armed: replaced
    client.post(f"/sessions/{user}/events", json={"type": "Duress"})
    r = start_night(client, user, contact)
    assert r.status_code == 200 and r.json()["view"] == {"state": "armed", "screen": "armed", "deadline": None, "ping_at": None}
    alerts = client.get("/alerts", params={"viewer": contact}).json()["alerts"]
    assert len(alerts) == 1 and alerts[0]["kind"] == "duress"
    client.post("/demo/skip", json={"seconds": 100})  # it keeps escalating in the new session
    assert client.get(f"/sessions/{user}/view", params={"viewer": user}).json()["state"] == "armed"
    client.post(f"/sessions/{user}/events", json={"type": "Resolve", "by": user, "pin": "1234"})
    assert client.get("/alerts", params={"viewer": contact}).json() == {"alerts": []}


def test_hidden_alert_keeps_ticking_after_the_user_left(client):
    user, c1, c2 = make_user(client, "u"), make_user(client, "c1"), make_user(client, "c2")
    start_night(client, user, c1, duress_contacts=[c1, c2])
    client.post(f"/sessions/{user}/events", json={"type": "Duress"})
    client.post(f"/sessions/{user}/events", json={"type": "Leave"})
    assert client.get(f"/sessions/{user}/view", params={"viewer": user}).json()["state"] == "ended"
    assert client.get("/alerts", params={"viewer": c2}).json() == {"alerts": []}
    client.post("/demo/skip", json={"seconds": 25})  # past the ack window of duress contact 1
    assert len(client.get("/alerts", params={"viewer": c2}).json()["alerts"]) == 1


def test_empty_duress_contacts_is_400(client):
    user, contact = make_user(client, "u"), make_user(client, "c")
    assert start_night(client, user, contact, duress_contacts=[]).status_code == 400
    assert client.get(f"/sessions/{user}/view", params={"viewer": user}).status_code == 404  # nothing started
    body = {"user_id": user, "pin": "1234", "tiers": [[contact]]}
    assert client.post("/sessions", json=body).status_code == 400  # field left out


def test_non_string_pin_is_400_and_not_coerced(client):
    user, contact = make_user(client, "u"), make_user(client, "c")
    start_night(client, user, contact, pin="0123")
    client.post(f"/sessions/{user}/events", json={"type": "Trigger", "kind": "manual"})
    client.post("/demo/skip", json={"seconds": 50})
    events = f"/sessions/{user}/events"
    for pin in (123, 0.5, True, ["0123"]):
        assert client.post(events, json={"type": "Resolve", "by": user, "pin": pin}).status_code == 400
    assert app_session(user).wrong_pins == 0  # none of them counted as an attempt
    assert client.post(events, json={"type": "Resolve", "by": user, "pin": "0123"}).status_code == 200
    assert app_session(user).state == "resolved"


def app_session(user):
    from kaze.app import sessions
    return sessions[user]


def test_time_includes_demo_offset(client):
    t0 = client.get("/time").json()["now"]
    client.post("/demo/skip", json={"seconds": 1000})
    t1 = client.get("/time").json()["now"]
    assert 999 < t1 - t0 < 1010


def test_get_group_members_with_names(client):
    a, b = make_user(client, "ann"), make_user(client, "bo")
    code = client.post("/groups", json={"user_id": a}).json()["code"]
    client.post(f"/groups/{code}/join", json={"user_id": b})
    assert client.get(f"/groups/{code}").json() == {
        "code": code, "members": [{"user_id": a, "name": "ann"}, {"user_id": b, "name": "bo"}]}
    assert client.get("/groups/ZZZZ").status_code == 404


def test_alerts_lists_only_active_alerts_for_that_viewer(client):
    user, contact, other = make_user(client, "u"), make_user(client, "c"), make_user(client, "o")
    assert client.get("/alerts", params={"viewer": contact}).json() == {"alerts": []}
    reach_escalating(client, user, contact)
    alerts = client.get("/alerts", params={"viewer": contact}).json()["alerts"]
    assert len(alerts) == 1 and alerts[0]["user_id"] == user and alerts[0]["active"] is True
    assert alerts[0]["card"]["do"]
    assert client.get("/alerts", params={"viewer": other}).json() == {"alerts": []}
    assert client.get("/alerts", params={"viewer": user}).json() == {"alerts": []}
    client.post(f"/sessions/{user}/events", json={"type": "Resolve", "by": user, "pin": "1234"})
    assert client.get("/alerts", params={"viewer": contact}).json() == {"alerts": []}


def test_user_cannot_be_their_own_contact(client):
    user, contact = make_user(client, "u"), make_user(client, "c")
    body = {"user_id": user, "pin": "1234"}
    r = client.post("/sessions", json=body | {"tiers": [[contact, user]], "duress_contacts": [contact]})
    assert r.status_code == 400
    r = client.post("/sessions", json=body | {"tiers": [[contact]], "duress_contacts": [user, contact]})
    assert r.status_code == 400
    assert client.get(f"/sessions/{user}/view", params={"viewer": user}).status_code == 404  # no session made


@pytest.mark.parametrize("tiers", [[], [[]], [["c"], []]])
def test_tiers_need_a_contact_in_every_tier(client, tiers):
    user, contact = make_user(client, "u"), make_user(client, "c")
    tiers = [[contact if c == "c" else c for c in t] for t in tiers]
    r = client.post("/sessions", json={"user_id": user, "pin": "1234", "tiers": tiers, "duress_contacts": [contact]})
    assert r.status_code == 400


def test_stuck_contact_socket_does_not_slow_the_duress_request(client):
    """Duress sends to a contact and ConfirmOk does not. The user's request must take the same time."""
    import asyncio
    import time

    from kaze import app as app_module

    class StuckSocket:
        async def send_json(self, message):
            await asyncio.sleep(1)

    user, contact = make_user(client, "u"), make_user(client, "c")
    start_night(client, user, contact)
    client.post(f"/sessions/{user}/events", json={"type": "Trigger", "kind": "manual"})
    app_module.sockets[contact] = [StuckSocket()]
    began = time.time()
    r = client.post(f"/sessions/{user}/events", json={"type": "Duress"})
    assert r.status_code == 200 and time.time() - began < 0.5


def test_stuck_contact_socket_does_not_delay_other_contacts_in_the_same_batch(client):
    """Tier 1 has two contacts. The first one's socket is stuck. The second must hear at once."""
    import asyncio
    import time

    from kaze import app as app_module

    got = []

    class StuckSocket:
        async def send_json(self, message):
            await asyncio.sleep(2)

    class GoodSocket:
        async def send_json(self, message):
            got.append(message["kind"])

    user, stuck, good = make_user(client, "u"), make_user(client, "s"), make_user(client, "g")
    body = {"user_id": user, "pin": "1234", "tiers": [[stuck, good]], "duress_contacts": [good]}
    client.post("/sessions", json=body | {"ask_seconds": 1, "grace_seconds": 1})
    client.post(f"/sessions/{user}/events", json={"type": "Trigger", "kind": "manual"})
    app_module.sockets[stuck] = [StuckSocket()]
    app_module.sockets[good] = [GoodSocket()]
    client.post("/demo/skip", json={"seconds": 5})
    time.sleep(0.5)
    assert got == ["alert"]


@pytest.mark.parametrize("lat,lng", [
    ("NaN", "0"), ("0", "NaN"), ("Infinity", "0"), ("0", "-Infinity"), ('"43.6"', "0"), ("true", "0"),
    ("91", "0"), ("0", "181"), ("null", "0"),
])
def test_bad_location_is_400_and_does_not_break_the_alerts_list(client, lat, lng):
    """One bad location used to make GET /alerts fail for the contact, for every user."""
    u1, u2, contact = make_user(client, "u1"), make_user(client, "u2"), make_user(client, "c")
    for u in (u1, u2):
        start_night(client, u, contact, ask_seconds=1, grace_seconds=1)
        client.post(f"/sessions/{u}/events", json={"type": "Trigger", "kind": "manual"})
    client.post("/demo/skip", json={"seconds": 5})
    r = client.post(f"/sessions/{u1}/events", content='{"type": "LocationUpdate", "lat": %s, "lng": %s}' % (lat, lng),
                    headers={"content-type": "application/json"})
    assert r.status_code == 400
    r = client.get("/alerts", params={"viewer": contact})
    assert r.status_code == 200 and len(r.json()["alerts"]) == 2
    assert all(v["location"] is None for v in r.json()["alerts"])


def test_good_location_is_stored(client):
    user, contact = make_user(client, "u"), make_user(client, "c")
    start_night(client, user, contact, ask_seconds=1, grace_seconds=1)
    client.post(f"/sessions/{user}/events", json={"type": "Trigger", "kind": "manual"})
    client.post("/demo/skip", json={"seconds": 5})
    r = client.post(f"/sessions/{user}/events", json={"type": "LocationUpdate", "lat": 43, "lng": -79.38})
    assert r.status_code == 200
    assert client.get(f"/sessions/{user}/view", params={"viewer": contact}).json()["location"] == [43, -79.38]


@pytest.mark.parametrize("field", ["ask_seconds", "grace_seconds", "ack_seconds", "night_ends_at"])
@pytest.mark.parametrize("value", ["NaN", "1e999", "-1e999"])
def test_nan_and_infinite_timers_are_rejected(client, field, value):
    user, contact = make_user(client, "u"), make_user(client, "c")
    content = '{"user_id": "%s", "pin": "1", "tiers": [["%s"]], "duress_contacts": ["%s"], "%s": %s}' % (
        user, contact, contact, field, value)
    r = client.post("/sessions", content=content, headers={"content-type": "application/json"})
    assert r.status_code == 422
    assert client.get(f"/sessions/{user}/view", params={"viewer": user}).status_code == 404  # nothing started


def test_negative_timer_is_rejected_and_zero_is_not(client):
    user, contact = make_user(client, "u"), make_user(client, "c")
    assert start_night(client, user, contact, ack_seconds=-1).status_code == 422
    assert start_night(client, user, contact, ack_seconds=0).status_code == 200


def test_demo_skip_rejects_nan(client):
    r = client.post("/demo/skip", content='{"seconds": NaN}', headers={"content-type": "application/json"})
    assert r.status_code == 422


@pytest.mark.parametrize("bad", ['[NaN]', '{"x": Infinity}'])
def test_a_nan_inside_a_bad_value_is_a_422_not_a_500(client, bad):
    user, contact = make_user(client, "u"), make_user(client, "c")
    content = '{"user_id": %s, "pin": "1", "tiers": [["%s"]], "duress_contacts": ["%s"]}' % (bad, contact, contact)
    r = client.post("/sessions", content=content, headers={"content-type": "application/json"})
    assert r.status_code == 422


def test_too_many_contacts_are_a_400(client):
    user, contact = make_user(client, "u"), make_user(client, "c")
    assert start_night(client, user, contact, tiers=[[contact] * 1000]).status_code == 400
    assert start_night(client, user, contact, tiers=[[contact]] * 50).status_code == 400  # 50 + 1 duress
    assert start_night(client, user, contact, tiers=[[contact]] * 49).status_code == 200

