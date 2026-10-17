"""ntfy push: one plain message per alerted contact, off by default, never breaks the loop. No network."""
from fastapi.testclient import TestClient
import httpx
import pytest

from kaze import app as app_module, safekeeps
from kaze.app import app
from test_bridge import NIGHT, people, start
from test_safekeeps import profile


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(safekeeps, "DB_PATH", tmp_path / "demo.sqlite3")
    monkeypatch.setenv("KAZE_NTFY_URL", "https://ntfy.example")
    monkeypatch.setenv("KAZE_NTFY_SECRET", "s3cret")
    with TestClient(app) as client:
        client.post("/demo/reset")
        yield client


@pytest.fixture
def sent(monkeypatch):
    log = []

    async def fake(url, topic):
        log.append(topic)

    monkeypatch.setattr(app_module, "send_ntfy", fake)
    return log


def topic(client, headers):
    return client.get("/safekeeps/push", headers=headers).json()["topic"]


def go_silent(client, alice, bob):
    client.post(f"/safekeeps/friends/{alice['id']}/requests", headers=bob, json={})
    client.post("/demo/skip", json={"seconds": 50})


def test_alerted_contact_gets_one_push(client, sent):
    (alice, a), (bob, b), (carol, c) = people(client, "Alice", "Bob", "Carol")
    start(client, a, [[bob["id"]]], [carol["id"]])
    go_silent(client, alice, b)
    assert sent == [topic(client, b)]  # Bob only: not Carol (duress only), not Alice


def test_duress_pushes_only_duress_contacts(client, sent):
    (alice, a), (bob, b), (carol, c) = people(client, "Alice", "Bob", "Carol")
    start(client, a, [[bob["id"]]], [carol["id"]])
    client.post(f"/safekeeps/friends/{alice['id']}/requests", headers=b, json={})
    client.post(NIGHT + "/events", headers=a, json={"type": "Duress"})
    assert sent == [topic(client, c)]
    assert topic(client, a) not in sent


def test_send_text_has_nothing_personal(client, monkeypatch):
    posts = []

    class Fake:
        def __init__(self, **kw): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): pass
        async def post(self, url, content, headers):
            posts.append((url, content, headers))
            return httpx.Response(200, request=httpx.Request("POST", url))

    monkeypatch.setattr(app_module.httpx, "AsyncClient", Fake)
    import asyncio
    asyncio.run(app_module.send_ntfy("https://ntfy.example/", "kaze-abc"))
    assert posts == [("https://ntfy.example/kaze-abc", "A SafeKeeps alert is waiting for you. Open the app.",
                      {"Title": "SafeKeeps", "Priority": "high", "Tags": "warning"})]


def test_off_without_url(client, sent, monkeypatch):
    monkeypatch.delenv("KAZE_NTFY_URL")
    (alice, a), (bob, b) = people(client, "Alice", "Bob")
    start(client, a, [[bob["id"]]], [bob["id"]])
    go_silent(client, alice, b)
    assert sent == []
    assert client.get("/safekeeps/push", headers=b).json() == {"topic": None, "url": None}


def test_no_send_without_secret(client, sent, monkeypatch):
    monkeypatch.delenv("KAZE_NTFY_SECRET")
    (alice, a), (bob, b) = people(client, "Alice", "Bob")
    start(client, a, [[bob["id"]]], [bob["id"]])
    go_silent(client, alice, b)
    assert sent == []
    assert topic(client, b) is None


def test_failing_send_does_not_break_the_countdown(client, monkeypatch):
    async def boom(url, topic):
        raise RuntimeError("ntfy is down")

    monkeypatch.setattr(app_module.httpx.AsyncClient, "post", boom)  # the real sender, with a failing network
    (alice, a), (bob, b) = people(client, "Alice", "Bob")
    start(client, a, [[bob["id"]]], [bob["id"]])
    go_silent(client, alice, b)
    assert client.get(NIGHT, headers=a).json()["view"]["state"] == "escalating"
    assert client.get(NIGHT, headers=b).json()["alerts"][0]["user_id"] == alice["id"]


def test_topic_is_only_the_callers_own(client):
    (alice, a), (bob, b) = people(client, "Alice", "Bob")
    ta, tb = topic(client, a), topic(client, b)
    assert ta.startswith("kaze-") and len(ta) == 25 and ta != tb
    assert client.get("/safekeeps/push", headers=a).json()["url"] == "https://ntfy.example"
    assert client.get("/safekeeps/push").status_code == 401


def test_ntfy_rejection_is_logged(caplog):
    import asyncio
    handler = lambda request: httpx.Response(429)
    real = httpx.AsyncClient
    app_module.httpx.AsyncClient = lambda **kw: real(transport=httpx.MockTransport(handler), **kw)
    try:
        with caplog.at_level("WARNING", logger="uvicorn.error"):
            asyncio.run(app_module.send_ntfy("https://ntfy.example", "kaze-abc"))
    finally:
        app_module.httpx.AsyncClient = real
    assert "ntfy push failed" in caplog.text


def test_pushes_are_sent_together(client, monkeypatch):
    import asyncio
    running = []
    peak = 0

    async def slow(url, topic):
        nonlocal peak
        running.append(topic)
        peak = max(peak, len(running))
        await asyncio.sleep(0.05)
        running.remove(topic)

    monkeypatch.setattr(app_module, "send_ntfy", slow)
    e = lambda to: type("E", (), {"kind": "alert", "to": to, "data": {"user_id": "u"}})()
    asyncio.run(app_module.notify([e("a"), e("b"), e("c")]))
    assert peak == 3
