# Homebound

Homebound is a safety app for a night out. It gets help to someone who cannot ask for it, because they passed out or because someone with them stops them from asking.

The person sets a schedule, for example every 15 minutes. On that schedule, the app asks "Are you okay?". The person answers with one tap on the phone's check-in button, or three quick taps on the band. If nobody answers, the app alerts the person's friends, one group at a time, until a friend taps "I'm on it". Each friend needs Homebound too. It runs on iPhone and in a web browser.

We built it in 36 hours at Hack the Valley 11, a student hackathon. It is our entry for Project KAZE, a challenge sponsored by Swapna Samuel: get help to people who can no longer ask for it.

## Words used here

- Night: one outing that the app watches over. The person starts it and ends it.
- Check: the question "Are you okay?". "Check-in" means the same thing.
- Contacts: the friends who get alerts, in groups called Tier 1, Tier 2 and Tier 3. Tier 1 hears first.
- PIN: a 4-digit code that ends an alert that went out by mistake.
- Duress: being threatened. A duress signal asks for help in secret and looks like a normal answer.
- Duress PIN: a second 4-digit code. It looks like the real PIN but sends a secret alert.
- Duress contacts: the friends who get secret alerts. Nobody else sees this list.
- The band: an optional button that the person can tap instead of the phone. Ours is a prototype board, too big to wear yet.
- The server: the program that the phones talk to. It keeps every timer.

## How it works

- Three things start a check: the next scheduled time, a "be home by" time the person sets, or a friend who taps "Request check-in".
- The phone asks the person. If they have the band, it beeps and blinks too. If the person does not answer, the phone asks again and vibrates over and over. Then Tier 1 gets an alert with a card that says what to do. If nobody taps "I'm on it" in time, Tier 2 gets it. In the demo, each tier has 20 seconds.
- The server keeps the timers. If the phone turns off or loses its connection during a check, the alert still goes out.
- Duress: the person holds the check-in button for one second and then taps it twice. Or they type the duress PIN instead of the real PIN. Their phone looks the same as after a normal answer. In secret, only the duress contacts get an alert. A PIN cannot end it. A duress contact ends it in their app, with "Resolve".
- While a night runs, the phone sends its location to the server. Contacts see it only during an alert. The person chooses who: everyone alerted, or only the friend who taps "I'm on it".
- A "Find them" screen shows the friend an arrow to the person, and the distance. A "Ping" button makes the person's phone ring.
- With the app closed, the phone still shows "Homebound: Open the app." for each scheduled check. Friends can get alerts on a locked phone through the free ntfy app.

Homebound does not detect drugging or unconsciousness. It does not call emergency services. If nobody answers, a real product calls them. In the demo, that last step only shows a warning.

## What is real and what is simulated

- Passed with the band and two real iPhones: pairing the band, answering with it, the band waking a locked phone, and Ping.
- Passed on a real iPhone: the duress PIN, the alert moving to Tier 2, alerts and reminders on a locked phone, and checking in with VoiceOver (the iPhone screen reader).
- We restarted the server while nights were running. No night was lost.
- Built, not yet passed on hardware: the duress signal on the band, the band's signal on the "Find them" screen, and the "be home by" check. We have not measured battery life.
- Simulated from the demo panel, a web page we use to run the demo: friends getting separated, time passing, and the final emergency step.

`DEMO_NOTES.md` has the full lists and every hardware test with its date.

## The seven test cases from the challenge

Each case has an automated test in `server/tests/test_scenarios.py`.

| Case | What happens |
|---|---|
| 1. Safe | The person answers the check. Nobody gets an alert. |
| 2. No response | The person stays silent. Tier 1 gets an alert. |
| 3. Duress | The duress signal looks like a normal answer, and the duress contacts get an alert. |
| 4. Lost connection | The phone goes offline during a check. The alert still goes out. |
| 5. Nobody answers | Nobody taps "I'm on it". Tier 2 gets the alert. |
| 6. False alarm | The person's PIN, or the friend who said "I'm on it", ends the alert. |
| 7. Privacy | Only the contacts the person allowed see the location, and only during an alert. |

## Run it on one laptop

The repository is named htvaura. Its folders use our earlier names: `server/` is the server, and `safekeeps/` is the app. You need git, Python 3.10 or newer, and Node.js 22.18 or newer.

```
git clone https://github.com/Mystanile/htvaura.git && cd htvaura
```

Open two terminal windows in the `htvaura` folder.

1. In window 1, install and start the server. Replace `your-key` with a key for the demo panel. Leave the window open.

   ```
   (cd server && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt)
   (cd server && KAZE_DEMO_KEY=your-key .venv/bin/uvicorn kaze.app:app --port 8000)
   ```

2. In window 2, start the app:

   ```
   (cd safekeeps && npm install && EXPO_PUBLIC_API_URL=http://localhost:8000 npx expo start)
   ```

   In window 2, press `w`. The app opens in your browser at `http://localhost:8081`. This tab is person A. Type the same address into a new tab for person B. Do not use the browser's Duplicate Tab, because a copy keeps A's account.

3. Each tab makes its own guest account when it opens. Tab A shows its friend code on the Home screen. In tab B, enter it under "Add a friend" and tap "Send friend request". In tab A, tap "Accept".

4. In tab A, tap "Start a night". Type a PIN twice and a different duress PIN twice. Put B in Tier 1, switch on "Duress contact" for B, and tap "Start the night".

5. Open `http://localhost:8000/panel`. Type your key in "Demo key" and tap "Use key". The panel can start a check, skip time and reset.

To run the tests: `(cd server && .venv/bin/pytest -q)` and `(cd safekeeps && node --test src/services/*.test.ts)`.

## Run it with phones and the band

- Phones often cannot reach a laptop on hackathon Wi-Fi. Install cloudflared (`brew install cloudflared`) and run `cloudflared tunnel --url http://localhost:8000`. It prints a public address. Use that address instead of `http://localhost:8000`. You get a new address each time.
- To put the app on an iPhone, do the one-time Xcode setup in `PLAN.md`, section "iPhone build". Get the phone's UDID with `xcrun devicectl list devices`, then run `(cd safekeeps && CI=1 EXPO_PUBLIC_API_URL=<public address> npx expo run:ios --device <UDID> --configuration Release --no-bundler)`. If the address changes later, enter it in the app under Settings, Connection.
- To set up the band, open `Hardware/kaze_band/kaze_band.ino` in the Arduino IDE. Install the board package "Arduino UNO R4 Boards" and the library "ArduinoBLE". Connect the board by USB. Under Tools, set Board to "Arduino UNO R4 WiFi" and Port to its USB port, and click Upload. In the iPhone app, open Settings and tap "Pair band". The wiring is in `Hardware/kaze_band/HARDWARE.md`.
- For alerts on friends' locked phones, add two settings to the server command: `KAZE_NTFY_URL=https://ntfy.sh KAZE_NTFY_SECRET=$(openssl rand -hex 32)`. Each friend installs the ntfy app. Homebound shows their topic, a private channel name, under Settings, "Get alerts when the app is closed". They subscribe to it in ntfy.

## More

- `DEMO_SCRIPT.md`: the 5-minute demo.
- `VALIDATION.md`: the user studies we plan, and what is missing before a real release.
- `CODE_TOUR.md`: a walk through the code.
- `API.md`: every request the app sends to the server.
