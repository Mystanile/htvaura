# KAZE (htvaura)

A group safety app for the Hack the Valley 11 Project KAZE challenge. Every trigger becomes a check first: the app asks "are you okay?". Three quick taps mean fine. Only silence or a hidden duress signal alerts your contacts.

- `PLAN.md`: the design and progress.
- `DEMO_NOTES.md`: what is real, simulated, and assumed.
- `VALIDATION.md`: the studies we plan, and the path to a real product.

## Run the server

You need Python 3.

```
cd server
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Start the server:

```
cd server && KAZE_DEMO_KEY=pick-a-word .venv/bin/uvicorn kaze.app:app --host 0.0.0.0 --port 8000
```

- `KAZE_DEMO_KEY` protects the demo panel data and the `/demo/*` routes. See "Demo panel and time skips" below.
- `KAZE_STATE` is the file for saved nights. The default is `server/kaze_state.pickle`. The server saves its state to this file every second and at shutdown, and loads it at start. So a restart does not lose a running night or alert. Reset on the panel deletes the file. Git ignores it. To use another file, add `KAZE_STATE=/path/to/file` before the command.

Run the tests:

```
cd server && .venv/bin/pytest -q
```

## Run the app

Hackathon Wi-Fi often blocks phones from reaching a laptop. To check, start the server and open `http://<laptop-ip>:8000/time` in Safari on a phone. If it does not load, use a tunnel. A tunnel gives the server a public https address that works on any Wi-Fi or on cellular.

1. Install cloudflared once: `brew install cloudflared`.
2. Start the server (see above).
3. Start the tunnel: `cloudflared tunnel --url http://localhost:8000`. It prints an address like `https://some-words.trycloudflare.com`. The address changes every time you start the tunnel.
4. Run the app, with one of the two ways below.

The app uses Bluetooth, location and sound modules. Expo Go cannot run them, so it cannot run the band features. Use the web version or the iPhone build.

### Web version

The web version works for everything except Bluetooth. Open two browser tabs. Each tab acts as one phone.

```
cd safekeeps
npm install
EXPO_PUBLIC_API_URL=https://some-words.trycloudflare.com npx expo start
```

Press `w`. Open the page in a second tab for the second phone.

### Build the app on an iPhone

This is the Release build. It has Bluetooth and the band features. It needs a Mac with Xcode, and a phone with a cable. Get the phone's UDID from `xcrun devicectl list devices`. Then run:

```
cd safekeeps && CI=1 EXPO_PUBLIC_API_URL=<tunnel address> npx expo run:ios --device <UDID> --configuration Release --no-bundler
```

The one-time setup is in `PLAN.md`, in the section "iPhone build". Every code change needs a new build. If the tunnel address changes, enter the new address in the app under Settings, Connection. No new build is needed for that. On each phone, tap "Start demo".

### Demo panel and time skips

To control the demo from a laptop browser, open the panel: `http://localhost:8000/panel`. It shows every night, hidden alerts included, and has buttons to fire triggers, disconnect a phone, set a location, skip time, and reset. It also has a guide for the 7 scenarios. When you use a tunnel, protect the panel with a key. Start the server with `KAZE_DEMO_KEY=pick-a-word`, then open `https://some-words.trycloudflare.com/panel`. The page asks for the key and sends it as a header, so the key never appears in the URL or the logs. With the key set, `/demo/state`, `/demo/event`, `/demo/skip` and `/demo/reset` need it too. If you start the server without a key, it logs a warning and the panel shows a red banner. Reset clears nights, users and groups. It does not delete the Safekeeps profiles.

To skip waiting without the panel, move the server clock forward:

```
curl -X POST "https://some-words.trycloudflare.com/demo/skip" -H 'X-Demo-Key: pick-a-word' -H 'content-type: application/json' -d '{"seconds": 60}'
```

## Flash the band

The band is an Arduino UNO R4 WiFi. Flash it with the Arduino IDE.

1. Open `Hardware/kaze_band/kaze_band.ino`.
2. Select the board "Arduino UNO R4 WiFi".
3. Install the library ArduinoBLE.
4. Check that `QUIET_MODE` is `false`, so the buzzer is on. For a test around other people, set it to `true` (LED only). It must be `false` for the demo.
5. Upload the sketch.

The pins, Bluetooth details and gestures are in `Hardware/kaze_band/HARDWARE.md`.

## Pair the band

In the app, open Settings, then Band, then "Pair band". After pairing, Home shows "Band connected. Start a night to use it." The server refuses band answers until a night runs. Once a night runs, Home shows "Band connected".

## Run the demo

The step-by-step script for the judges is in `DEMO_SCRIPT.md`.
