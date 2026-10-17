"""A server restart in the middle of an alert carries on from the file in KAZE_STATE."""
from fastapi.testclient import TestClient

from kaze import app as server
from kaze.app import app
from test_app import make_user


def crash():
    """What a dead process loses: everything in memory. The file stays."""
    server.users.clear(), server.groups.clear(), server.sessions.clear()
    server.offset = 0.0


def test_restart_mid_alert_keeps_escalating(state_file):
    with TestClient(app) as c:
        c.post("/demo/reset")
        user, a, b = make_user(c, "u"), make_user(c, "a"), make_user(c, "b")
        body = {"user_id": user, "pin": "1234", "tiers": [[a], [b]], "duress_contacts": [a]}
        assert c.post("/sessions", json=body).status_code == 200
        with c.websocket_connect(f"/ws/{user}"):
            c.post(f"/sessions/{user}/events", json={"type": "Trigger", "kind": "manual"})
            c.post("/demo/skip", json={"seconds": 50})
        assert c.get(f"/sessions/{user}/view", params={"viewer": a}).json()["active"] is True
        skipped = c.get("/time").json()["now"]
    assert state_file.exists()
    crash()
    with TestClient(app) as c:
        assert c.get("/time").json()["now"] >= skipped  # the demo clock offset came back too
        assert server.sessions[user].connected is False  # no socket survives a restart
        assert c.get(f"/sessions/{user}/view", params={"viewer": user}).json()["state"] == "escalating"
        assert c.get(f"/sessions/{user}/view", params={"viewer": b}).json()["active"] is not True
        c.post("/demo/skip", json={"seconds": 30})  # a ignores it: the next tier is alerted
        assert c.get(f"/sessions/{user}/view", params={"viewer": b}).json()["active"] is True


def test_corrupt_file_starts_empty(state_file):
    server.users["ghost"] = "g"
    state_file.write_bytes(b"not a pickle")
    with TestClient(app) as c:
        assert server.users == {} and server.sessions == {}
        assert c.get("/time").status_code == 200


def test_reset_clears_the_file(state_file):
    with TestClient(app) as c:
        c.post("/demo/reset")
        make_user(c, "u")
        c.post("/demo/skip", json={"seconds": 0})  # saves now instead of waiting for the ticker
        assert state_file.exists()
        c.post("/demo/reset")
        assert not state_file.exists()
