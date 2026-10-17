# KAZE (htvaura)

A group safety app for the Hack the Valley 11 Project KAZE challenge. Every trigger becomes a check first: the app asks "are you okay?". Three quick taps mean fine. Only silence or a hidden duress signal alerts your contacts.

See `PLAN.md` for the design and progress, and `DEMO_NOTES.md` for what is real, simulated, and assumed.

## Run the server

You need Python 3.

```
cd server
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Start the server:

```
cd server && .venv/bin/uvicorn kaze.app:app --host 0.0.0.0 --port 8000
```

Run the tests:

```
cd server && .venv/bin/pytest -q
```

## Run the demo on real phones

Hackathon Wi-Fi often blocks phones from reaching a laptop. To check, start the server and open `http://<laptop-ip>:8000/time` in Safari on a phone. If it does not load, use a tunnel. A tunnel gives the server a public https address that works on any Wi-Fi or on cellular.

1. Install cloudflared once: `brew install cloudflared`.
2. Start the server (see above).
3. Start the tunnel: `cloudflared tunnel --url http://localhost:8000`. It prints an address like `https://some-words.trycloudflare.com`. The address changes every time you start the tunnel.
4. Start the app with that address:

```
cd safekeeps
npm install
EXPO_PUBLIC_API_URL=https://some-words.trycloudflare.com npx expo start --tunnel
```

`--tunnel` lets Expo Go load the app when the Wi-Fi blocks the laptop. We have not tested `--tunnel` yet. If it fails, put the laptop and phones on one phone's hotspot for this step.

5. Scan the QR code with Expo Go on each iPhone. On each phone, tap "Start demo". If the app already saved an old address, change it in Settings under Connection.

To skip waiting during a demo, move the server clock forward:

```
curl -X POST https://some-words.trycloudflare.com/demo/skip -H 'content-type: application/json' -d '{"seconds": 60}'
```
