"""The Safekeeps bridge over HTTP: her tokens and friends drive the check-in loop."""
from fastapi.testclient import TestClient
import pytest

from kaze.app import app
from kaze import safekeeps
from test_safekeeps import accept, profile

NIGHT = "/safekeeps/night"


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(safekeeps, "DB_PATH", tmp_path / "demo.sqlite3")
    with TestClient(app) as client:
        client.post("/demo/reset")
        yield client


def befriend(client, a, b, b_code):
    client.post("/safekeeps/friends", headers=a, json={"code": b_code})
    accept(client, a, b)


def people(client, *names):
    """Profiles who are all friends with the first one: [(me, headers), ...]."""
    made = [profile(client, n) for n in names]
    for me, h in made[1:]:
        befriend(client, made[0][1], h, me["code"])
    return made


def start(client, headers, tiers, duress, **extra):
    return client.post(NIGHT, headers=headers, json={"pin": "1234", "tiers": tiers, "duress_contacts": duress} | extra)


def alerts(client, headers):
    return client.get(NIGHT, headers=headers).json()["alerts"]


def test_two_phones_full_flow(client):
    (alice, a), (bob, b), (carol, c) = people(client, "Alice", "Bob", "Carol")
    assert client.get(NIGHT, headers=a).json()["view"] is None
    assert start(client, a, [[bob["id"]]], [carol["id"]]).json()["view"]["state"] == "armed"
    # Bob asks Alice to check in: a real check on her phone.
    assert client.post(f"/safekeeps/friends/{alice['id']}/requests", headers=b, json={}).status_code == 200
    mine = client.get(NIGHT, headers=a).json()
    assert mine["view"]["state"] == "asking"
    assert mine["alerts"] == []                     # her own night never shows up in her alerts
    assert alerts(client, b) == []
    client.post("/demo/skip", json={"seconds": 50})  # silence
    assert client.get(NIGHT, headers=a).json()["view"]["state"] == "escalating"
    seen = alerts(client, b)
    assert [x["user_id"] for x in seen] == [alice["id"]] and seen[0]["card"]["do"]
    assert alerts(client, c) == []                   # a duress contact is not alerted by a normal alert
    assert client.post(f"/safekeeps/alerts/{alice['id']}/ack", headers=b).status_code == 200
    assert client.get(NIGHT, headers=a).json()["view"]["state"] == "acknowledged"
    assert alerts(client, b)[0]["acknowledged_by"] == bob["id"]
    assert client.post(f"/safekeeps/alerts/{alice['id']}/resolve", headers=b).status_code == 200
    assert client.get(NIGHT, headers=a).json()["view"]["state"] == "armed"
    assert alerts(client, b) == []


def test_check_in_endpoint_answers_the_check(client):
    (alice, a), (bob, b) = people(client, "Alice", "Bob")
    start(client, a, [[bob["id"]]], [bob["id"]])
    client.post(f"/safekeeps/friends/{alice['id']}/requests", headers=b, json={})
    assert client.get(NIGHT, headers=a).json()["view"]["state"] == "asking"
    client.post("/safekeeps/check-ins", headers=a, json={})
    assert client.get(NIGHT, headers=a).json()["view"]["screen"] == "thanks"
    assert client.get("/safekeeps/state", headers=a).json()["incoming"] == []


def friends_view(client, headers):
    """What a friend's data shows, with ids, codes and times reduced to present or not."""
    s = client.get("/safekeeps/state", headers=headers).json()
    return {
        "me": s["me"]["lastCheckIn"] is not None,
        "friends": [{k: (v is not None if k.endswith("At") or k == "lastCheckIn" else v)
                     for k, v in f.items() if k != "id"} for f in s["friends"]],
        "incoming": [{"name": i["name"], "at": i["requestedAt"] is not None} for i in s["incoming"]],
    }


def duress_world(client, event):
    (alice, a), (bob, b), (carol, c) = people(client, "Alice", "Bob", "Carol")
    start(client, a, [[bob["id"]]], [carol["id"]])
    client.post(f"/safekeeps/friends/{alice['id']}/requests", headers=b, json={})
    client.post(f"/safekeeps/friends/{alice['id']}/requests", headers=c, json={})
    assert client.post(NIGHT + "/events", headers=a, json={"type": event}).status_code == 200
    seen = {n: friends_view(client, h) for n, h in (("alice", a), ("bob", b), ("carol", c))}
    seen["alice_screen"] = client.get(NIGHT, headers=a).json()["view"]
    return seen, alerts(client, b), alerts(client, c)


def test_duress_leaves_friends_data_identical_to_an_ok_twin(client):
    ok, ok_bob, ok_carol = duress_world(client, "ConfirmOk")
    client.post("/demo/reset")
    dur, dur_bob, dur_carol = duress_world(client, "Duress")
    assert dur == ok
    assert ok["alice"]["me"] is True and ok["alice"]["incoming"] == []
    assert ok["bob"]["friends"][0]["lastCheckIn"] is True and ok["bob"]["friends"][0]["resolvedAt"] is True
    # Only the private duress contact learns of it, and never the other friend.
    assert ok_bob == ok_carol == [] and dur_bob == []
    assert [x["kind"] for x in dur_carol] == ["duress"]


def test_start_night_checks(client):
    (alice, a), (bob, b), (carol, c) = people(client, "Alice", "Bob", "Carol")
    _, stranger = profile(client, "Stranger")
    stranger_id = client.get("/safekeeps/state", headers=stranger).json()["me"]["id"]
    bad = [
        start(client, a, [[stranger_id]], [bob["id"]]),                 # not a friend
        start(client, a, [[bob["id"]]], [stranger_id]),
        start(client, a, [[alice["id"]]], [bob["id"]]),                 # not their own friend
        start(client, a, [[bob["id"]]], []),                            # no duress contacts
        start(client, a, [], [bob["id"]]),
    ]
    assert [r.status_code for r in bad] == [400] * 5
    assert client.post(NIGHT, headers=a, json={"pin": 1234, "tiers": [[bob["id"]]], "duress_contacts": [bob["id"]]}).status_code == 422
    for bad_time in ({"check_every_minutes": 0}, {"ask_seconds": -1}):
        assert start(client, a, [[bob["id"]]], [bob["id"]], **bad_time).status_code == 422
    assert client.get(NIGHT, headers=a).json()["view"] is None
    assert start(client, a, [[bob["id"]]], [carol["id"]]).status_code == 200
    # Busy: no new night while the front is in an alert.
    client.post(f"/safekeeps/friends/{alice['id']}/requests", headers=b, json={})
    client.post("/demo/skip", json={"seconds": 50})
    assert client.get(NIGHT, headers=a).json()["view"]["state"] == "escalating"
    assert start(client, a, [[bob["id"]]], [carol["id"]]).status_code == 409


def test_every_endpoint_needs_a_token(client):
    body = {"pin": "1", "tiers": [["x"]], "duress_contacts": ["x"]}  # valid, so only the token can fail
    for method, path in (("get", NIGHT), ("post", NIGHT), ("post", NIGHT + "/events"),
                         ("post", "/safekeeps/alerts/x/ack"), ("post", "/safekeeps/alerts/x/resolve")):
        for headers in ({}, {"Authorization": "Bearer bad"}):
            r = getattr(client, method)(path, headers=headers, **({} if method == "get" else {"json": body}))
            assert r.status_code == 401, (method, path)


def test_events_are_limited_and_checked(client):
    (alice, a), (bob, b) = people(client, "Alice", "Bob")
    events = NIGHT + "/events"
    assert client.post(events, headers=a, json={"type": "ConfirmOk"}).status_code == 404  # no night yet
    start(client, a, [[bob["id"]]], [bob["id"]])
    for bad in ({"type": "Trigger", "kind": "manual"}, {"type": "Tick"}, {"type": "Ack", "contact_id": "x"},
                {"type": "Disconnect"}, {"type": "Nope"}, {},
                {"type": "Resolve"}, {"type": "Resolve", "pin": 1234},
                {"type": "LocationUpdate", "lat": 99, "lng": 0}):
        assert client.post(events, headers=a, json=bad).status_code == 400, bad
    assert client.post(events, headers=a, json={"type": "LocationUpdate", "lat": 43.6, "lng": -79.4}).status_code == 200
    # Resolve is always by the caller: a "by" in the body is ignored.
    assert client.post(events, headers=a, json={"type": "Resolve", "pin": "0000", "by": bob["id"]}).status_code == 200
    assert client.get(NIGHT, headers=a).json()["view"]["screen"] == "pin_retry"
    assert client.post(events, headers=a, json={"type": "Leave"}).status_code == 200
    assert client.get(NIGHT, headers=a).json()["view"]["state"] == "ended"


def test_a_friend_who_was_not_alerted_cannot_ack_or_resolve(client):
    (alice, a), (bob, b), (dan, d) = people(client, "Alice", "Bob", "Dan")
    start(client, a, [[bob["id"]]], [bob["id"]])
    client.post(f"/safekeeps/friends/{alice['id']}/requests", headers=b, json={})
    client.post("/demo/skip", json={"seconds": 50})
    for action in ("ack", "resolve"):
        assert client.post(f"/safekeeps/alerts/{alice['id']}/{action}", headers=d).status_code == 200
    assert client.get(NIGHT, headers=a).json()["view"]["state"] == "escalating"
    assert alerts(client, d) == [] and alerts(client, b)[0]["acknowledged_by"] is None
    assert client.post("/safekeeps/alerts/nobody/ack", headers=d).status_code == 200  # the same answer for any owner


def test_periodic_check_fires_and_escalates_with_no_polling(client):
    (alice, a), (bob, b) = people(client, "Alice", "Bob")
    start(client, a, [[bob["id"]]], [bob["id"]], check_every_minutes=0.5)  # every 30 s
    client.post("/demo/skip", json={"seconds": 29})
    assert client.get(NIGHT, headers=a).json()["view"]["state"] == "armed"
    client.post("/demo/skip", json={"seconds": 2})                          # nobody called anything in between
    assert client.get(NIGHT, headers=a).json()["view"]["state"] == "asking"
    client.post("/demo/skip", json={"seconds": 50})
    seen = alerts(client, b)
    assert [x["kind"] for x in seen] == ["periodic"]


def test_alerts_never_shows_a_duress_alert_to_a_friend_who_is_not_a_duress_contact(client):
    (alice, a), (bob, b), (carol, c), (dan, d) = people(client, "Alice", "Bob", "Carol", "Dan")
    start(client, a, [[bob["id"]]], [carol["id"]])
    client.post(NIGHT + "/events", headers=a, json={"type": "Duress"})
    assert alerts(client, b) == [] and alerts(client, d) == [] and alerts(client, a) == []
    assert [x["kind"] for x in alerts(client, c)] == ["duress"]
    assert client.get(NIGHT, headers=a).json()["view"]["screen"] == "thanks"
    # The non-duress friend cannot end it either.
    client.post(f"/safekeeps/alerts/{alice['id']}/resolve", headers=b)
    assert [x["kind"] for x in alerts(client, c)] == ["duress"]
    client.post(f"/safekeeps/alerts/{alice['id']}/resolve", headers=c)
    assert alerts(client, c) == []


def escalate(client, a, b, alice):
    """Alice has a location and Bob (tier 1) asks her to check in. She stays silent."""
    client.post(NIGHT + "/events", headers=a, json={"type": "LocationUpdate", "lat": 43.7, "lng": -79.4})
    client.post(f"/safekeeps/friends/{alice['id']}/requests", headers=b, json={})
    client.post("/demo/skip", json={"seconds": 50})
    assert client.get(NIGHT, headers=a).json()["view"]["state"] == "escalating"


def test_a_removed_friend_keeps_the_running_night_until_it_ends(client):
    """Replaces test_a_removed_friend_cannot_see_ack_or_resolve_a_running_night (decision 9)."""
    (alice, a), (bob, b), (carol, c) = people(client, "Alice", "Bob", "Carol")
    start(client, a, [[bob["id"]]], [carol["id"]])
    escalate(client, a, b, alice)
    before = alerts(client, b)
    assert before[0]["location"] == [43.7, -79.4]
    client.post(f"/safekeeps/friends/{bob['id']}/remove", headers=a)
    assert alerts(client, b) == before
    assert client.post(f"/safekeeps/alerts/{alice['id']}/ack", headers=b).status_code == 200
    assert client.get(NIGHT, headers=a).json()["view"]["state"] == "acknowledged"
    assert client.post(f"/safekeeps/alerts/{alice['id']}/resolve", headers=b).status_code == 200
    assert client.get(NIGHT, headers=a).json()["view"]["state"] == "armed"
    assert alerts(client, b) == []
    # The next night needs a current friend.
    assert start(client, a, [[bob["id"]]], [carol["id"]]).status_code == 400


def skip(client, seconds):
    client.post("/demo/skip", json={"seconds": seconds})


def test_f1_removing_a_friend_does_not_cancel_a_fake_ended_alert(client):
    (x, hx), (a, ha), (b, hb) = people(client, "X", "A", "B")
    start(client, hx, [[a["id"]]], [b["id"]])
    client.post(f"/safekeeps/friends/{x['id']}/requests", headers=ha, json={})
    skip(client, 31)
    skip(client, 16)
    for pin in ("0000", "1111"):  # two wrong PINs: the screen says "Alert ended", the alert goes on
        client.post(NIGHT + "/events", headers=hx, json={"type": "Resolve", "pin": pin})
    before = alerts(client, ha)
    assert [v["kind"] for v in before] == ["manual"]
    client.post(f"/safekeeps/friends/{a['id']}/remove", headers=hx)
    assert alerts(client, ha) == before
    skip(client, 100)
    assert [v["kind"] for v in alerts(client, ha)] == ["manual"]


def test_f2_a_removed_duress_contact_acts_the_same_in_a_hidden_and_an_honest_night(client):
    def world(event):
        (x, hx), (a, ha), (b, hb) = people(client, "X", "A", "B")
        start(client, hx, [[b["id"]], [a["id"]]], [b["id"]], check_every_minutes=1)
        client.post(NIGHT + "/events", headers=hx, json={"type": event})
        skip(client, 61)
        skip(client, 31)
        skip(client, 16)
        client.post(f"/safekeeps/friends/{b['id']}/remove", headers=hx)
        ack = client.post(f"/safekeeps/alerts/{x['id']}/ack", headers=hb)
        after_ack = client.get(NIGHT, headers=hx).json()["view"]
        skip(client, 21)
        return [(ack.status_code, ack.json()), after_ack, alerts(client, ha),
                client.post(f"/safekeeps/alerts/{x['id']}/resolve", headers=hb).status_code,
                client.get(NIGHT, headers=hx).json()["view"]]

    hidden = world("Duress")
    client.post("/demo/reset")
    honest = world("ConfirmOk")
    assert hidden == honest
    assert honest[1]["state"] == "acknowledged"  # B was a tier 1 contact all night, so the ack counts
    assert honest[2] == []                       # and tier 2 is not called


def test_r1_a_removed_shared_contact_cannot_tell_the_phone_holder_apart(client, monkeypatch):
    monkeypatch.setattr("kaze.bridge.MANUAL_COOLDOWN", 0)  # the cooldown reads the real clock

    def world(event):
        (u, uh), (e, eh), (b, bh) = people(client, "U", "E", "Bob")
        start(client, uh, [[e["id"]], [b["id"]]], [e["id"]], ask_seconds=5, grace_seconds=5, ack_seconds=20)
        client.post(NIGHT + "/events", headers=uh, json={"type": event})
        client.post(f"/safekeeps/friends/{e['id']}/remove", headers=uh)
        client.post(f"/safekeeps/friends/{u['id']}/requests", headers=bh, json={})
        skip(client, 6)
        skip(client, 6)
        ack = client.post(f"/safekeeps/alerts/{u['id']}/ack", headers=eh)
        skip(client, 21)
        res = client.post(f"/safekeeps/alerts/{u['id']}/resolve", headers=eh)
        again = start(client, uh, [[b["id"]]], [b["id"]]).status_code
        return [(ack.status_code, ack.json()), (res.status_code, res.json()), again,
                client.get(NIGHT, headers=uh).json()["view"]]

    hidden = world("Duress")
    client.post("/demo/reset")
    honest = world("ConfirmOk")
    assert hidden == honest


def test_f3_ack_and_resolve_answer_the_same_for_anyone(client):
    (x, hx), (a, ha), (b, hb), (c, hc) = people(client, "X", "A", "B", "C")
    seen = set()

    def probe():
        for who in (hc, ha):
            for owner in (x["id"], "nobody"):
                for act in ("ack", "resolve"):
                    r = client.post(f"/safekeeps/alerts/{owner}/{act}", headers=who)
                    seen.add((r.status_code, str(r.json())))

    probe()  # no night
    start(client, hx, [[a["id"]]], [b["id"]])
    probe()  # a quiet night, and C is not a contact
    client.post(NIGHT + "/events", headers=hx, json={"type": "Leave"})
    probe()  # the night is over
    assert seen == {(200, str({"ok": True}))}
    assert client.post(f"/safekeeps/alerts/{x['id']}/ack", headers={}).status_code == 401


def hidden_twin_world(client, how):
    """Alice, Bob (tier 1), Carol (duress contact) and Dan (a friend, no part in the night). Alice's phone is held:
    `how` is "duress" or "fake_end" for the hidden world and "honest" for the twin. Everything after the hiding step
    is the same in both. Returns every step: what each person's screen and data show and each response."""
    (alice, a), (bob, b), (carol, c), (dan, d) = people(client, "Alice", "Bob", "Carol", "Dan")
    who = {"alice": a, "bob": b, "carol": c, "dan": d}
    start(client, a, [[bob["id"]]], [carol["id"]])
    client.post(f"/safekeeps/friends/{alice['id']}/requests", headers=b, json={})
    if how in ("duress", "honest_duress"):
        client.post(NIGHT + "/events", headers=a, json={"type": "Duress" if how == "duress" else "ConfirmOk"})
    else:
        skip(client, 31)
        skip(client, 16)
        pins = ("0000", "1111") if how == "fake_end" else ("1234",)
        for pin in pins:
            client.post(NIGHT + "/events", headers=a, json={"type": "Resolve", "pin": pin})
    sees = {"carol"} if how in ("duress", "honest_duress") else {"bob"}  # who may legitimately see an alert
    steps = []

    def snap(label, response=None):
        shot = {}
        for name, h in who.items():
            mine = client.get(NIGHT, headers=h).json()
            shot[name] = {"view": mine["view"], "state": friends_view(client, h)}
            shot[name]["alerts"] = "skipped" if name in sees else mine["alerts"]
        steps.append((label, shot, response))

    snap("hidden")
    for name in ("bob", "carol"):
        client.post(f"/safekeeps/friends/{locals()[name]['id']}/remove", headers=a)
    snap("removed")
    skip(client, 100)
    snap("later")
    for name in ("carol", "bob", "dan"):
        for act in ("ack", "resolve"):
            r = client.post(f"/safekeeps/alerts/{alice['id']}/{act}", headers=who[name])
            snap(f"{name} {act}", (r.status_code, r.json()))
    return steps


def test_http_twin_a_hidden_alert_looks_like_an_honest_one_after_a_friend_is_removed(client):
    for hidden, honest in (("duress", "honest_duress"), ("fake_end", "honest_fake_end")):
        client.post("/demo/reset")
        a_steps = hidden_twin_world(client, hidden)
        client.post("/demo/reset")
        b_steps = hidden_twin_world(client, honest)
        assert [s[0] for s in a_steps] == [s[0] for s in b_steps]
        for x, y in zip(a_steps, b_steps):
            for step in (x, y):  # only Alice may know the check mark is outlined: ended_fake is her private cue
                if step[1]["alice"]["view"]["screen"] == "ended_fake":
                    step[1]["alice"]["view"]["screen"] = "ended_true"
            assert x == y, (hidden, x[0])


def test_a_contact_cannot_ack_or_resolve_their_own_night(client):
    (alice, a), (bob, b) = people(client, "Alice", "Bob")
    start(client, a, [[bob["id"]]], [bob["id"]])
    escalate(client, a, b, alice)
    for _ in range(2):
        assert client.post(f"/safekeeps/alerts/{alice['id']}/resolve", headers=a).status_code == 400
    assert client.post(f"/safekeeps/alerts/{alice['id']}/ack", headers=a).status_code == 400
    view = client.get(NIGHT, headers=a).json()["view"]
    assert (view["state"], view["screen"]) == ("escalating", "alert_active")


def test_a_check_request_needs_a_contact_and_a_quiet_phone(client, monkeypatch):
    (alice, a), (bob, b) = people(client, "Alice", "Bob")
    start(client, a, [[bob["id"]]], [bob["id"]])
    # A friend added after the night started is not named by it.
    late, late_h = profile(client, "Late")
    befriend(client, a, late_h, late["code"])
    ask = lambda h: client.post(f"/safekeeps/friends/{alice['id']}/requests", headers=h, json={})
    assert ask(late_h).status_code == 200
    assert client.get(NIGHT, headers=a).json()["view"]["state"] == "armed"
    # Bob is a contact, so his request counts, once. Right after she answers, it does not.
    ask(b)
    assert client.get(NIGHT, headers=a).json()["view"]["state"] == "asking"
    client.post(NIGHT + "/events", headers=a, json={"type": "ConfirmOk"})
    for _ in range(5):
        ask(b)
        assert client.get(NIGHT, headers=a).json()["view"]["state"] == "armed"
    monkeypatch.setattr("kaze.bridge.MANUAL_COOLDOWN", 0)
    ask(b)
    assert client.get(NIGHT, headers=a).json()["view"]["state"] == "asking"


def test_phase1_endpoints_refuse_the_ids_of_safekeeps_phones(client):
    (alice, a), (bob, b), (carol, c) = people(client, "Alice", "Bob", "Carol")
    start(client, a, [[bob["id"]]], [carol["id"]])
    client.post(NIGHT + "/events", headers=a, json={"type": "Duress"})
    assert [x["kind"] for x in alerts(client, c)] == ["duress"]
    raw = [
        client.get("/alerts", params={"viewer": carol["id"]}),
        client.get(f"/sessions/{alice['id']}/view", params={"viewer": carol["id"]}),
        client.post(f"/sessions/{alice['id']}/events", json={"type": "Resolve", "by": carol["id"], "pin": None}),
        client.post(f"/sessions/{alice['id']}/events", json={"type": "Ack", "contact_id": carol["id"]}),
        client.post("/sessions", json={"user_id": alice["id"], "pin": "0000", "tiers": [[bob["id"]]],
                                       "duress_contacts": [bob["id"]]}),
    ]
    assert [r.status_code for r in raw] == [403] * 5
    # Nothing changed: Carol still holds the hidden alert and Alice's night is her own.
    assert [x["kind"] for x in alerts(client, c)] == ["duress"]
    client.post(NIGHT + "/events", headers=a, json={"type": "Duress"})
    assert [x["kind"] for x in alerts(client, c)] == ["duress"]
    mallory = client.post("/users", json={"name": "Mallory"}).json()["user_id"]
    named = client.post("/sessions", json={"user_id": mallory, "pin": "1", "tiers": [[carol["id"]]],
                                           "duress_contacts": [carol["id"]]})
    assert named.status_code == 403
    assert client.post("/groups", json={"user_id": alice["id"]}).status_code == 403
    with pytest.raises(Exception):
        with client.websocket_connect(f"/ws/{carol['id']}"):
            pass


HUGE = '{"type": "LocationUpdate", "lat": 1' + "0" * 400 + ', "lng": 0}'


def test_a_huge_integer_location_is_a_400_not_a_crash(client):
    (alice, a), (bob, b) = people(client, "Alice", "Bob")
    start(client, a, [[bob["id"]]], [bob["id"]])
    json_type = {"Content-Type": "application/json"}
    assert client.post(NIGHT + "/events", headers=a | json_type, content=HUGE).status_code == 400
    raw = client.post("/users", json={"name": "Raw"}).json()["user_id"]
    other = client.post("/users", json={"name": "Other"}).json()["user_id"]
    client.post("/sessions", json={"user_id": raw, "pin": "1", "tiers": [[other]], "duress_contacts": [other]})
    assert client.post(f"/sessions/{raw}/events", headers=json_type, content=HUGE).status_code == 400


def test_a_socket_opened_before_the_night_gets_no_duress_alert(client):
    """Carol's id is not protected until a night names her. A socket opened on it before that has no token."""
    import time
    from kaze.app import sockets
    (alice, a), (bob, b), (carol, c) = people(client, "Alice", "Bob", "Carol")

    class Spy:  # stands in for the stranger's accepted socket
        sent = []

        async def send_json(self, message):
            self.sent.append(message)

    spy = Spy()
    sockets[carol["id"]] = [spy]
    start(client, a, [[bob["id"]]], [carol["id"]])
    client.post(NIGHT + "/events", headers=a, json={"type": "Duress"})
    time.sleep(0.2)  # the push runs in the background
    assert [x["kind"] for x in alerts(client, c)] == ["duress"]  # Carol's phone still gets it, by polling
    assert spy.sent == []


def test_too_many_contacts_are_a_400(client):
    (alice, a), (bob, b) = people(client, "Alice", "Bob")
    assert start(client, a, [[bob["id"]] * 1000], [bob["id"]]).status_code == 400
    assert start(client, a, [[bob["id"]]] * 51, [bob["id"]]).status_code == 400
    assert start(client, a, [[bob["id"]]] * 49, [bob["id"]]).status_code == 200


def test_removing_a_duress_contact_does_not_cancel_the_duress_alert(client):
    (alice, a), (bob, b), (carol, c) = people(client, "Alice", "Bob", "Carol")
    start(client, a, [[bob["id"]]], [carol["id"]])
    client.post(NIGHT + "/events", headers=a, json={"type": "Duress"})
    client.post(f"/safekeeps/friends/{carol['id']}/remove", headers=a)  # one tap on Alice's phone
    assert [x["kind"] for x in alerts(client, c)] == ["duress"]
    assert client.post(f"/safekeeps/alerts/{alice['id']}/ack", headers=c).status_code == 200
    assert alerts(client, c)[0]["acknowledged_by"] == carol["id"]
    assert client.post(f"/safekeeps/alerts/{alice['id']}/resolve", headers=c).status_code == 200
    assert alerts(client, c) == []


def test_a_huge_skip_is_a_400_and_never_breaks_the_clock(client):
    (alice, a), (bob, b) = people(client, "Alice", "Bob")
    start(client, a, [[bob["id"]]], [bob["id"]])
    assert client.post("/demo/skip", json={"seconds": 1e308}).status_code == 400
    assert client.post("/demo/skip", json={"seconds": 1e308}).status_code == 400
    assert client.get("/time").status_code == 200
    assert client.get(NIGHT, headers=a).status_code == 200


def test_token_less_endpoints_answer_the_same_before_and_after_a_night_starts(client):
    """A friend who was never alerted must not learn that a night started (API.md). The old answers came from a set
    that the bridge filled at night start."""
    (x, hx), (a, ha), (b, hb) = people(client, "X", "A", "B")

    plain = client.post("/users", json={"name": "plain"}).json()["user_id"]  # a token-less phase 1 user
    code = client.post("/groups", json={"user_id": plain}).json()["code"]

    def probe():
        out = []
        for pid in (x["id"], a["id"]):  # the owner and a contact named by the night
            out += [client.get("/alerts", params={"viewer": pid}).status_code,
                    client.get(f"/sessions/{pid}/view", params={"viewer": "z"}).status_code,
                    client.post("/groups", json={"user_id": pid}).status_code,
                    client.post(f"/groups/{code}/join", json={"user_id": pid}).status_code,
                    client.post("/sessions", json={"user_id": pid, "pin": "1234", "tiers": [[plain]],
                                                   "duress_contacts": [plain]}).status_code]
        return out

    before = probe()
    assert set(before) == {403}  # a profile id is refused the same way, never by night
    start(client, hx, [[a["id"]]], [b["id"]])
    assert probe() == before
    client.post(NIGHT + "/events", headers=hx, json={"type": "Leave"})
    assert probe() == before


def test_a_poll_survives_a_night_starting_in_another_thread(client, monkeypatch):
    """GET /safekeeps/night and GET /alerts run in worker threads while a POST can add a session."""
    from kaze import app as app_module, bridge
    (alice, a), (bob, b) = people(client, "Alice", "Bob")
    start(client, a, [[bob["id"]]], [bob["id"]])
    real = bridge.view_for

    def adding(session, viewer):
        app_module.sessions["late"] = session  # a new night appears mid-walk
        return real(session, viewer)

    monkeypatch.setattr(bridge, "view_for", adding)
    assert client.get(NIGHT, headers=b).status_code == 200
    app_module.sessions.pop("late", None)
    monkeypatch.setattr(bridge, "view_for", real)
    monkeypatch.setattr(app_module, "view_for", adding)
    assert client.get("/alerts", params={"viewer": "someone"}).status_code == 200


def test_a_hidden_alert_carries_into_the_next_night_for_a_removed_friend(client):
    """Decision 9 exception, in API.md: a hidden alert outlives the night, so cutting the friend off by
    remove, Leave, new night would cancel it."""
    (x, hx), (a, ha), (b, hb) = people(client, "X", "A", "B")
    start(client, hx, [[a["id"]]], [b["id"]])
    client.post(NIGHT + "/events", headers=hx, json={"type": "Duress"})
    assert [v["kind"] for v in alerts(client, hb)] == ["duress"]
    client.post(f"/safekeeps/friends/{b['id']}/remove", headers=hx)
    client.post(NIGHT + "/events", headers=hx, json={"type": "Leave"})
    assert start(client, hx, [[a["id"]]], [a["id"]]).status_code == 200
    assert [v["kind"] for v in alerts(client, hb)] == ["duress"]
