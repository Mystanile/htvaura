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


def test_restart_during_duress_is_409_but_armed_session_is_replaced(client):
    user, contact = make_user(client, "u"), make_user(client, "c")
    assert start_night(client, user, contact).status_code == 200
    assert start_night(client, user, contact).status_code == 200  # armed: replaced
    client.post(f"/sessions/{user}/events", json={"type": "Duress"})
    assert start_night(client, user, contact).status_code == 409
    client.post(f"/sessions/{user}/events", json={"type": "Resolve", "by": user, "pin": "1234"})
    client.post("/demo/skip", json={"seconds": 1})
    assert start_night(client, user, contact).status_code == 200  # resolved and armed again


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
