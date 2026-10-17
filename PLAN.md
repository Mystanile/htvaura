# KAZE (htvaura): build plan

## Context

Hack the Valley 11, Project KAZE challenge. Safety tools assume the person can make a visible request for help. We close the gap with a check-in loop. Every trigger becomes a check first ("are you okay?"). One tap means fine. Only silence or a hidden duress signal escalates. The repo has only `CLAUDE.md` and the brief PDF, so everything below is new.

A fresh session continues from this file. Mark tasks done in the Status section as they pass their tests.

## Status

- [x] 0.1 Setup docs and server folder
- [ ] 1.1 loop.py + cards.py
- [ ] 1.2 Scenario and loop tests
- [ ] 1.3 app.py server
- [ ] 2.1 to 2.5 Expo app
- [ ] 3.1 Demo panel
- [ ] 4.1 to 4.2 Find them
- [ ] 5.1 to 5.4 BLE band

## Decisions

1. Check-in input. One tap on "I'm okay" means safe. Hold 3 s then two taps on the same button sends duress. Both show the same "Thanks!" screen.
2. Cancel PIN. The user sets a 4-digit PIN at setup. A PIN is needed to cancel an alert that already reached contacts (a false alarm or a duress alert).
3. Wrong PIN. The first wrong PIN is a silent retry: the screen shows a normal "Incorrect PIN, try again", nothing changes on the server, and no one is told. From the second wrong attempt on, the screen says "Alert ended", so a person watching cannot tell, and contacts see "Someone tried to cancel with a wrong PIN." A small cue that only the user knows shows the truth. Correct PIN: filled check mark. Wrong PIN: outlined check mark, and the alert keeps going. The retry counter resets when the alert ends.
4. Ending duress. The user (correct PIN) or one of the duress contacts can end it.
5. Ranked tiers. The user ranks who gets alerted. Each tier is a list of people. If no one in a tier taps "I'm on it" in time, the next tier gets alerted. Modes are only presets of tiers:
   - Night out: tier 1 one chosen friend, tier 2 the whole group, tier 3 the sober contact who is not at the event.
   - Everyday: tier 1 contact A, tier 2 contact B.
6. Duress contacts are a separate private list. Duress never goes to the group.
7. Team phones are all iPhones. Phases 1 to 4 run in Expo Go. BLE (phase 5) needs a custom dev build from Xcode on a Mac.
8. Band hardware (phase 5): Arduino Uno R4 WiFi with ArduinoBLE, one Grove button, one Grove touch sensor, a Grove buzzer, and an LED. The button and the touch sensor behave the same as the app button: single tap = "I'm okay", hold 3 s then two taps = duress. Ping plays the buzzer and blinks the LED.

## Architecture

```
server/
  kaze/loop.py        state machine, pure Python, no I/O, no clock. Takes `now` as input.
  kaze/cards.py       response card text per alert kind
  kaze/app.py         FastAPI: REST + WebSocket, in-memory store, 1 s ticker, serves panel
  panel/index.html    demo control panel (plain HTML + JS)
  tests/test_scenarios.py   the 7 KAZE scenarios
  tests/test_loop.py        a few edge transitions
app/                  Expo (React Native) app, Expo Go
```

`loop.py` exposes one function: `step(session, event, now) -> (session, effects)`. Effects are plain data, for example "notify contact X with card Y" or "show user screen Z". `app.py` sends the effects over WebSocket. The ticker calls `step(session, Tick(), now)` every second, so countdowns run on the server and continue when a phone disconnects. The tests call `step` with fake times, so they run in milliseconds.

`view_for(session, viewer_id)` returns only what that viewer may see. All privacy rules live in this one function, and the server sends nothing else.

Storage is in memory. A server restart loses live sessions. Recent groups are saved on the phone with AsyncStorage.

## State machine

One session per user per night. States: armed, asking, waiting, escalating, acknowledged, resolved, duress.

| From | Event | To | Effects |
|---|---|---|---|
| armed | trigger (home-by, separation, periodic, manual) | asking | user phone buzzes "Are you okay?", ask timer starts (demo 30 s) |
| asking | tap ok | armed | none to anyone else |
| asking | ask timer runs out | waiting | louder alarm on user phone, grace timer (demo 15 s) |
| waiting | tap ok | armed | none to anyone else |
| waiting | grace timer runs out | escalating | tier 1 gets alert + response card, ack timer (demo 20 s) |
| escalating | ack timer runs out | escalating | next tier gets alert. After the last tier, all tiers get re-alerted. |
| escalating | contact taps "I'm on it" | acknowledged | others told who owns it, location shared per settings |
| escalating / acknowledged | correct PIN, or acknowledging contact resolves | resolved | everyone told "resolved", location sharing stops |
| escalating / acknowledged | 1st wrong PIN | same state | user sees "Incorrect PIN, try again", no one told |
| escalating / acknowledged | 2nd+ wrong PIN | same state | user sees fake "Alert ended" (outlined check), contacts warned |
| armed / asking / waiting | duress gesture | duress | user sees normal "Thanks!", duress tier 1 gets silent alert + duress card, ack timer |
| duress | ack timer runs out | duress | next duress contact alerted |
| duress | duress contact taps "I'm on it" | duress | ack recorded, state stays duress |
| duress | correct PIN, or duress contact resolves | resolved | duress contacts told, location stops. Group never sees anything. |
| duress | 1st wrong PIN | duress | "Incorrect PIN, try again", no one told |
| duress | 2nd+ wrong PIN | duress | fake "Alert ended" (outlined check), duress contacts warned |
| resolved | (next tick) | armed | if the night is still running, else the session ends |
| any | phone disconnects / reconnects | same state | recorded only. Timers keep running on the server. |
| any | user leaves group or night end time passes | session ends | others see only "left" |

What the user's own phone shows is also a projection. In duress, the user view always looks like armed.

## The 7 scenarios (acceptance tests, `server/tests/test_scenarios.py`)

1. Safe. Trigger, then tap ok inside the window. Assert state is armed and no contact received any effect.
2. No response. Trigger, advance past ask + grace. Assert escalating and tier 1 got an alert with a card.
3. Duress. Duress gesture during asking. Assert the user view equals the normal "ok" view, duress contacts got an alert, and no group member got anything.
4. Connectivity failure. Trigger, send disconnect, advance time with ticks only. Assert escalation still happens on time.
5. Unacknowledged alert. Reach escalating, advance past the ack window with no ack. Assert tier 2 got the alert. Then ack from tier 2, assert acknowledged.
6. False alarm. Two cases: correct PIN from the user, and resolve from the acknowledging contact. Both reach resolved and stop location. Plus a wrong PIN case: the first wrong PIN gives "try again" and no contact effect. The second gives the fake "ended" view, the state does not change, and contacts get the warning.
7. Privacy. Assert `view_for` gives no location to anyone while armed, gives location only to permitted contacts during an alert, gives none after resolved, and never shows duress to group members.

## Phases and tasks

Each task goes to a `builder` subagent. The `tester` subagent runs after each one. Commit after each passing task.

Phase 0: setup
- 0.1 Write `PLAN.md`, `DEMO_NOTES.md`, `README.md`. Create `server/` with `requirements.txt` (fastapi, uvicorn, pytest, httpx) and a venv.

Phase 1: loop and server
- 1.1 `loop.py` + `cards.py`: states, events, `step`, `view_for`, tiers, PIN logic.
- 1.2 `test_scenarios.py` + `test_loop.py`. Can be written in parallel with 1.1 against the interface above.
- 1.3 `app.py`: create/join group by code, start/end night, events over REST, WebSocket push, ticker. One integration test that runs scenario 4 over a real WebSocket with FastAPI's TestClient.

Phase 2: app (Expo Go)
- 2.1 Setup: name, cancel PIN, contacts, ranked tiers, private duress contacts, mode preset, location sharing setting.
- 2.2 Groups: create/join by code, end time, leave silently, recent groups for one-tap start.
- 2.3 Check-in screen: tap vs hold-3 s-plus-two-taps, countdown, "Thanks!", PIN cancel with filled vs outlined check.
- 2.4 Responder screen: alert with response card, "I'm on it", resolve.
- 2.5 Triggers: home-by time (expo-location vs a saved home point), periodic check-in, manual check. Separation comes from the demo panel only.

Phase 3: demo panel (`/panel` served by FastAPI)
- 3.1 Live list of all sessions and states. Buttons: fire trigger, disconnect phone, separate friend, contact ignores, skip time ahead, reset.

Phase 4: find them
- 4.1 During an active alert, the acknowledging friend sees a GPS arrow (expo-location position + heading) and distance.
- 4.2 "Ping" button: the person's phone plays a loud sound and flashes.

Phase 5: BLE band (only after phases 1 to 4 work)
- 5.1 iPhone dev build with react-native-ble-plx through Xcode.
- 5.2 Arduino sketch (`band/band.ino`): ArduinoBLE advertises one service with a "button event" characteristic (notify: ok or duress) and a "ping" characteristic (write). The same tap/hold/two-taps decoder reads the Grove button and the Grove touch sensor. A ping write plays the buzzer and blinks the LED.
- 5.3 Owner's phone subscribes to button events and forwards them to the server as tap ok or duress. A short haptic pattern on the band is not possible without a vibration motor, so the band shows "are you okay?" with a short buzzer chirp.
- 5.4 Finder's phone scans the band's advertising and shows hotter/colder from RSSI (signal strength), averaged over a few seconds. "Ping" writes to the band.

## Simulated or assumed (start of DEMO_NOTES.md)

- Simulated: group separation, the passage of time (skip button), contacts who do not respond, phone disconnects, the band (the phone acts as the band).
- Assumed: the band uses BLE only in the demo. On the Uno R4 WiFi, BLE and Wi-Fi share one radio chip, so a direct band-to-server Wi-Fi path is not built. Some path from the band to the server always exists (own phone, friend's phone relay, or home Wi-Fi). iOS background limits allow the check-in to reach the user. GPS is good to 5 to 10 m outdoors only.
- Not built: real SMS or calls, relay through friends' phones, encrypted relay payload, UWB precision finding.

## Hosting for the demo

The server runs on a laptop. If the venue Wi-Fi blocks phone-to-laptop traffic, a `cloudflared` tunnel gives the phones a public URL.

## Verification

- `cd server && pytest` runs the 7 scenarios and the loop tests. All must pass before each commit.
- Phase 1: start uvicorn, connect two WebSocket clients with a small script, and watch scenario 2 happen live.
- Phase 2 to 4: manual test on real iPhones in Expo Go. Each scenario is listed in `DEMO_NOTES.md` with how to trigger it from the panel. Real phones, BLE, and the Arduino band cannot be tested automatically. They are listed as manual tests.
