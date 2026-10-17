# KAZE (htvaura): build plan

## Context

Hack the Valley 11, Project KAZE challenge. Safety tools assume the person can make a visible request for help. We close the gap with a check-in loop. Every trigger becomes a check first ("are you okay?"). One tap means fine. Only silence or a hidden duress signal escalates. The repo has only `CLAUDE.md` and the brief PDF, so everything below is new.

A fresh session continues from this file. Mark tasks done in the Status section as they pass their tests.

## Status

- [x] 0.1 Setup docs and server folder
- [x] 1.1 loop.py + cards.py
- [x] 1.2 Scenario and loop tests
- [x] 1.3 app.py server
- [x] 1.4 API.md for the app
- [ ] 1.5 Hidden-alert refactor: 4 known tells remain, see Known issues
- [ ] 2.1 to 2.5 Expo app (teammate)
- [ ] 3.1 Demo panel
- [ ] 4.1 to 4.2 Find them
- [ ] 5.1 to 5.4 BLE band

## Known issues

A review found four ways a watcher can still tell that a hidden alert (duress or a fake "Alert ended") is running. Each has a repro script in /private/tmp/kaze_review2/ (n1 to n4), but those scripts are not in the repo.
- If the user is on `pin_retry` during a shadow check, the view says armed instead of escalating.
- `wrong_pins` is not reset after `ended_fake`. A later fake alert skips `pin_retry`.
- `POST /sessions` returns 409 only for a hidden alert. A normal user gets 200.
- If a contact resolves a hidden alert during a shadow check, the user's screen gets stuck.

## Decisions

1. Check-in input. One tap on "I'm okay" means safe. Hold 3 s then two taps on the same button sends duress. Both show the same "Thanks!" screen.
2. Cancel PIN. The user sets a 4-digit PIN at setup. A PIN is needed to cancel an alert that already reached contacts (a false alarm or a duress alert).
3. Wrong PIN. The first wrong PIN is a silent retry: the screen shows a normal "Incorrect PIN, try again", nothing changes on the server, and no one is told. From the second wrong attempt on, the screen says "Alert ended". A person watching cannot tell. Contacts see "Someone tried to cancel with a wrong PIN." A small cue that only the user knows shows the truth. Correct PIN: filled check mark. Wrong PIN: outlined check mark, and the alert keeps going. When the alert ends, the retry counter resets.
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

`loop.py` exposes one function: `step(session, event, now) -> (session, effects)`. Effects are plain data, for example "notify contact X with card Y" or "show user screen Z". `app.py` sends the effects over WebSocket. The ticker calls `step(session, Tick(), now)` every second. Because of this, countdowns run on the server and continue after a phone disconnects. The tests call `step` with fake times, so they run in milliseconds.

`view_for(session, viewer_id)` returns only what that viewer is allowed to see. All privacy rules live in this one function, and the server sends nothing else.

Storage is in memory. A server restart loses live sessions. Recent groups are saved on the phone with AsyncStorage.

## Phase 1 interface (loop.py, cards.py, app.py)

The code and the tests both follow this section. If the code and this section disagree, the code is wrong.

### loop.py

```python
@dataclass
class Config:
    user_id: str
    pin: str                        # 4 digits
    tiers: list[list[str]]          # ranked; each tier is a list of contact ids
    duress_contacts: list[str]      # ranked; each contact is its own tier
    group: list[str]                # group member ids, not including user_id
    share_location_with: str = "alerted"   # "alerted" or "acknowledger"
    ask_seconds: float = 30
    grace_seconds: float = 15
    ack_seconds: float = 20
    night_ends_at: float | None = None

@dataclass
class Session:
    config: Config
    state: str = "armed"            # armed asking waiting escalating acknowledged resolved duress ended
    deadline: float | None = None   # when the current timer runs out
    tier_index: int = -1            # index into tiers (or duress_contacts) last alerted
    alerted: list[str]              # every contact alerted for the current alert, in order, no duplicates
    acknowledged_by: str | None = None
    alert_kind: str | None = None   # trigger kind, or "duress"
    wrong_pins: int = 0
    connected: bool = True
    location: tuple[float, float] | None = None
    screen: str = "armed"           # what the user's phone shows, see screens below
    left: bool = False
    user_deadline: float | None = None  # timer of the shadow check in a hidden alert
    faked: bool = False             # the user was shown the fake "Alert ended"

@dataclass
class Effect:
    to: str        # a user or contact id
    kind: str      # see effect kinds below
    data: dict

def new_session(config: Config, now: float) -> Session
def step(session: Session, event, now: float) -> tuple[Session, list[Effect]]   # changes session in place
def view_for(session: Session, viewer_id: str) -> dict
```

Events are dataclasses: `Trigger(kind)` with kind in home_by, separation, periodic, manual. `ConfirmOk()`, `Duress()`, `Tick()`, `Ack(contact_id)`, `Resolve(by, pin=None)`, `Disconnect()`, `Reconnect()`, `LocationUpdate(lat, lng)`, `Leave()`.

User screens: `armed`, `asking`, `alarm`, `alert_active`, `thanks`, `pin_retry`, `ended_true`, `ended_fake`.

Effect kinds:
- To the user: `check` {kind, deadline}, `alarm` {deadline}, `screen` {screen}.
- To a contact: `alert` {user_id, kind, card, tier}, `owner` {user_id, acknowledged_by}, `resolved` {user_id}, `wrong_pin_warning` {user_id}.
- To group members: `left` {user_id}.

Rules beyond the state table:
- Trigger only works in armed. In a hidden alert it starts a shadow check, see "Hidden alerts" below.
- ConfirmOk in asking or waiting goes to armed, clears the deadline, sets screen `thanks`, and sends exactly one effect: `screen` {screen: "thanks"} to the user.
- Duress in armed, asking, or waiting sends the same single `screen` thanks effect to the user, then `alert` effects to duress contact 1 only. It never sends anything to a group member who is not in duress_contacts.
- A Tick past the deadline drives asking → waiting → escalating, and next tiers. After the last tier, every contact in every tier (or every duress contact) is re-alerted and the ack timer restarts.
- Ack from a contact who is not in `alerted` is ignored. In escalating it moves to acknowledged, clears the deadline, and sends `owner` to the other alerted contacts. In duress it sets acknowledged_by, clears the deadline, sends `owner`, and the state stays duress.
- `Resolve(by=user_id, pin=...)` works in escalating, acknowledged, and duress. Correct PIN: state resolved, screen `ended_true`, `resolved` to every alerted contact, location cleared, wrong_pins reset. First wrong PIN: screen `pin_retry`, one `screen` effect to the user, nothing else. Second and later wrong PIN: screen `ended_fake`, `screen` effect to the user, `wrong_pin_warning` to every alerted contact, state unchanged.
- `Resolve(by=contact)`: in escalating or acknowledged only the acknowledged_by contact can resolve. In duress any contact in duress_contacts can resolve. `by=None` is always ignored. Anything else is ignored with no effects.
- On the next Tick, resolved goes to armed. It does not change `screen`. If the user left, or now is past night_ends_at, it goes to ended instead. Armed goes to ended on a Tick after night_ends_at. An active alert never ends because of the night end time.
- Whenever the night ends in the normal way (Leave, or night end in armed or resolved), `left` goes to every group member.
- Leave in armed, asking, or waiting: state ended, `left` to every group member. In a hidden alert: left = True, `left` to group members, the alert keeps running, and the user view shows ended. In escalating or acknowledged that is not hidden: ignored, the user must cancel with the PIN first.

### Hidden alerts

An alert is hidden when the state is duress, or when the state is escalating or acknowledged and the user was shown the fake "Alert ended" (`faked`, screen `ended_fake`). The user of a hidden alert must always see exactly what an ok user would see. These rules make that true.
- A contact who resolves a hidden alert sends nothing to the user and does not change `screen`. Only the user with the correct PIN sets screen `ended_true`.
- Shadow check. Trigger in a hidden alert sends the user the same `check` effect, sets screen `asking`, and sets `user_deadline` to now plus ask_seconds. The real alert keeps running and no contact is told. A Tick past `user_deadline` moves the shadow to `alarm` (`alarm` effect, deadline plus grace_seconds), then to `alert_active` (`screen` effect, no deadline). ConfirmOk or Duress during the shadow check sends `screen` thanks and clears `user_deadline`. Trigger is ignored while a shadow check shows, and after the user left.
- Leave sets `left`, sends `left` to the group, and clears the shadow timer. It is ignored while the shadow shows `alert_active`, just like an ok user in an alert.
- Night end. A Tick past night_ends_at sets `left` and sends `left` to the group. It waits until a shadow check is answered.
- The user view is derived from the screen. `asking` shows asking with `user_deadline`. `alarm` shows waiting with `user_deadline`. `alert_active` shows escalating with no deadline. Every other screen shows armed. If `left` is set it shows ended with no deadline. The view has no field an ok user's view does not have.
- Known gap. If a contact resolves a hidden alert in the middle of a shadow check, the shadow check stops and the screen is left as it was.
- Disconnect and Reconnect only change `connected`. LocationUpdate only stores the location. Neither sends effects.

`view_for(session, viewer_id)`:
- For the user: `{"state", "screen", "deadline"}`. The state shown is the real state, with two exceptions. Resolved shows armed. A hidden alert shows the state derived from the screen, see "Hidden alerts". Deadline is only shown in asking and waiting. After the duress gesture, the user must get exactly the same dict as a user who tapped ok. The word "duress" never appears in the user's view.
- For anyone else: `{"user_id", "active": False}` unless the viewer is in `alerted` and the state is escalating, acknowledged, or duress. Then `{"user_id", "active": True, "kind", "card", "acknowledged_by", "location"}`. If share_location_with is "alerted", or the viewer is acknowledged_by, location is the stored location. Otherwise it is None.

### cards.py

`card_for(kind) -> dict` with keys `title`, `do` (list of str), `dont` (list of str). Kinds: home_by, separation, periodic, manual, duress. The duress card tells the contact three things. Do not call their phone. Do not text to ask if they are okay. Do not go there alone.

### app.py

In-memory store, FastAPI, no auth. A clock `now() = time.time() + offset`. A background task ticks every session every second.

- `POST /users` {name} → {user_id}
- `POST /groups` {user_id} → {code}. `POST /groups/{code}/join` {user_id}.
- `POST /sessions` {user_id, group_code?, pin, tiers, duress_contacts, share_location_with?, ask_seconds?, grace_seconds?, ack_seconds?, night_ends_at?} starts a night. The group comes from the group's members. It returns 400 if duress_contacts is empty. It returns 409 {"detail": "session busy"} if the user's session is escalating, acknowledged, or duress, and the old session stays as it was. Otherwise it replaces the old session.
- `POST /sessions/{user_id}/events` {type, ...fields} runs `step` and pushes the effects. Types match the event class names. A `pin` field that is not a string gives 400. It is never turned into a string, because a number would lose leading zeros.
- `GET /sessions/{user_id}/view?viewer=ID` → `view_for`.
- `GET /time` → {now}. This is the server clock with the demo offset.
- `GET /groups/{code}` → {code, members: [{user_id, name}]}. 404 if the code is unknown.
- `GET /alerts?viewer=ID` → {alerts: [view, ...]}. It holds the view of every session where this viewer has an active alert. A contact whose socket dropped uses it to catch up.
- `WS /ws/{id}`: the server pushes each effect for that id as JSON {kind, data}. Connecting sends Reconnect for that user's session, closing sends Disconnect.
- Demo only: `POST /demo/skip` {seconds} adds to the offset and ticks every session at once. `POST /demo/reset` clears everything.

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

What the user's own phone shows is also a projection. In a hidden alert, the user view always looks like an ok user's view.

## The 7 scenarios (acceptance tests, `server/tests/test_scenarios.py`)

1. Safe. Trigger, then tap ok inside the window. Assert state is armed and no contact received any effect.
2. No response. Trigger, advance past ask + grace. Assert escalating and tier 1 got an alert with a card.
3. Duress. Duress gesture during asking. Assert the user view equals the normal "ok" view, duress contacts got an alert, and no group member got anything.
4. Connectivity failure. Trigger, send disconnect, advance time with ticks only. Assert escalation still happens on time.
5. Unacknowledged alert. Reach escalating, advance past the ack window with no ack. Assert tier 2 got the alert. Then ack from tier 2, assert acknowledged.
6. False alarm. Two cases: correct PIN from the user, and resolve from the acknowledging contact. Both reach resolved and stop location. Plus a wrong PIN case: the first wrong PIN gives "try again" and no contact effect. The second gives the fake "ended" view, the state does not change, and contacts get the warning.
7. Privacy. Assert that `view_for` gives no location to anyone while armed. During an alert, it gives location only to permitted contacts. After resolved, it gives none. It never shows duress to group members.

## Phases and tasks

Each task goes to a `builder` subagent. The `tester` subagent runs after each one. Commit after each passing task.

Phase 0: setup
- 0.1 Write `PLAN.md`, `DEMO_NOTES.md`, `README.md`. Create `server/` with `requirements.txt` (fastapi, uvicorn, pytest, httpx) and a venv.

Phase 1: loop and server
- 1.1 `loop.py` + `cards.py`: states, events, `step`, `view_for`, tiers, PIN logic.
- 1.2 `test_scenarios.py` + `test_loop.py`. Can be written in parallel with 1.1 against the interface above.
- 1.3 `app.py`: create/join group by code, start/end night, events over REST, WebSocket push, ticker. One integration test that runs scenario 4 over a real WebSocket with FastAPI's TestClient.

Phase 2: app (Expo Go)

A teammate owns `app/` and phase 2. Do not build or edit anything in `app/`. She builds the app against `API.md`, which is written after task 1.3.

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
- 5.3 Owner's phone subscribes to button events and forwards them to the server as tap ok or duress. The band has no vibration motor. It asks "are you okay?" with a short buzzer chirp.
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
