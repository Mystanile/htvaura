"""The demo panel: optional key, events for any session, and the judge view."""
from fastapi.testclient import TestClient
import pytest

from kaze import safekeeps
from kaze.app import app, sessions
from kaze.loop import view_for
from test_bridge import NIGHT, people, start

ROUTES = [("get", "/demo/state"), ("post", "/demo/skip"), ("post", "/demo/reset"), ("post", "/demo/event")]
BODIES = {"/demo/skip": {"seconds": 1}, "/demo/event": {"user_id": "nobody", "type": "Reconnect"}}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(safekeeps, "DB_PATH", tmp_path / "demo.sqlite3")
    with TestClient(app) as client:
        client.post("/demo/reset")
        yield client


def call(client, method, path, **kw):
    return client.request(method, path, json=BODIES.get(path) if method == "post" else None, **kw)


def test_key_is_required_when_set(client, monkeypatch):
    monkeypatch.setenv("KAZE_DEMO_KEY", "s3cret")
    for method, path in ROUTES:
        assert call(client, method, path).status_code == 401, path
        assert call(client, method, path, headers={"X-Demo-Key": "wrong"}).status_code == 401, path
        assert call(client, method, path, headers={"X-Demo-Key": "café".encode()}).status_code == 401, path  # not ASCII: still a 401, not a crash
        assert call(client, method, path, params={"key": "s3cret"}).status_code == 401, path  # a key in the URL is not accepted: it would reach the logs
        assert call(client, method, path, headers={"X-Demo-Key": "s3cret"}).status_code != 401, path
    assert client.get("/panel").status_code == 200  # the page holds no data, it asks for the key itself


def test_routes_are_open_when_no_key_is_set(client, monkeypatch):
    monkeypatch.delenv("KAZE_DEMO_KEY", raising=False)
    for method, path in ROUTES:
        assert call(client, method, path).status_code != 401, path
    assert client.get("/demo/state").json()["key_set"] is False  # the panel shows a warning banner for this
    monkeypatch.setenv("KAZE_DEMO_KEY", "s3cret")
    assert client.get("/demo/state", headers={"X-Demo-Key": "s3cret"}).json()["key_set"] is True


def test_the_panel_page_is_html(client):
    r = client.get("/panel")
    assert r.status_code == 200 and "text/html" in r.headers["content-type"]
    assert "KAZE demo panel" in r.text


def test_events_drive_a_safekeeps_session(client):
    (alice, a), (bob, b), (carol, c) = people(client, "Alice", "Bob", "Carol")
    start(client, a, [[bob["id"]]], [carol["id"]])
    uid = alice["id"]

    def event(**body):
        return client.post("/demo/event", json={"user_id": uid} | body)

    assert event(type="Disconnect").status_code == 200
    assert not sessions[uid].connected
    assert event(type="Reconnect").status_code == 200
    assert sessions[uid].connected
    assert event(type="LocationUpdate", lat=43.78, lng=-79.18).status_code == 200
    assert sessions[uid].location == (43.78, -79.18)
    assert event(type="Trigger", kind="manual").status_code == 200
    assert client.get(NIGHT, headers=a).json()["view"]["state"] == "asking"
    client.post("/demo/skip", json={"seconds": 50})
    assert client.get(NIGHT, headers=a).json()["view"]["state"] == "escalating"
    seen = client.get(NIGHT, headers=b).json()["alerts"]
    assert seen[0]["user_id"] == uid and seen[0]["location"] == [43.78, -79.18]
    client.post(f"/safekeeps/alerts/{uid}/ping", headers=b)
    row = next(r for r in client.get("/demo/state").json()["sessions"] if r["user_id"] == uid)
    assert row["ping_at"] is not None


def test_other_events_and_bad_input_are_refused(client):
    (alice, a), (bob, _), (carol, _) = people(client, "Alice", "Bob", "Carol")
    start(client, a, [[bob["id"]]], [carol["id"]])
    uid = alice["id"]
    for body in ({"type": "ConfirmOk"}, {"type": "Duress"}, {"type": "Tick"}, {"type": "Ack", "contact_id": bob["id"]},
                 {"type": "Resolve", "by": uid}, {"type": "Leave"}, {"type": "Nope"}, {},
                 {"type": "Trigger", "kind": "party"}, {"type": "LocationUpdate", "lat": 999, "lng": 0}):
        assert client.post("/demo/event", json={"user_id": uid} | body).status_code == 400, body
    assert client.post("/demo/event", json={"type": "Reconnect"}).status_code == 400  # no user_id
    assert client.post("/demo/event", json={"user_id": "nobody", "type": "Reconnect"}).status_code == 404


def test_state_shows_hidden_alerts_and_the_privacy_matrix_matches_view_for(client):
    (alice, a), (bob, b), (carol, c), (dave, d) = people(client, "Alice", "Bob", "Carol", "Dave")
    start(client, a, [[bob["id"]], [dave["id"]]], [carol["id"]])
    client.post("/demo/event", json={"user_id": alice["id"], "type": "Trigger", "kind": "manual"})
    client.post("/demo/event", json={"user_id": alice["id"], "type": "LocationUpdate", "lat": 1, "lng": 2})
    assert client.post(NIGHT + "/events", headers=a, json={"type": "Duress"}).status_code == 200

    state = client.get("/demo/state").json()
    assert state["now"] > 0 and len(state["sessions"]) == 1
    row = state["sessions"][0]
    assert (row["user_id"], row["name"], row["state"], row["connected"]) == (alice["id"], "Alice", "armed", True)  # polling counts as connected
    assert row["config"]["tiers"] == [["Bob"], ["Dave"]] and row["config"]["duress_contacts"] == ["Carol"]
    [alert] = row["alerts"]
    assert (alert["kind"], alert["hidden"], alert["alerted"]) == ("duress", True, ["Carol"])
    assert alert["tier_count"] == 1  # one duress contact, not the night's 2 plain tiers

    ids = {p["name"]: p["id"] for p in (alice, bob, carol, dave)}
    people_rows = {p["name"]: p for p in row["privacy"]}
    assert set(people_rows) == {"Bob", "Carol", "Dave"}
    assert "duress contact" in people_rows["Carol"]["role"] and "tier 1" in people_rows["Bob"]["role"]
    for name, p in people_rows.items():
        v = view_for(sessions[alice["id"]], ids[name])
        assert p["sees_alert"] == v["active"]
        assert p["sees_location"] == (v.get("location") is not None)
    assert people_rows["Carol"]["sees_alert"] and people_rows["Carol"]["sees_location"]
    assert not people_rows["Bob"]["sees_alert"] and not people_rows["Dave"]["sees_alert"]


def test_reset_leaves_safekeeps_profiles_alone(client):
    (alice, a), (bob, _), (carol, _) = people(client, "Alice", "Bob", "Carol")
    start(client, a, [[bob["id"]]], [carol["id"]])
    assert client.post("/demo/reset").status_code == 200
    assert client.get("/demo/state").json()["sessions"] == []
    assert client.get("/safekeeps/state", headers=a).json()["me"]["id"] == alice["id"]


def test_a_safekeeps_night_can_share_location_with_the_acknowledger_only(client):
    (alice, a), (bob, b), (carol, c), (dave, d) = people(client, "Alice", "Bob", "Carol", "Dave")
    assert start(client, a, [[bob["id"], dave["id"]]], [carol["id"]], share_location_with="acknowledger").status_code == 200
    assert start(client, a, [[bob["id"]]], [carol["id"]], share_location_with="everyone").status_code == 400
    uid = alice["id"]
    client.post("/demo/event", json={"user_id": uid, "type": "LocationUpdate", "lat": 1, "lng": 2})
    client.post("/demo/event", json={"user_id": uid, "type": "Trigger", "kind": "manual"})
    client.post("/demo/skip", json={"seconds": 50})
    assert client.post(f"/safekeeps/alerts/{uid}/ack", headers=b).status_code == 200
    rows = {p["name"]: p for p in client.get("/demo/state").json()["sessions"][0]["privacy"]}
    assert rows["Bob"]["sees_location"] and not rows["Dave"]["sees_location"]
