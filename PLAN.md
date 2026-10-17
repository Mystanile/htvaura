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
- [x] 1.5 Hidden-alert refactor: the session is a front plus alerts, see Phase 1 interface
- [ ] 1.6 Fix the two open findings in "Where we stopped"
- [ ] 2.1 to 2.5 Expo app (teammate)
- [ ] 3.1 Demo panel
- [ ] 4.1 to 4.2 Find them
- [ ] 5.1 to 5.4 BLE band

## Where we stopped (2026-10-16)

Phase 1 is done and committed. Its tasks are 1.1 to 1.5 in the Status list above. All 143 server tests pass, including the 7 scenario tests. Run them with `cd server && .venv/bin/pytest -q`.

A third review left two open findings. Neither is fixed. The next session starts here.

1. Duress dropped right after a PIN end (safety bug, small window). After a correct or fake PIN end, the front sits in the internal `resolved` state until the next tick, which is at most 1 s. `Duress` and `Trigger` are ignored in that state, but the user view shows armed. So a duress signal sent in that second is lost, and no contact is told. Fix: in `step`, if the front is `resolved` and the event is `Duress` or `Trigger`, move the front to armed first, then handle the event. Repro: `/private/tmp/kaze_review3/round3/f2_duress_dropped_in_resolved.py`.
2. A contact who is in both the tiers and `duress_contacts` (for example, the sober contact in night-out mode) can cause a tell. Their `Ack` or `Resolve` goes to the hidden duress alert first, so the user's front alert stays escalating. An honest user's front alert would go to acknowledged. Fix: if the contact is allowed on the non-hidden front alert, the action also applies to that alert. The front alert then depends only on front rules, and hidden alerts keep the one-alert-per-action rule. Repros: `/private/tmp/kaze_review3/round3/f1_overlap_ack_tell.py`, `r1_shared_contact_ack.py`, and `r2_acknowledger_resolve_hits_duress.py`.

The repro scripts are in /private/tmp and get deleted on reboot. The descriptions above are enough to write a regression test for each.

Not fixed on purpose: there is no auth. Any client can send events for any user id. Fixing it needs per-user tokens, which would change the API. It is listed in DEMO_NOTES under Assumed.

After these two fixes, the next work is phase 3 (the demo panel). The teammate builds phase 2 in `app/` against `API.md`.

## Decisions

1. Check-in input. One tap on "I'm okay" means safe. Hold 3 s then two taps on the same button sends duress. Both show the same "Thanks!" screen.
2. Cancel PIN. The user sets a 4-digit PIN at setup. A PIN is needed to cancel an alert that already reached contacts (a false alarm or a duress alert).
3. Wrong PIN. The first wrong PIN is a silent retry: the screen shows a normal "Incorrect PIN, try again", nothing changes on the server, and no one is told. From the second wrong attempt on, the screen says "Alert ended". A person watching cannot tell. Contacts see "Someone tried to cancel with a wrong PIN." A small cue that only the user knows shows the truth. Correct PIN: filled check mark. Wrong PIN: outlined check mark, and the alert keeps going. When the alert ends, or after the fake end, the retry counter resets. So the third wrong PIN in a row shows the retry screen again.
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
  tests/test_loop.py        a few edge transitions and the hidden alert rules
  tests/test_twin.py        a watcher cannot tell a hidden alert: random twin test and the n1 to n4 cases
app/                  Expo (React Native) app, Expo Go
```

`loop.py` exposes one function: `step(session, event, now) -> (session, effects)`. Effects are plain data, for example "notify contact X with card Y" or "show user screen Z". `app.py` sends the effects over WebSocket. The ticker calls `step(session, Tick(), now)` every second. Because of this, countdowns run on the server and continue after a phone disconnects. The tests call `step` with fake times, so they run in milliseconds.

`view_for(session, viewer_id)` returns only what that viewer is allowed to see. All privacy rules live in this one function, and the server sends nothing else.

Storage is in memory. A server restart loses live sessions. Recent groups are saved on the phone with AsyncStorage.

## Phase 1 interface (loop.py, cards.py, app.py)

The code and the tests both follow this section. If the code and this section disagree, the code is wrong.

### loop.py

A session is a front plus a list of alerts.
- The front is the loop the user sees. It runs the same state machine for every user.
- An alert is what the contacts see. An alert can be hidden.

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
class Alert:
    kind: str                       # trigger kind, or "duress"
    tiers: list[list[str]]          # for duress each duress contact is its own tier
    tier_index: int = -1            # index of the tier last alerted
    alerted: list[str]              # every contact alerted, in order, no duplicates
    acknowledged_by: str | None = None
    deadline: float | None = None   # the ack timer
    state: str = "escalating"       # escalating, acknowledged, resolved, or duress
    hidden: bool = False
    location: tuple[float, float] | None = None   # the last position while this alert runs
    pin: str = ""                   # the PIN of the night that raised it

@dataclass
class Session:
    config: Config
    # the front
    state: str = "armed"            # armed asking waiting escalating acknowledged resolved ended
    deadline: float | None = None   # ask and grace timers only
    screen: str = "armed"           # what the user's phone shows, see screens below
    wrong_pins: int = 0
    check_kind: str | None = None   # why the current check started
    front_alert: Alert | None = None   # the user's own alert, while the front is escalating or acknowledged
    # the alerts
    alerts: list[Alert]
    connected: bool = True
    location: tuple[float, float] | None = None   # the front's own position, as for an honest user

@dataclass
class Effect:
    to: str        # a user or contact id
    kind: str      # see effect kinds below
    data: dict

def new_session(config: Config, now: float, carry: Session | None = None) -> Session
def step(session: Session, event, now: float) -> tuple[Session, list[Effect]]   # changes session in place
def view_for(session: Session, viewer_id: str) -> dict
```

Events are dataclasses: `Trigger(kind)` with kind in home_by, separation, periodic, manual. `ConfirmOk()`, `Duress()`, `Tick()`, `Ack(contact_id)`, `Resolve(by, pin=None)`, `Disconnect()`, `Reconnect()`, `LocationUpdate(lat, lng)`, `Leave()`.

User screens: `armed`, `asking`, `alarm`, `alert_active`, `thanks`, `pin_retry`, `ended_true`, `ended_fake`.

Effect kinds:
- To the user: `check` {kind, deadline}, `alarm` {deadline}, `screen` {screen}.
- To a contact: `alert` {user_id, kind, card, tier}, `owner` {user_id, acknowledged_by}, `resolved` {user_id}, `wrong_pin_warning` {user_id}.
- To group members: `left` {user_id}.

Front rules. The front reads only front fields and whether a PIN is right. It never looks at hidden alerts.
- Trigger works only in armed. It goes to asking, sends `check`, and starts the ask timer.
- ConfirmOk in armed, asking, or waiting goes to armed, clears the deadline, sets screen `thanks`, and sends exactly one effect: `screen` {screen: "thanks"} to the user. In other states it is ignored.
- A Tick past the deadline drives asking to waiting to escalating. Escalating creates the front alert and alerts its tier 1.
- Resolve with `by` equal to the user is the PIN. It works in every front state except ended.
  - Correct PIN: screen `ended_true`, wrong_pins reset. If the front has an alert, the front goes to resolved. The PIN also resolves every alert raised under that PIN, hidden or not. If the front has no alert, nothing else visible changes.
  - The front checks only the PIN of this night. An alert remembers the PIN of the night that raised it. A PIN from an older night is a wrong PIN for the front, but it still ends the alerts carried over from that night. So a watcher cannot end a carried alert by starting a new night with a PIN they pick.
  - First wrong PIN: screen `pin_retry`, one `screen` effect, nothing else.
  - Second and later wrong PIN: screen `ended_fake`. The front then acts exactly like a correct PIN. It goes to resolved if it had an alert, and wrong_pins is reset to 0. The alert it had is not resolved. It becomes hidden and keeps escalating. Every alerted contact of every active alert gets `wrong_pin_warning`.
  - The only difference the user ever sees between a correct and a wrong PIN is `ended_true` against `ended_fake`.
- On the next Tick, resolved goes to armed. It does not change `screen`. Armed or resolved goes to ended on a Tick after night_ends_at, and `left` goes to every group member. An active alert never ends because of the night end time.
- Leave in armed, asking, waiting, or resolved goes to ended and sends `left` to every group member. In escalating or acknowledged it is ignored, so the user must cancel with the PIN first. In ended it is ignored.

Alert rules. Contacts act on alerts and never on the front.
- Duress in armed, asking, or waiting makes the front do exactly what ConfirmOk does, so the user gets the same single `screen` thanks effect. It also starts a new hidden alert of kind duress. It does not start one if an unacknowledged duress alert for the same duress contacts is already active. An acknowledged one does not block it. That alert alerts duress contact 1 only. It never sends anything to a group member who is not in duress_contacts. In other front states Duress is ignored.
- Tick runs every alert's ack timer on its own. It does so after the front ended or left. After the last tier, every contact in every tier (or every duress contact) is re-alerted and the ack timer restarts.
- A contact acts on one alert at a time, the one on their screen. That is a duress alert first, else the newest. An alert that another contact already took comes last. `view_for`, Ack, and Resolve all pick the alert the same way. A contact who is alerted by two alerts never ends one by acting on the other.
- Ack from a contact applies to the alert that alerted this contact and has no acknowledger yet. A normal alert goes to acknowledged, clears its deadline, and sends `owner` to the other alerted contacts. A duress alert sets acknowledged_by, clears its deadline, sends `owner`, and its state stays duress. If the alert is the front alert, the front goes to acknowledged. Ack from a contact who was not alerted is ignored.
- Resolve with `by` equal to a contact applies to the alert on that contact's screen, if that contact is allowed. For a normal alert only its acknowledged_by contact is allowed. For a duress alert any contact in duress_contacts is allowed. A duress contact who has no alert on their screen yet may still end an active duress alert. `by=None` is always ignored. Anything else is ignored with no effects. The alert becomes resolved, its alerted contacts get `resolved`, and the alert forgets its location.
- Location. The front keeps one position, set by LocationUpdate. It is cleared whenever the front ends (correct PIN, 2nd wrong PIN, or the acknowledger resolves the front alert). It is not carried to a new night. Each alert also keeps its own position, set when it starts and updated by LocationUpdate. A contact sees the position of the alert on their screen. So a hidden alert never changes the position that a front alert shows, and ending a hidden alert never clears it.
- Resolving a hidden alert sends nothing to the user and does not touch the front. Resolving the front alert by its acknowledger also resolves the front. The user gets `screen` `ended_true` and wrong_pins is reset.
- Disconnect and Reconnect only change `connected`. LocationUpdate only stores the location. Neither sends effects.

### Front and alerts (hidden alerts)

The goal is that a watcher cannot tell that a hidden alert is running. This holds by construction. The user's view and effects come from front fields only, and the front runs the same code for every user. Nothing in the front reads the alerts list.

- An alert is hidden when it is a duress alert, or when it was the front alert and the user typed a second wrong PIN. A hidden alert has no link to the front.
- From the user's side, a hidden alert is invisible. The user's view is the front state, the screen, and the deadline, as for an honest user.
- A missed check-in while a hidden alert runs escalates to the normal tiers exactly as it does for an honest user. It is not suppressed. The user then has two alerts running. A contact who is alerted by both sees the duress one first.
- Night end and Leave only touch the front. Hidden alerts keep running. After the front is ended, the PIN is ignored, just as for an honest user. A duress contact or the acknowledging contact can still resolve the alert.
- `new_session(config, now, carry)` moves the still-active hidden alerts, each with its own location, into the new one. The new front starts with no location. The new night then shows nothing about them. Only the PIN of the night that raised them resolves them. The PIN of the new night does not.
- Why this is safe to rely on: `server/tests/test_twin.py` builds a hidden session and an honest session, sends both the same user events and random contact events, and checks that the user view and the user effects stay equal after every step. The only allowed difference is `ended_fake` against `ended_true`.

`view_for(session, viewer_id)`:
- For the user: `{"state", "screen", "deadline"}`. The state is the front state, and resolved shows armed. Deadline is only shown in asking and waiting. After the duress gesture, the user gets exactly the same dict as a user who tapped ok. The word "duress" never appears in the user's view.
- For anyone else: `{"user_id", "active": False}` unless the viewer is in `alerted` of an active alert. Then `{"user_id", "active": True, "kind", "card", "acknowledged_by", "location"}`. If the viewer is in more than one active alert, the alert on top is a duress alert first, else the newest one. An alert that another contact took comes last. If share_location_with is "alerted", or the viewer is acknowledged_by of that alert, location is the position of that alert. Otherwise it is None.

### cards.py

`card_for(kind) -> dict` with keys `title`, `do` (list of str), `dont` (list of str). Kinds: home_by, separation, periodic, manual, duress. The duress card tells the contact three things. Do not call their phone. Do not text to ask if they are okay. Do not go there alone.

### app.py

In-memory store, FastAPI, no auth. A clock `now() = time.time() + offset`. A background task ticks every session every second.

- `POST /users` {name} → {user_id}
- `POST /groups` {user_id} → {code}. `POST /groups/{code}/join` {user_id}.
- `POST /sessions` {user_id, group_code?, pin, tiers, duress_contacts, share_location_with?, ask_seconds?, grace_seconds?, ack_seconds?, night_ends_at?} starts a night. The group comes from the group's members. It returns 400 if duress_contacts is empty, if tiers is empty or has an empty tier, or if the user is in tiers or duress_contacts. It returns 409 {"detail": "session busy"} if the front of the user's session is escalating or acknowledged, and the old session stays as it was. This is what the user's own view shows, so an honest user gets the same answer. Otherwise it creates a new session and carries over the hidden alerts that still run.
- `POST /sessions/{user_id}/events` {type, ...fields} runs `step` and pushes the effects. Types match the event class names. A `pin` field that is not a string gives 400. It is never turned into a string, because a number would lose leading zeros.
- `GET /sessions/{user_id}/view?viewer=ID` → `view_for`.
- `GET /time` → {now}. This is the server clock with the demo offset.
- `GET /groups/{code}` → {code, members: [{user_id, name}]}. 404 if the code is unknown.
- `GET /alerts?viewer=ID` → {alerts: [view, ...]}. It holds the view of every session where this viewer has an active alert. A contact whose socket dropped uses it to catch up.
- `WS /ws/{id}`: the server pushes each effect for that id as JSON {kind, data}. The sends run in the background, so a stuck contact socket never slows a request from the user. Connecting sends Reconnect for that user's session, closing sends Disconnect.
- Demo only: `POST /demo/skip` {seconds} adds to the offset and ticks every session at once. `POST /demo/reset` clears everything.

## State machine

One session per user per night. A session has a front and a list of alerts.

The front has seven states: armed, asking, waiting, escalating, acknowledged, resolved, ended. The state "duress" from the CLAUDE.md list is not a front state. It is the state of an active duress Alert.

| From | Event | To | Effects |
|---|---|---|---|
| armed | trigger (home-by, separation, periodic, manual) | asking | user phone buzzes "Are you okay?", ask timer starts (demo 30 s) |
| asking | tap ok | armed | none to anyone else |
| asking | ask timer runs out | waiting | louder alarm on user phone, grace timer (demo 15 s) |
| waiting | tap ok | armed | none to anyone else |
| waiting | grace timer runs out | escalating | the front alert is created, tier 1 gets alert + response card, ack timer (demo 20 s) |
| armed / asking / waiting | duress gesture | armed (same as tap ok) | user sees normal "Thanks!". A hidden duress alert starts. Duress tier 1 gets silent alert + duress card, ack timer. |
| escalating | contact taps "I'm on it" | acknowledged | others told who owns it, location shared per settings |
| escalating / acknowledged | correct PIN, or acknowledging contact resolves | resolved | everyone in the alert told "resolved", location sharing stops |
| escalating / acknowledged | 1st wrong PIN | same state | user sees "Incorrect PIN, try again", no one told |
| escalating / acknowledged | 2nd+ wrong PIN | resolved | user sees fake "Alert ended" (outlined check). The alert becomes hidden and keeps escalating. Contacts warned. |
| armed / asking / waiting | correct PIN | same state | user sees "Alert ended" (filled check). Hidden alerts raised under that PIN are resolved. |
| armed / asking / waiting | 1st or 2nd+ wrong PIN | same state | the same screens as above, so nothing tells the user's case apart |
| resolved | (next tick) | armed | if the night is still running, else ended |
| armed / asking / waiting / resolved | leave, or night end time passes | ended | others see only "left". Hidden alerts keep running. |
| any | phone disconnects / reconnects | same state | recorded only. Timers keep running on the server. |

Alert states: escalating, acknowledged, resolved, and duress (an active duress alert).

| From | Event | To | Effects |
|---|---|---|---|
| escalating | ack timer runs out | escalating | next tier gets alert. After the last tier, all tiers get re-alerted. |
| duress | ack timer runs out | duress | next duress contact alerted. After the last, all duress contacts get re-alerted. |
| duress | duress contact taps "I'm on it" | duress | ack recorded |
| duress | correct PIN, or any duress contact resolves | resolved | duress contacts told, location stops. Group never sees anything. The user hears nothing if a contact resolves. |
| hidden alert | contact resolves | resolved | its contacts told. The user and the front do not change. |
| hidden alert | 2nd+ wrong PIN | same state | contacts warned |

What the user's own phone shows is the front, and the front never looks at the alerts. A hidden alert therefore cannot change what the user sees.

## The 7 scenarios (acceptance tests, `server/tests/test_scenarios.py`)

1. Safe. Trigger, then tap ok inside the window. Assert state is armed and no contact received any effect.
2. No response. Trigger, advance past ask + grace. Assert escalating and tier 1 got an alert with a card.
3. Duress. Duress gesture during asking. Assert the user view equals the normal "ok" view, duress contacts got an alert, and no group member got anything.
4. Connectivity failure. Trigger, send disconnect, advance time with ticks only. Assert escalation still happens on time.
5. Unacknowledged alert. Reach escalating, advance past the ack window with no ack. Assert tier 2 got the alert. Then ack from tier 2, assert acknowledged.
6. False alarm. Two cases: correct PIN from the user, and resolve from the acknowledging contact. Both reach resolved and stop location. Plus a wrong PIN case: the first wrong PIN gives "try again" and no contact effect. The second gives the fake "ended" view, the front acts as if the alert ended, the alert keeps escalating, and contacts get the warning.
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
