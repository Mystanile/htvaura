"""Exercise two independent phone identities over the actual HTTP API."""
from fastapi.testclient import TestClient
import pytest

from kaze.app import app
from kaze import safekeeps


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(safekeeps, "DB_PATH", tmp_path / "demo.sqlite3")
    with TestClient(app) as client:
        yield client


def profile(client, name):
    response = client.post("/safekeeps/profiles", json={"name": name})
    assert response.status_code == 200
    data = response.json()
    return data["snapshot"]["me"], {"Authorization": "Bearer " + data["token"]}


def accept(client, sender, recipient):
    sender_id = client.get('/safekeeps/state', headers=sender).json()['me']['id']
    assert client.post(f'/safekeeps/friend-requests/{sender_id}/accept', headers=recipient, json={}).status_code == 200
    return client.get('/safekeeps/state', headers=sender).json()


def test_two_phones_check_in_and_resolve_request(client):
    alice, a = profile(client, "Alice")
    bob, b = profile(client, "Bob")
    assert alice["code"] != bob["code"]
    response = client.post("/safekeeps/friends", headers=a, json={"code": bob["code"].lower()})
    assert response.status_code == 200
    assert response.json()["friends"] == []
    assert client.get('/safekeeps/state', headers=b).json()['friendRequests'][0]['id'] == alice['id']
    assert accept(client, a, b)["friends"][0]["id"] == bob["id"]
    assert client.get("/safekeeps/state", headers=b).json()["friends"][0]["id"] == alice["id"]

    # Re-adding is harmless and does not duplicate either friend's list.
    client.post("/safekeeps/friends", headers=a, json={"code": bob["code"]})
    assert len(client.get("/safekeeps/state", headers=b).json()["friends"]) == 1
    assert client.post("/safekeeps/check-ins", headers=a, json={}).status_code == 200
    assert client.get("/safekeeps/state", headers=b).json()["friends"][0]["lastCheckIn"] is not None

    response = client.post(f"/safekeeps/friends/{alice['id']}/requests", headers=b, json={})
    assert response.json()["friends"][0]["resolvedAt"] is None
    assert client.get("/safekeeps/state", headers=a).json()["incoming"][0]["name"] == "Bob"
    client.post("/safekeeps/check-ins", headers=a, json={})
    assert client.get("/safekeeps/state", headers=a).json()["incoming"] == []
    friend = client.get("/safekeeps/state", headers=b).json()["friends"][0]
    assert friend["resolvedAt"] is not None

    # A later request becomes pending again.
    client.post(f"/safekeeps/friends/{alice['id']}/requests", headers=b, json={})
    assert len(client.get("/safekeeps/state", headers=a).json()["incoming"]) == 1


def test_validation_authorization_and_retry(client):
    alice, a = profile(client, "Alice")
    bob, b = profile(client, "Bob")
    assert client.get("/safekeeps/state").status_code == 401
    assert client.get("/safekeeps/state", headers={"Authorization": "Bearer bad"}).status_code == 401
    assert client.post("/safekeeps/profiles", json={"name": "  "}).status_code == 400
    assert client.post("/safekeeps/friends", headers=a, json={"code": alice["code"]}).status_code == 400
    assert client.post("/safekeeps/friends", headers=a, json={"code": "NOPE"}).status_code == 404
    assert client.post(f"/safekeeps/friends/{bob['id']}/requests", headers=a, json={}).status_code == 403
    assert client.post("/safekeeps/friends", headers=a, json={"code": bob["code"]}).status_code == 200
    accept(client, a, b)
    assert client.post(f"/safekeeps/friends/{bob['id']}/requests", headers=a, json={}).status_code == 200
    # A fresh client can restore the same identity; state lives in SQLite, not client memory.
    with TestClient(app) as reopened:
        assert reopened.get("/safekeeps/state", headers=b).json()["incoming"][0]["id"] == alice["id"]


def test_guest_laptop_and_phone_without_sign_in(client):
    laptop = client.post("/safekeeps/guests", json={}).json()
    phone = client.post("/safekeeps/guests", json={}).json()
    assert laptop["snapshot"]["me"]["name"].startswith("Guest ")
    assert phone["snapshot"]["me"]["id"] != laptop["snapshot"]["me"]["id"]
    assert phone["snapshot"]["me"]["code"] != laptop["snapshot"]["me"]["code"]
    a = {"Authorization": "Bearer " + laptop["token"]}
    b = {"Authorization": "Bearer " + phone["token"]}
    linked = client.post("/safekeeps/friends", headers=a, json={"code": phone["snapshot"]["me"]["code"]})
    assert linked.status_code == 200
    accept(client, a, b)
    assert len(client.get("/safekeeps/state", headers=b).json()["friends"]) == 1
    phone_id = phone["snapshot"]["me"]["id"]
    assert client.post(f"/safekeeps/friends/{phone_id}/requests", headers=a, json={}).status_code == 200
    assert len(client.get("/safekeeps/state", headers=b).json()["incoming"]) == 1
    assert client.post("/safekeeps/check-ins", headers=b, json={}).status_code == 200
    friend = client.get("/safekeeps/state", headers=a).json()["friends"][0]
    assert friend["lastCheckIn"] is not None
    assert friend["resolvedAt"] is not None


def test_friend_nickname_is_private_persistent_and_used_for_requests(client):
    alice, a = profile(client, "Alice")
    bob, b = profile(client, "Bob")
    result = client.post("/safekeeps/friends", headers=a,
                         json={"code": bob["code"], "name": "  Bobby  "})
    assert result.status_code == 200
    assert accept(client, a, b)["friends"][0]["name"] == "Bobby"
    assert client.get("/safekeeps/state", headers=b).json()["me"]["name"] == "Bob"
    assert client.get("/safekeeps/state", headers=b).json()["friends"][0]["name"] == "Alice"
    with TestClient(app) as reopened:
        assert reopened.get("/safekeeps/state", headers=a).json()["friends"][0]["name"] == "Bobby"
    client.post(f"/safekeeps/friends/{alice['id']}/requests", headers=b, json={})
    assert client.get("/safekeeps/state", headers=a).json()["incoming"][0]["name"] == "Bobby"
    # A blank optional name preserves the saved nickname when re-adding a friend.
    client.post("/safekeeps/friends", headers=a, json={"code": bob["code"], "name": " "})
    assert client.get("/safekeeps/state", headers=a).json()["friends"][0]["name"] == "Bobby"
    client.post("/safekeeps/friends", headers=a, json={"code": bob["code"], "name": "Robert"})
    assert client.get("/safekeeps/state", headers=a).json()["friends"][0]["name"] == "Robert"


def test_remove_friend_clears_both_lists_and_requests_and_allows_readding(client):
    alice, a = profile(client, "Alice")
    bob, b = profile(client, "Bob")
    _, outsider = profile(client, "Other")
    client.post("/safekeeps/friends", headers=a, json={"code": bob["code"], "name": "Bobby"})
    accept(client, a, b)
    client.post(f"/safekeeps/friends/{alice['id']}/requests", headers=b, json={})
    path = f"/safekeeps/friends/{bob['id']}/remove"
    assert client.post(path, json={}).status_code == 401
    client.post(path, headers=outsider, json={})
    assert len(client.get("/safekeeps/state", headers=a).json()["friends"]) == 1
    assert client.post(path, headers=a, json={}).json()["friends"] == []
    assert client.get("/safekeeps/state", headers=a).json()["incoming"] == []
    with TestClient(app) as reopened:
        assert reopened.get("/safekeeps/state", headers=b).json()["friends"] == []
    assert client.post(f"/safekeeps/friends/{alice['id']}/requests", headers=b, json={}).status_code == 403
    assert client.post(path, headers=a, json={}).status_code == 200
    client.post("/safekeeps/friends", headers=a, json={"code": bob["code"]})
    restored = accept(client, a, b)["friends"][0]
    assert restored["name"] == "Bob"
    assert restored["requestedAt"] is None


def test_friend_requests_decline_permissions_and_duplicate_requests(client):
    alice, a = profile(client, 'Alice')
    bob, b = profile(client, 'Bob')
    _, outsider = profile(client, 'Other')
    for _ in range(2):
        client.post('/safekeeps/friends', headers=a, json={'code': bob['code']})
    assert len(client.get('/safekeeps/state', headers=b).json()['friendRequests']) == 1
    assert client.get('/safekeeps/state', headers=b).json()['friends'] == []
    path = f"/safekeeps/friend-requests/{alice['id']}"
    assert client.post(path + '/accept', headers=outsider, json={}).status_code == 404
    assert client.post(path + '/accept', json={}).status_code == 401
    assert client.post(f"/safekeeps/friends/{bob['id']}/requests", headers=a, json={}).status_code == 403
    client.post(path + '/decline', headers=b, json={})
    assert client.get('/safekeeps/state', headers=a).json()['sentRequests'] == []
    assert client.get('/safekeeps/state', headers=b).json()['friendRequests'] == []
    client.post('/safekeeps/friends', headers=a, json={'code': bob['code']})
    with TestClient(app) as reopened:
        assert reopened.get('/safekeeps/state', headers=b).json()['friendRequests'][0]['id'] == alice['id']
    accept(client, a, b)

