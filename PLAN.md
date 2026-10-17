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
- [x] 1.6 Fix the two open findings from the third review, and add periodic check-ins to the loop
- [x] 2.0 Server bridge for safekeeps (me), review findings fixed, see "Where we stopped"
- [ ] 2.1 to 2.5 Safekeeps app screens (teammate)
- [x] 3.1 Demo panel (`server/kaze/panel.py`, `server/panel/index.html`, `server/tests/test_panel.py`). Not yet tried on real phones.
- [ ] 4.1 to 4.2 Find them
- [ ] 5.1 to 5.4 BLE band

## Handoff: start here (2026-10-17, about 09:00)

A new session continues from this section. Read it first, then the Status list above.

Where the code is:
- `main` has the server: loop, bridge, demo panel. 201 server tests pass (`cd server && .venv/bin/pytest -q`).
- Branch `checkin-screens` has the teammate's app with tasks 2.1, 2.3, 2.4 added, plus `main` merged in. Pull request #1 (https://github.com/Mystanile/htvaura/pull/1) is open and waits for the teammate's review. Do not merge it without the user.
- A second checkout of that branch is at `~/Desktop/kaze-app` (git worktree), with `node_modules` installed. Run the demo from there.
- `Hardware/kaze_band/kaze_band.ino` has uncommitted changes by the user in the main folder. Do not commit or touch them.

How the demo runs (these processes die when the session that started them ends, so check and restart them):
1. Server: `cd ~/Desktop/kaze-app/server && KAZE_DEMO_KEY=<pick one> ~/Desktop/kaze/server/.venv/bin/uvicorn kaze.app:app --host 0.0.0.0 --port 8000`. The key protects `/panel` data and `/demo/*` through the `X-Demo-Key` header. The user knows the current key. Never commit it.
2. Tunnel, because the venue Wi-Fi blocks phone-to-laptop traffic (checked: Safari on a phone could not reach the laptop): `cloudflared tunnel --url http://localhost:8000`. The address changes on every start, so the phones and the panel need the new one.
3. App: `cd ~/Desktop/kaze-app/safekeeps && EXPO_PUBLIC_API_URL=<tunnel address> npx expo start --tunnel`, then Expo Go on the iPhones.
4. Panel: `<tunnel address>/panel`, then type the key.

Rules from the user for this repo:
- No "Co-Authored-By: Claude" line in commits and no Claude line in pull requests. The user wants to be the only contributor.
- The teammate owns `safekeeps/`. Preserve her design. Change her app only on a branch with a pull request, and only when the user asks.
- Open question, not decided: rewriting `main` to remove the old Claude co-author lines needs a force push. Do not do it unless the user asks again.

Not tested yet: the app on real iPhones (vibration, real taps, `expo start --tunnel`), and the panel on real phones.

Next steps, in order:
1. Two real iPhones through the tunnel, running the `checkin-screens` app. Fix what breaks.
2. Phase 4, find them (4.1 GPS arrow with expo-location and heading, 4.2 "ping" that makes the person's phone ring and flash). Give the user a short plan and wait for a go first.
3. Phase 5 on the user's Mac: a development build of the teammate's app in Xcode (5.1, try one plain build on one iPhone early), then the band relay in the app (5.3), then RSSI hotter and colder (5.4). The spec is `Hardware/kaze_band/HARDWARE.md`.
4. Task 2.5: the home-by-time trigger.
5. Before judging: update `README.md` and `DEMO_NOTES.md` (Demonstrated, Simulated, Assumed).

## History of earlier stops

### Where we stopped (2026-10-17)

Phase 1 is done and committed. Its tasks are 1.1 to 1.5 in the Status list above. All server tests pass, including the 7 scenario tests. Run them with `cd server && .venv/bin/pytest -q`.

A third review left two findings. Both are fixed in task 1.6, each with a regression test.

1. Duress or Trigger right after a PIN end. The front now acts as armed for Trigger, ConfirmOk, and Duress in that window. Tests: `test_duress_right_after_a_pin_end_still_alerts`, `test_trigger_right_after_a_pin_end_starts_a_check`, `test_confirm_ok_right_after_a_pin_end_shows_thanks` in `test_loop.py`.
2. A contact in both the tiers and `duress_contacts`. Their Ack and Resolve now also reach the user's front alert. Tests: the three `test_n5_*` cases in `test_twin.py`. The random twin test also puts such contacts in the config.

Not fixed on purpose: the demo-panel path has no auth. Any client can send events for any id from `POST /users`. The Safekeeps path has per-user tokens, and the phase 1 endpoints now refuse the ids of Safekeeps phones (bridge review, 2026-10-17). `/demo/reset` and `/demo/skip` stay open. It is listed in DEMO_NOTES under Assumed.

On 2026-10-17 the teammate pushed an Expo app in `safekeeps/` with its own server module, `server/kaze/safekeeps.py`. It has token logins, friends added by code, and manual check-ins, but it did not use the loop. The next work is task 2.0, which bridges her app to the loop. Phase 3 (the demo panel) comes after that.

Task 2.0 (the bridge) is done: `server/kaze/bridge.py` and `server/tests/test_bridge.py`, with 184 server tests passing. Two small planned edits went into the teammate's `server/kaze/safekeeps.py`: `record_check_in()`, and the manual trigger when a friend asks for a check. The final bridge review left three findings. All three are fixed now, with 189 server tests passing. The bridge checks callers against the night's own config (decision 9) and `reaches()` is gone. The repro scripts are in `/private/tmp/kaze_bridge_review/round3/`.

1. (high) Removing friends cancelled a fake-ended alert for every contact. Fixed. Tests in `test_bridge.py`: `test_f1_removing_a_friend_does_not_cancel_a_fake_ended_alert` and the fake end half of `test_http_twin_a_hidden_alert_looks_like_an_honest_one_after_a_friend_is_removed`.
2. (medium) A removed friend who is also a duress contact could ack or resolve the normal alert, which an honest twin refused. Fixed. Tests: `test_f2_a_removed_duress_contact_acts_the_same_in_a_hidden_and_an_honest_night`, `test_r1_a_removed_shared_contact_cannot_tell_the_phone_holder_apart`, `test_a_removed_friend_keeps_the_running_night_until_it_ends` (it replaces `test_a_removed_friend_cannot_see_ack_or_resolve_a_running_night`), and the duress half of the HTTP twin test.
3. (low) Ack and resolve answered 200 or 404 depending on whether the owner had a night. Fixed. They now always answer 200 with `{"ok": true}` (401 only for a bad token, 400 for your own id). Test: `test_f3_ack_and_resolve_answer_the_same_for_anyone`. `test_a_friend_who_was_not_alerted_cannot_ack_or_resolve` now expects 200 for an unknown owner.

A fourth review left three low findings, all fixed, with 192 server tests passing.

1. `GET /safekeeps/night` and `GET /alerts` walked `sessions` lazily, so a night starting in another thread could give a 500. They now walk a copy. Test: `test_a_poll_survives_a_night_starting_in_another_thread`.
2. The docs said a removal applies from the next night, but a hidden alert carries over. The code stays (decision 9). The docs now state the exception. Test: `test_a_hidden_alert_carries_into_the_next_night_for_a_removed_friend`.
3. The token-less phase 1 endpoints refused an id only after its night started, which told a friend that a night exists. `profile_ids` is gone. `app.is_profile()` looks the id up in the Safekeeps `people` table, so the answer never depends on a night. Test: `test_token_less_endpoints_answer_the_same_before_and_after_a_night_starts`. A last review found that `POST /groups`, `POST /groups/{code}/join` and `POST /sessions` still checked `need_user` first, and its answer changed once a night named an id. They now refuse profile ids first. The same test now probes those three endpoints with a real group code.

The teammate's folder has a second, unused Expo project at `safekeeps/safekeeps/`, which looks like an accident. We flag it to her and do not delete it.

## Decisions

1. Check-in input (changed 2026-10-17). The app button and the band use the same gestures. 3 quick taps within 1.5 s = "I'm okay". Hold 1 s, then 2 quick taps within 2.5 s = duress. Hold 1 s and then nothing = "I'm okay" after 2.5 s. 1 or 2 taps and then nothing = nothing. `Hardware/kaze_band/HARDWARE.md` is the source of truth. Ok and duress show the same "Thanks!" screen, and the band gives the same single flash and beep.
2. Cancel PIN. The user sets a 4-digit PIN at setup. A PIN is needed to cancel an alert that already reached contacts (a false alarm or a duress alert).
3. Wrong PIN. The first wrong PIN is a silent retry: the screen shows a normal "Incorrect PIN, try again", nothing changes on the server, and no one is told. From the second wrong attempt on, the screen says "Alert ended". A person watching cannot tell. Contacts see "Someone tried to cancel with a wrong PIN." A small cue that only the user knows shows the truth. Correct PIN: filled check mark. Wrong PIN: outlined check mark, and the alert keeps going. When the alert ends, or after the fake end, the retry counter resets. So the third wrong PIN in a row shows the retry screen again.
4. Ending duress. The user (correct PIN) or one of the duress contacts can end it.
5. Ranked tiers. The user ranks who gets alerted. Each tier is a list of people. If no one in a tier taps "I'm on it" in time, the next tier gets alerted. Modes are only presets of tiers:
   - Night out: tier 1 one chosen friend, tier 2 the whole group, tier 3 the sober contact who is not at the event.
   - Everyday: tier 1 contact A, tier 2 contact B.
6. Duress contacts are a separate private list. Duress never goes to the group.
7. Team phones are all iPhones. Phases 1 to 4 run in Expo Go. BLE (phase 5) needs a custom dev build from Xcode on a Mac.
8. Band hardware (phase 5): Arduino Uno R4 WiFi with ArduinoBLE, one Grove button, one Grove touch sensor, a Grove buzzer, and an LED. The button and the touch sensor use the same gestures as the app (decision 1). Ping plays the buzzer and blinks the LED. The full spec is in `Hardware/kaze_band/HARDWARE.md`: pins, BLE UUIDs, event bytes, ask and ping behavior, and RSSI measured at the venue.
9. Removing a friend during a night (decided 2026-10-17). Contacts are fixed when the night starts. If the user removes a friend while a night is running, the removal applies from the next night. For the rest of the current night, the removed friend still gets alerts, location, ack, and resolve exactly as before. Reason: if removal applied at once, a person holding the phone could remove contacts to cancel a hidden alert, and every workaround for that created a new tell. Cost: a friend removed mid-night can still see that night's alerts and location until the night ends. Exception: a hidden alert (duress or fake end) carries into the next night with its contacts, so a removed friend keeps it, with live location, until it is resolved. Test: `test_a_hidden_alert_carries_into_the_next_night_for_a_removed_friend`.

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
safekeeps/            Expo (React Native) app, Expo Go (teammate)
server/kaze/safekeeps.py   profiles, tokens, friends in SQLite (teammate)
server/kaze/bridge.py      links safekeeps profiles and friends to the loop (me)
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
    check_every_seconds: float | None = None   # periodic check-ins, off when None

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
    next_check: float | None = None    # while armed: when the next periodic check starts
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
- Periodic check-ins. If `check_every_seconds` is set, the front plans a check whenever it becomes armed. That is at the start of the night, after ConfirmOk or Duress, and when resolved goes back to armed. It sets `next_check` to now plus that many seconds. A Tick in armed at or after `next_check` does exactly what `Trigger("periodic")` does. It never fires after the night end time. It reads only front fields, so it is the same for every user. If the field is None, nothing fires.
- Resolved is only the one second after a PIN end. The user view shows armed, so Trigger, ConfirmOk, and Duress first move the front from resolved to armed and then run as in armed.
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
- Ack from a contact applies to the alert that alerted this contact and has no acknowledger yet. A normal alert goes to acknowledged, clears its deadline, and sends `owner` to the other alerted contacts. A duress alert sets acknowledged_by, clears its deadline, sends `owner`, and its state stays duress. If the alert is the front alert, the front goes to acknowledged. Ack from a contact who was not alerted is ignored. If this contact was also alerted by the front alert and it has no acknowledger yet, the same Ack takes the front alert too. So a contact in both the tiers and `duress_contacts` gives the same front result as for an honest user. Two hidden alerts still need one Ack each.
- Resolve with `by` equal to a contact applies to the alert on that contact's screen, if that contact is allowed. For a normal alert only its acknowledged_by contact is allowed. For a duress alert any contact in duress_contacts is allowed. A duress contact who has no alert on their screen yet may still end an active duress alert. `by=None` is always ignored. Anything else is ignored with no effects. The alert becomes resolved, its alerted contacts get `resolved`, and the alert forgets its location. If this contact may also end the front alert (they are its acknowledger), that alert ends in the same step.
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

Phase 2: app (Expo Go) and bridge

A teammate owns `safekeeps/` and tasks 2.1 to 2.5. Do not edit anything in `safekeeps/`. She builds against the "Safekeeps bridge" section of `API.md`. Her app polls the server. It does not use WebSockets.

- 2.0 (me) Bridge: authenticated endpoints under `/safekeeps` that use her tokens and friends list to drive the loop. Periodic check-ins move into the loop (`Config.check_every_seconds`). Her "ask a friend to check in" becomes `Trigger("manual")` on the friend's session. ConfirmOk and Duress both record a normal check-in in her SQLite data, so duress leaves no trace there.

- 2.1 (teammate) Night setup screen: PIN, rank friends into tiers, pick duress contacts, check-in interval. It calls `POST /safekeeps/night`.
- 2.2 (teammate) Groups: her friend codes cover this. Nothing new.
- 2.3 (teammate) Check-in screen from `view.state` and `view.screen`: the gestures from decision 1, countdown, "Thanks!", PIN cancel with filled vs outlined check.
- 2.4 (teammate) Responder screen from the `alerts` list: response card, "I'm on it", resolve.
- 2.5 (teammate) Triggers: periodic now runs on the server. "Ask a friend" is the manual trigger. Home-by time comes later. Separation comes from the demo panel only.

Phase 3: demo panel (`/panel` served by FastAPI)
- 3.1 Done. A one-file web page at `/panel`. It polls `GET /demo/state` every second and shows every night: front state, screen, countdown, connected badge, next periodic check, location, and every alert (hidden ones too, marked). Each night has buttons for Trigger (manual, periodic, separation, home_by), Disconnect or Reconnect, and a sample location. The top bar has skip buttons (+15 s, +30 s, +60 s, +15 min) and a reset with an in-page confirm. A privacy table per night shows what `view_for` gives each person. A scenario guide lists the 7 KAZE scenarios as steps. Endpoints: `GET /panel`, `GET /demo/state`, `POST /demo/event` (Trigger, Disconnect, Reconnect, LocationUpdate for any session, Safekeeps ones too), `POST /demo/skip`, `POST /demo/reset`. If `KAZE_DEMO_KEY` is set, the four data routes need it as the header `X-Demo-Key` (not in the URL, so it stays out of logs). The page asks for the key. Safekeeps nights count as connected, since phones poll. `POST /safekeeps/night` takes `share_location_with`. Reset leaves the Safekeeps SQLite profiles alone. "Contact ignores" needs no button: nobody taps "I'm on it" and time skips ahead. "Separate friend" is Trigger "separation".

Phase 4: find them
- 4.1 During an active alert, the acknowledging friend sees a GPS arrow (expo-location position + heading) and distance.
- 4.2 "Ping" button: the person's phone plays a loud sound and flashes.

Phase 5: BLE band (only after phases 1 to 4 work)

The app is the product and works on any phone without a band. The band is an extra way to answer the same check-in. The owner's phone, running the teammate's app, sits between the band and the server. The spec is `Hardware/kaze_band/HARDWARE.md`.

- 5.1 Development build of the teammate's app with `react-native-ble-plx`. Expo Go has no Bluetooth. The builds run on the user's Mac (Xcode 27.1 is installed. CocoaPods and an Apple signing setup are not yet). Do one test build of the current app on one iPhone early, before any BLE code.
- 5.2 Done: `Hardware/kaze_band/kaze_band.ino`. Service `7f1a0001-...`, `event` notify (0x01 ok, 0x02 duress), `ping` write, `ask` write. Tested in nRF Connect.
- 5.3 The app subscribes to `event` and forwards 0x01 as ConfirmOk and 0x02 as Duress to `/safekeeps/night/events`. When the user's view goes to `asking`, the app writes to `ask`. The band never reports silence, so the server timer handles a missed or dead band.
- 5.4 Find them: the finder's phone scans the band and shows the zones from HARDWARE.md (stronger than -55 dBm right here, -55 to -80 close, weaker than -80 in range), smoothed with the median of the last 3 to 5 s. "Ping" writes to the band. Separation means the band's signal is lost for 30 s or more, not an RSSI cutoff.

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
