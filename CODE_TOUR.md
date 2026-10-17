# KAZE code tour: a study guide for the Q&A

All paths are relative to `~/Desktop/kaze-judge` (branch `judging`, commit `7ded159`). Every line number was checked by reading the file. The test counts come from runs on 2026-10-17.

## 1. How to use this guide

Read sections 2 to 4 first. They give you the whole system and one night through the code. When a judge asks a question, find it in section 7, say the short answer, then open the file at the line number given. If you get stuck, use section 8.

## 2. The system on one page

```
   Wearer's phone (Expo app)                 Friend's phone (same app)
   - draws the server's view                 - sees alerts, "I'm on it", Resolve
   - gestures, PIN, GPS every 30 s           - Find them: GPS arrow, Bluetooth, Ping
   - band relay (Bluetooth)                         |
        ^  |   BLE bytes 1/2/3, writes ask/ping     |
        |  v                                        |
   KAZE band (Arduino Uno R4 WiFi)                  |
                                                    |
        HTTPS, poll every 2.5 s, POST for actions   |
        |                                           |
   cloudflared tunnel (public https address) <------+
        |
   FastAPI server (server/kaze/)
   - app.py: routes, 1 s ticker, save/load
   - bridge.py: tokens and friends -> loop events
   - loop.py: the pure state machine (all the rules)
   - SQLite (safekeeps.sqlite3): profiles, tokens, friends
   - state file (kaze_state.pickle): live nights, saved every 1 s
        |
   Demo panel (server/panel/index.html at /panel), locked by X-Demo-Key
```

**Phone app.** The app in `safekeeps/` is the same for the wearer and the friends. It holds no safety timers and no safety rules. Every 2.5 s it asks the server for "my own view" and "alerts I am allowed to see", then draws exactly that (`safekeeps/src/state/safekeeps.tsx:59-72`). Taps, the PIN, "I'm on it", Resolve and Ping are POST requests. It runs in a browser tab (two tabs act as two phones) or as an iPhone Release build, which adds Bluetooth.

**Band.** An Arduino Uno R4 WiFi with a button, a touch sensor, a buzzer and an LED (`Hardware/kaze_band/kaze_band.ino`). It decides nothing. It turns a gesture into one byte (1 = ok, 2 = duress) and sends it over Bluetooth Low Energy (BLE). It obeys two commands from the phone: ask (blink and buzz) and ping (loud alarm). The wearer's phone relays bytes to the server (`safekeeps/src/services/band-relay.ts`).

**Server with the loop.** A Python FastAPI process. `loop.py` holds every rule as one pure function. `app.py` feeds events into it and delivers what comes out. A background task ticks every night once a second (`server/kaze/app.py:152-156`). So countdowns keep running with no phone at all.

**SQLite.** The teammate's profile data: people, tokens, friendships, private nicknames, friend requests and check-in requests (`server/kaze/safekeeps.py:18-48`). The live nights are not in SQLite.

**State file.** A pickle file holds a copy of the live nights. Pickle is Python's built-in way to turn objects into bytes. The server writes it every second (`server/kaze/app.py:110-126`) and reads it at start (`app.py:129-149`). A restart mid-alert carries on.

**Demo panel.** One HTML page served by the server at `/panel`. It shows every night, hidden alerts included, and can fire triggers, mark a phone offline, set a sample location, skip the clock and reset. When the server is started with `KAZE_DEMO_KEY`, its data routes need the `X-Demo-Key` header (`server/kaze/app.py:383-388`). Without it they are open, and the server logs a warning (`app.py:161-162`).

**Tunnel.** `cloudflared tunnel --url http://localhost:8000` gives the laptop server a public https address. Venue Wi-Fi often blocks phone-to-laptop traffic, and the tunnel works on any network (`README.md:36-40`). It also encrypts the request bodies, so the words `ConfirmOk` and `Duress` are not visible on the network.

## 3. The core idea in code

### One pure step function

`server/kaze/loop.py:1` says: "Pure Python: no I/O, no clock, no UI." Every rule goes through one function, `step`, at `loop.py:451-455`. It picks a handler by the type of the event, from the table at `loop.py:436-448`.

```python
def step(session: Session, event, now: float) -> tuple[Session, list[Effect]]:
    """Apply one event. Changes the session in place."""
    if session.state == "resolved" and type(event) in (Trigger, ConfirmOk, Duress):
        _arm(session, now)  # the user view already shows armed, so these must work now
    return session, _HANDLERS[type(event)](session, event, now)
```

- Time comes in as the number `now`. The loop never reads the clock.
- Nothing is sent from the loop. It returns a list of `Effect(to, kind, data)` (`loop.py:76-80`), and the server delivers them.
- The only place the server calls it is `run` in `server/kaze/app.py:90-92`:

```python
async def run(user_id: str, event) -> None:
    _, effects = loop.step(sessions[user_id], event, now())
    await push(effects)
```

**Why this matters.** Tests can move fake time by sending `Tick` events (`server/tests/helpers.py:44-67`). The 145 tests in `test_loop.py`, `test_scenarios.py` and `test_twin.py` (120 + 12 + 13) run in under a second. The same events always give the same effects, so a test can run two sessions side by side and compare them exactly. The demo clock skip works for free, because the server has one `now()` (`app.py:43-44`) and the loop only sees that number.

**Python note.** `@dataclass` makes a plain record class, like a C++ struct with a constructor. Events are tiny dataclasses (`loop.py:83-122`), for example `Trigger(kind)`, `ConfirmOk`, `Duress`, `Tick`, `Ack(contact_id)`, `Resolve(by, pin)`.

### The front and the hidden alerts

A session has two halves (`loop.py:6-13`):

- **The front** (`loop.py:58-67`) is what the user's phone shows: `state`, `deadline`, `screen`, `wrong_pins` and a few more. Its states are armed, asking, waiting, escalating, acknowledged, resolved, ended (`loop.py:59`).
- **The alerts** (`loop.py:37-52`, list at `loop.py:69`) are what contacts see. An alert can be `hidden`: a duress alert, or an alert the user "ended" with a wrong PIN.

The rule: front code reads only front fields and whether a PIN is right. It never looks at hidden alerts (`loop.py:9`). The user's own view is built only from front fields (`loop.py:460-466`). So a hidden alert cannot change anything on the user's phone. This is how an "ok" and a duress look the same to a person watching.

Duress first runs exactly the code of an "ok", then adds the hidden alert (`loop.py:254-265`):

```python
def _on_duress(s, e, now):
    effects = _front_ok(s, now)  # the front does exactly what ConfirmOk does
    if effects is None:
        return []
    tiers = [[c] for c in s.config.duress_contacts]
    # one open duress alert at a time. One that someone already took does not count.
    if not any(a.state == "duress" and not a.acknowledged_by and a.tiers == tiers for a in _active(s)):
        a = Alert(kind="duress", tiers=tiers, state="duress", hidden=True, location=s.location,
                  location_at=s.location_at, pin=s.config.pin)
        s.alerts.append(a)
        effects += _alert_next_tier(s, a, now)  # tier 1 = duress contact 1 only
    return effects
```

Note: "duress" is not a front state. It is an `Alert.state` (`loop.py:45`). CLAUDE.md lists duress among the states. Be ready to explain the difference: the phone never enters a duress state, on purpose.

`test_twin.py` proves the split holds. It runs 500 random runs of 70 steps (`server/tests/test_twin.py:21-22`). One session gets `Duress` where its twin gets `ConfirmOk` (`test_twin.py:147`). Or it gets a second wrong PIN where its twin gets the right PIN (`test_twin.py:164`). After every step it asserts that the user's view and the user's effects are the same (`test_twin.py:42-53`).

## 4. Follow one night through the code

Each trace is a list of steps with `path:line`. "Poll" means the 2.5 s refresh in `safekeeps/src/state/safekeeps.tsx:59-72`.

### 4.1 Start a night

1. Home, "Start a night": `safekeeps/src/app/index.tsx:102`, then `router.push('/night')` in `safekeeps/src/components/night-entry.tsx:6`.
2. The form checks the inputs: PIN is 4 digits and typed twice, tiers in rank order, at least one duress contact, valid times (`safekeeps/src/app/night.tsx:44-56`).
3. It asks for location permission, at most 3 s on the web (`night.tsx:59-60`).
4. It converts phone time to server time with `serverOffset` (`night.tsx:63-64`) and calls `state.startNight` (`night.tsx:61`).
5. `startNight` is `postNight('/night', config)` (`safekeeps.tsx:159`), then `postNight` (`safekeeps.tsx:129-138`), then `mutate` (`safekeeps.tsx:74-92`), then `api` (`safekeeps/src/services/demo-api.ts:44-73`).
6. Server: `start_night` (`server/kaze/bridge.py:52-67`). It checks the token, then checks that every contact is an accepted friend (`bridge.py:60-61`). It copies names and turns minutes into seconds (`bridge.py:62-66`). All accepted friends become the group (`bridge.py:67`).
7. `begin_night` (`server/kaze/app.py:268-292`) checks the night setup. It refuses with 409 while an alert is running (`app.py:285-286`). Then it calls `loop.new_session` (`app.py:289`).
8. `new_session` (`server/kaze/loop.py:125-131`) arms the front with `_arm` (`loop.py:138-142`), which plans the next periodic check. Still-running hidden alerts from the old night are carried over (`loop.py:129-130`).
9. The phone reloads (`safekeeps.tsx:133-135`) and goes back to Home (`night.tsx:67`).

### 4.2 A check starts

**Manual, from the panel**
1. Panel button: `server/panel/index.html:300-305` posts `/demo/event`.
2. `demo_event` (`server/kaze/panel.py:78-85`) allows only Trigger, Disconnect, Reconnect, LocationUpdate (`panel.py:18`).
3. `apply_event` (`server/kaze/app.py:316-334`) checks the trigger kind (`app.py:329-330`), then `run` (`app.py:90-92`), then `step` (`loop.py:451-455`).
4. `_on_trigger` (`loop.py:228-236`): only from armed. State asking, deadline now + 30 s, one `check` effect.

**Manual, a friend taps "Request check-in"**
1. `safekeeps/src/app/friends/[id].tsx:37-38` calls `requestCheckIn` (`safekeeps.tsx:170`).
2. `request_check_in` (`server/kaze/safekeeps.py:198-211`) records it, then calls `ask_to_check_in` (`safekeeps.py:210`).
3. `ask_to_check_in` (`server/kaze/bridge.py:26-35`) checks that the sender is a contact or group member of that night (`bridge.py:33-34`). Only then does it start `Trigger("manual")` (`bridge.py:35`).
4. Same as above from `_on_trigger` (`loop.py:228-236`).

**Periodic**
1. Ticker: `server/kaze/app.py:152-156`, then `tick_all` (`app.py:95-100`), then `step(Tick)`.
2. `_on_tick` (`loop.py:335-345`) calls `_tick_front` (`loop.py:301-330`).
3. When armed and `now >= next_check`, it calls `_on_trigger(Trigger("periodic"))` (`loop.py:326-327`).

**Home-by**
1. The time is set in Start a night (`night.tsx:53`, `night.tsx:63`) and stored in `Config.home_by` (`loop.py:33`).
2. `_tick_front` fires it once, only from armed (`loop.py:323-325`).

**The phone and the band see it**
1. Next poll: `GET /safekeeps/night` (`bridge.py:70-80`) returns the user's own `view_for` (`loop.py:460-466`).
2. The card buzzes once (`safekeeps/src/components/check-in-card.tsx:85`) and shows "Are you okay?" with a countdown (`check-in-card.tsx:158`, `check-in-card.tsx:209-222`).
3. `applyNight` (`safekeeps.tsx:38-42`) calls `onNight` (`safekeeps.tsx:41`). The band relay builds an ask key (`safekeeps/src/services/band.ts:35-37`) and writes ask once (`band-relay.ts:220-224`).
4. The band: `askChar.written()` gives one 40 ms buzz, then blinks for up to 30 s (`Hardware/kaze_band/kaze_band.ino:213-231`).

### 4.3 The user answers "ok" on the phone

1. Three quick taps. `onPressIn` and `onPressOut` feed times to the decoder (`check-in-card.tsx:130-131`). The third short release returns `'ok'` (`safekeeps/src/services/gesture.ts:45`).
2. `answer('ok')` (`check-in-card.tsx:103-112`): one 50 ms vibration, "Thanks!" at once, then `sendNightEventRetry('ConfirmOk')`.
3. `sendNightEventRetry` (`safekeeps.tsx:142-149`) tries every 700 ms for up to 10 s through `postNight`.
4. Server: `night_event` (`bridge.py:83-98`) checks the token and the type (`bridge.py:88-89`), then `apply_event` (`app.py:316-334`), then `step`.
5. `_on_confirm_ok` (`loop.py:250-251`), then `_front_ok` (`loop.py:239-247`): back to armed, screen `thanks`. No contact gets anything.
6. `record_check_in` (`bridge.py:96-97`, `safekeeps.py:180-184`) writes the last check-in time.
7. After 4 s the card goes back to the armed look (`check-in-card.tsx:23`, `check-in-card.tsx:73-77`).

### 4.4 The user answers "ok" on the band (through the relay)

1. Debounce in `loop()` (`kaze_band.ino:233-247`), then `onRelease` (`kaze_band.ino:125-158`). The third tap calls `sendEvent(EVENT_OK)` (`kaze_band.ino:155-156`).
2. `sendEvent` (`kaze_band.ino:98-109`) queues the byte and gives the short beep (`kaze_band.ino:77-84`).
3. Next pass of `loop()`: `flushPending` (`kaze_band.ino:111-123`) sends 1, then 0, once the phone is connected and subscribed.
4. Phone: the monitor callback (`band-relay.ts:101-102`) calls `decodeEvent` (`band.ts:23-26`), which gives `'ConfirmOk'`.
5. `onEvent` (`band-relay.ts:195-198`), then `sendEvent` (`band-relay.ts:185-193`), then `deliver` (`band-relay.ts:156-160`), which POSTs `/safekeeps/night/events`.
6. If every try fails for 10 s, the answer is saved and retried later, for at most 60 s (`band-relay.ts:191-192`, `band.ts:44-47`).
7. Server: the same as 4.3 steps 4 to 6.

### 4.5 Duress

1. Phone: hold 1 s or more, then 2 taps. `gesture.ts:42` arms duress, `gesture.ts:43` returns `'duress'`. Band: `kaze_band.ino:131-146`.
2. App: the same `answer` path (`check-in-card.tsx:103-112`), with only the string `'Duress'` different. Band: the same `sendEvent` and beep, byte 2.
3. Server: `night_event` (`bridge.py:83-98`), then `apply_event`, then `step`.
4. `_on_duress` (`loop.py:254-265`): `_front_ok` gives the same "thanks" screen (`loop.py:255`). Then it adds a hidden alert with one tier per duress contact (`loop.py:258-263`). `_alert_next_tier` (`loop.py:169-188`) alerts duress contact 1 with a 20 s ack timer.
5. `record_check_in` writes the same record as an ok (`bridge.py:96-97`).
6. The duress friend's poll: `get_night` (`bridge.py:75-79`) includes the alert from `view_for` (`loop.py:467-481`). The banner (`safekeeps/src/components/alert-banner.tsx:7-19`) and the card (`safekeeps/src/components/alerts-section.tsx:46-111`) show it.
7. The second friend (not a duress contact): `view_for` returns `active: False` (`loop.py:468-469`), and `bridge.py:79` filters it out.

### 4.6 Silence escalates to tier 1, then tier 2

1. Ticker (`app.py:152-156`) or panel "+30 s" (`index.html:297-298`, then `demo_skip` at `app.py:394-402`). Both call `tick_all` (`app.py:95-100`).
2. `_tick_front`: asking past its deadline becomes waiting. The screen is `alarm` and the grace deadline is counted from the ask deadline (`loop.py:304-309`).
3. The phone shows "Please answer now!" and buzzes every 1.5 s (`check-in-card.tsx:94-101`, `check-in-card.tsx:139`). The band is asked again because the ask key changed (`band.ts:35-37`, `band-relay.ts:220-224`). This is unit-tested in `band.test.ts` but not yet tried on the band (`DEMO_NOTES.md:85`).
4. Panel "+15 s": waiting past its deadline becomes escalating. A front alert is created and the user sees `alert_active` (`loop.py:310-318`).
5. `_alert_next_tier` (`loop.py:169-188`) alerts tier 1 and sets a 20 s ack deadline (`loop.py:172-175`). The alert effect carries the response card, never the location (`loop.py:186`).
6. Panel "+30 s": `_on_tick` sees the alert's deadline passed (`loop.py:337-338`) and calls `_alert_next_tier` again, which alerts tier 2 (`loop.py:344`).
7. After the last tier, everyone is re-alerted with gaps of 60, 120, then 300 s (`loop.py:165`, `loop.py:176-181`). After 3 rounds nobody took, `final_step` is set (`loop.py:178-179`). It is only a flag.

### 4.7 "I'm on it", and the hold running out

1. The friend taps "I'm on it" (`alerts-section.tsx:101-103`), then `ackAlert` (`safekeeps.tsx:162`).
2. `ack_alert` (`bridge.py:112-114`), then `act_on_alert` (`bridge.py:101-109`), then `send` (`bridge.py:20-23`), then `step(Ack(me))`.
3. `_on_ack` (`loop.py:348-371`): the contact takes the free alert on top of their screen. The hold deadline is now + 120 s (`loop.py:365`). A plain alert becomes acknowledged (`loop.py:366-367`), and the front follows (`loop.py:368-369`). The other contacts get `owner` (`loop.py:370`).
4. The answer is always `{"ok": True}` (`bridge.py:109`).
5. The hold runs out with no Resolve: `_on_tick` (`loop.py:339-343`) sets `stale_ack_by` and clears `acknowledged_by`. The alert goes back to escalating, and the taker gets `ack_stale`. Then the next tier is alerted (`loop.py:344`).
6. The friends see "said they were on it but has not resolved it" from `stale_ack_by` (`loop.py:479`, `alerts-section.tsx:68-72`).

### 4.8 Resolve with the PIN, and a wrong PIN twice

1. `PinEntry.end()` (`check-in-card.tsx:242-249`) checks 4 digits on the phone, then sends `Resolve` with the PIN (`safekeeps.tsx:160`).
2. `night_event` (`bridge.py:91-94`) requires a string PIN and sets `by` to the caller.
3. `_on_resolve` (`loop.py:409-414`) sends it to `_on_user_resolve` (`loop.py:268-289`).
4. Right PIN (`loop.py:274-278`): screen `ended_true`, the front ends, and every alert raised under this PIN ends, hidden ones too. `_resolve` wipes their location (`loop.py:212`).
5. First wrong PIN (`loop.py:281-283`): screen `pin_retry`. Nothing is sent to contacts, with one exception. The typed PIN can be the PIN of an older night whose hidden alert carried over. Then that alert ends (`loop.py:273`, `loop.py:283`).
6. Second wrong PIN (`loop.py:284-289`): screen `ended_fake`. The front alert becomes hidden and keeps escalating. The front looks ended (`_end_front`, `loop.py:216-223`). Every alerted contact gets `wrong_pin_warning`.
7. More guesses after that (`loop.py:279-280`): `ended_fake` again, and nobody is told.
8. The app shows a filled check for `ended_true` and an outlined check for `ended_fake` (`check-in-card.tsx:177-190`, fill at `check-in-card.tsx:183`).

A contact can also end it. `_on_contact_resolve` (`loop.py:392-406`) uses `_may_resolve` (`loop.py:386-389`): only the contact who took a plain alert, or any duress contact for a duress alert.

### 4.9 The phone disconnects

1. Panel "Disconnect phone": `index.html:300-305`, then `panel.py:78-85`, then `apply_event` (`app.py:316-334`). A closed WebSocket does the same (`app.py:378-380`).
2. `_on_disconnect` (`loop.py:417-419`) only sets `connected = False`.
3. The countdown is in the session on the server. The ticker keeps running it (`app.py:152-156`, then `loop.py:301-318`).
4. A real Safekeeps phone that loses signal sends nothing at all, because it polls. The server does not need to notice. It escalates on the same timer.

### 4.10 Server restart

1. While running: `save()` every second from the ticker (`app.py:156`, `app.py:110-126`). It writes a `.tmp` file, then swaps it in with `os.replace` (`app.py:121-123`).
2. Ctrl+C: FastAPI's shutdown runs `task.cancel()` and `save()` (`app.py:166-167`).
3. Start again: `lifespan` (`app.py:160-164`) calls `load()` (`app.py:129-149`). The dicts are refilled in place (`app.py:135`), the clock offset comes back (`app.py:142`), and `connected` is reset (`app.py:148-149`).
4. The ticker starts again (`app.py:164`). The next tier is alerted on time. Test: `server/tests/test_persist.py:15-34`.

### 4.11 A friend opens Find them and pings

1. "Find them" on the alert card (`alerts-section.tsx:78-80`) opens `safekeeps/src/app/find/[id].tsx:62`.
2. `useOwnPosition` (`find/[id].tsx:22-49`) watches the friend's GPS and compass.
3. Distance (`find/[id].tsx:71`, haversine in `safekeeps/src/services/geo.ts:14-19`). Under 30 m, or under GPS accuracy + 20 m, the arrow hides. Bluetooth hotter and colder starts (`find/[id].tsx:73-74`, `safekeeps/src/hooks/use-band-signal.ts:15-48`).
4. Far away: an arrow from bearing minus heading (`find/[id].tsx:130`, `geo.ts:22-32`).
5. Ping: `sendPing` (`find/[id].tsx:89-100`) POSTs `/alerts/<id>/ping`. For duress alerts, and for alerts another friend took, the button is hidden (`find/[id].tsx:144-150`).
6. Server: `ping_alert` (`bridge.py:122-125`), then `_on_ping` (`loop.py:374-383`). It works only for a visible front alert that is escalating or acknowledged, from an alerted contact (`loop.py:378-381`). It sets `ping_at` (`loop.py:382`).
7. The wearer's next poll carries `ping_at` (`loop.py:463`). `PingOverlay` rings only for a newer value (`safekeeps/src/components/night-effects.tsx:77-83`) and plays sound, vibration and flash for 5 s (`night-effects.tsx:91-101`).
8. In parallel the relay writes ping to the band (`band-relay.ts:225-229`), and the band plays `pingAlarm()` (`kaze_band.ino:208-211`, `kaze_band.ino:86-96`).

## 5. The subsystems

### 5.1 The state machine (`server/kaze/loop.py`, 481 lines, and `server/kaze/cards.py`, 43 lines)

**Data**
- `Config` (`loop.py:20-34`): the night's setup. PIN, ranked `tiers` (a list of lists), private `duress_contacts`, `group`, `share_location_with`. Demo timers: ask 30 s, grace 15 s, ack 20 s, ack hold 120 s (`loop.py:28-31`).
- `Alert` (`loop.py:37-52`): who was alerted, the tier, who took it, its own timer and its state. It also has `hidden`, its own location and the PIN of the night that raised it. Then `stale_ack_by`, `rounds` and `final_step` (marked SIMULATED at `loop.py:52`).
- `Session` (`loop.py:55-73`): the front fields, then the alerts, `connected`, location and `ping_at`.

**Helpers**
- `_arm` (`loop.py:138-142`): armed, and plan the next periodic check.
- `_to_user` (`loop.py:145-147`): set the screen and make one `screen` effect.
- `_told` (`loop.py:150-153`): one effect per alerted contact, no duplicates. `dict.fromkeys` keeps the order.
- `_pick` and `_viewed` (`loop.py:191-203`): which alert a contact sees. Duress first, else the newest. View, Ack and Resolve all use this, so a contact acts only on the alert on their screen.
- `_resolve` (`loop.py:206-213`): end alerts, tell contacts, wipe the location.
- `_end_front` (`loop.py:216-223`): the front looks ended. It does not touch the alert itself. This is how the fake end works.

**Front transitions**

| From | Event | To | Code |
|---|---|---|---|
| armed | `Trigger(kind)` | asking, sends `check` | `loop.py:228-236` |
| armed, asking, waiting | `ConfirmOk` | armed, screen `thanks` | `loop.py:239-251` |
| asking | Tick past deadline | waiting, `alarm` | `loop.py:304-309` |
| waiting | Tick past deadline | escalating, tier 1 alerted | `loop.py:310-318` |
| armed, asking, waiting | `Duress` | same as `ConfirmOk`, plus a hidden alert | `loop.py:254-265` |
| any but ended | `Resolve(user, pin)` | see the PIN rules in 4.8 | `loop.py:268-289` |
| escalating | `Ack` on the front alert | acknowledged | `loop.py:368-369` |
| escalating, acknowledged | taker's `Resolve` | resolved, `ended_true` | `loop.py:403-405` |
| resolved | next Tick | armed | `loop.py:328-329` |
| armed, resolved | Tick after `night_ends_at` | ended, `left` to group | `loop.py:319-322` |
| armed, resolved | `Leave` | ended, `left` to group. Refused in any other state | `loop.py:292-298` |
| any | `Disconnect`, `Reconnect` | no change, only the flag | `loop.py:417-424` |

**Escalation** (`loop.py:165-188`):

```python
def _alert_next_tier(s: Session, a: Alert, now: float) -> list[Effect]:
    """Alert the next tier. After the last tier, re-alert every contact, with longer gaps each round."""
    n = a.tier_index + 1
    if n < len(a.tiers):
        a.tier_index = n
        pairs = [(c, n + 1) for c in a.tiers[n]]
        a.deadline = now + s.config.ack_seconds
    else:
        pairs = [(c, i + 1) for i, g in enumerate(a.tiers) for c in g]
        if a.rounds >= FINAL_STEP_ROUNDS:
            a.final_step = True  # ponytail: a flag only, a real product would call a dispatcher here
        a.deadline = now + REALERT_GAPS[min(a.rounds, len(REALERT_GAPS) - 1)]
        a.rounds += 1
```

**The PIN rules** (`loop.py:279-289`):

```python
    if s.pin_ended and s.front_alert is None:  # no more guesses: a wrong PIN looks like the right one
        return [_to_user(s, "ended_fake")] + _resolve(s, mine)
    s.wrong_pins += 1
    if s.wrong_pins == 1:
        return [_to_user(s, "pin_retry")] + _resolve(s, mine)
    effects = [_to_user(s, "ended_fake")]
    if s.front_alert:
        s.front_alert.hidden = True  # it keeps escalating, but the front acts as if it ended
    _end_front(s)
    s.pin_ended = True
    return effects + _resolve(s, mine) + _told(s, _active(s), "wrong_pin_warning")
```

`mine` (`loop.py:273`) is the active alerts raised under the typed PIN. A wrong PIN matches only alerts carried from an older night that used that PIN.

**Privacy: `view_for`** (`loop.py:458-481`) is the only place that decides who sees what.
- The user gets `state`, `screen`, `deadline`, `ping_at`, and `home_by` until it fires (`loop.py:460-466`). `resolved` is shown as `armed`.
- Anyone not alerted gets `{"user_id", "active": False}` (`loop.py:467-469`).
- An alerted contact gets kind, card, who took it, `stale_ack_by`, `final_step`. The location is included only under the rule at `loop.py:470`:

```python
    sees_location = (c.share_location_with == "alerted" or viewer_id == a.acknowledged_by) and a.location is not None
```

**Other rules worth knowing**
- Ping only on a visible front alert (`loop.py:374-383`). A ringing phone during duress tells the captor that help is coming.
- An "ok" while armed does not push the next periodic check later (`loop.py:243`). Otherwise a captor can tap ok again and again to delay checks.
- A new night carries hidden alerts (`loop.py:129-130`). A captor cannot cancel a duress alert by starting a new night.
- Shared contact (in tiers and duress list): one "I'm on it" takes both alerts (`loop.py:355-358`), so the front changes the same way as for an honest user.
- `cards.py`: one response card per alert kind (`cards.py:11-38`). The duress card says "Do not call their phone" (`cards.py:32-37`). `card_for` returns fresh copies (`cards.py:41-43`). No diagnosis words, checked by `server/tests/test_loop.py:1110-1123`.

### 5.2 The server shell (`server/kaze/app.py` 424 lines, `bridge.py` 125, `safekeeps.py` 247, `panel.py` 85)

**`app.py`**
- The store is five module variables: `users`, `groups`, `sessions`, `sockets`, `offset` (`app.py:36-40`). Plain dicts, because the state is small and this is a demo.
- `now()` = `time.time() + offset` (`app.py:43-44`). Every timer uses it, so the clock skip moves everything at once.
- `run` (`app.py:90-92`) is the only place state changes. `tick_all` (`app.py:95-100`) ticks every night, and one broken night cannot stop the others (try/except at `app.py:97-100`).
- `push` and `deliver` (`app.py:66-87`) send effects in a background task. A stuck contact socket must not slow the user's own answer. Otherwise a duress (which sends to a contact) answers slower than an ok (which sends to nobody). Test: `server/tests/test_app.py:181`.
- `begin_night` (`app.py:268-292`) and `apply_event` (`app.py:316-334`) hold the checks that the phone, the panel and the old phase 1 routes all share.
- `save` and `load` (`app.py:110-149`): see trace 4.10. `# ponytail: trusts the file` (`app.py:138`): unpickling an untrusted file can run code. It is safe here only because only this server writes it.
- `demo_key` (`app.py:383-388`): a FastAPI dependency (a function that runs before the route and can stop it).

```python
def demo_key(x_demo_key: str | None = Header(default=None)) -> None:
    """The demo routes need the header X-Demo-Key to match KAZE_DEMO_KEY when that variable is set.
    Header only: a key in the URL would land in access logs, browser history and screen shares."""
    want = os.environ.get("KAZE_DEMO_KEY")
    if want and not secrets.compare_digest((x_demo_key or "").encode(), want.encode()):
        raise HTTPException(401, "a demo key is needed")
```

`compare_digest` is a constant-time compare, so the time a check takes does not leak how many characters matched.

- `demo_skip` (`app.py:394-402`) adds to `offset`, ticks at once and saves. `demo_reset` (`app.py:405-414`) clears memory and the file, not SQLite profiles.
- The WebSocket route (`app.py:363-380`) serves the old phase 1 clients and the tests. It closes Safekeeps ids with code 1008 (`app.py:365-367`).

**`bridge.py`**: the link from the teammate's profiles to the loop.
- A person's SQLite id is also their loop user id (`bridge.py:1-5`).
- A phone can send only `ConfirmOk`, `Duress`, `Resolve`, `LocationUpdate`, `Leave` (`bridge.py:17`).
- `night_event` (`bridge.py:83-98`) forces `by = me` on Resolve (`bridge.py:94`) and writes the same check-in record for ok and duress (`bridge.py:96-97`).
- `act_on_alert` (`bridge.py:101-109`) is used by ack, resolve and ping. It always answers `{"ok": True}`, so a caller cannot probe whether someone has a night or a hidden alert.

```python
async def act_on_alert(owner_id: str, authorization, event) -> dict:
    """The answer is always the same, so it cannot tell a caller whether the owner has a night. The loop decides
    whether the act counts, from the contacts the night started with."""
    with connect() as db:
        me = identity(db, authorization)["id"]
    if owner_id == me:
        raise HTTPException(400, "that is your own night: use /safekeeps/night/events")
    await send(owner_id, event(me))
    return {"ok": True}
```

**`safekeeps.py`**: the teammate's SQLite API.
- `connect()` (`safekeeps.py:18-48`) creates the 5 tables that are missing and wraps work in a transaction.
- `identity()` (`safekeeps.py:51-56`) looks up the Bearer token. An unknown token gets 401. Tokens are random, stored in plain text, with no expiry.
- Profiles, friend codes, friends, nicknames and check-in requests live at `safekeeps.py:113-247`.

**`panel.py` and `server/panel/index.html`**
- `privacy_rows` (`panel.py:34-50`) calls the real `view_for` for each person. The panel's privacy table is computed by the same function that serves the phones.
- The page polls `/demo/state` every 1 s (`index.html:264-276`) and sends the key as a header (`index.html:160-163`). Skip buttons are 15 s, 30 s, 60 s, 15 min (`index.html:146`).

**Python notes.** A plain `def` route runs in a thread pool, an `async def` route runs on the event loop. That is why the code iterates over copies of `sessions` (`app.py:353`, `bridge.py:75`) and why `save()` catches errors. `lifespan` (`app.py:159-167`) is FastAPI's start and stop hook: code before `yield` runs at start, code after it at shutdown.

### 5.3 The app (`safekeeps/`)

**React in 6 lines, for a Python person**
- A component is a function that returns a description of the screen. When its data changes, React calls it again ("re-renders").
- `useState` is a variable that keeps its value between those calls. Calling the setter redraws the screen.
- `useEffect` means "after drawing, run this side job". The function it returns is the cleanup, a bit like `__exit__`.
- `useRef` is a box that survives redraws but does not cause one, like an instance attribute.
- A hook is any function named `use...` that bundles state and effects. A Context is one shared object every screen can read.
- expo-router: the file path is the route. `src/app/find/[id].tsx` is `/find/<id>`, like Flask's `/find/<id>`.

**Key pieces**
- `safekeeps/src/app/_layout.tsx`: imports the band relay at launch (`_layout.tsx:7`), wraps everything in `SafekeepsProvider` (`_layout.tsx:27`), mounts `NightEffects` once on every screen (`_layout.tsx:43`).
- `safekeeps/src/state/safekeeps.tsx` (the most important app file): one big hook, `useSafekeepsState` (`safekeeps.tsx:8-172`), shared through a Context (`safekeeps.tsx:174-183`). It does the polling, `serverOffset`, the lock and most server calls (location updates, Ping and the band relay call `api()` directly).

```tsx
  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (Platform.OS === 'web' || AppState.currentState !== 'background') await refresh(controller.signal);
      if (!controller.signal.aborted) timer = setTimeout(poll, 2500);
    };
    void poll();
    const subscription = AppState.addEventListener('change', status => {
      if (status === 'active') void refresh(controller.signal);
    });
    return () => { controller.abort(); clearTimeout(timer); subscription.remove(); };
  }, [session, refresh]);
```

  It schedules the next poll only after the last one finished, so slow requests never overlap.
- `refresh` (`safekeeps.tsx:44-57`) drops a poll result that started before a user action (`safekeeps.tsx:49`). Without that, an old poll can land after your tap and show the old screen.
- `serverOffset` (`safekeeps.tsx:37-42`) = server clock minus phone clock. Countdowns use it, so a phone with a wrong clock still shows the right time (`check-in-card.tsx:216`).
- `mutate` (`safekeeps.tsx:74-92`): one action at a time (`lock`), and `busy` greys out buttons.
- `sendNightEventRetry` (`safekeeps.tsx:140-149`): a finished gesture is retried every 700 ms for 10 s, so it is never silently dropped.
- `safekeeps/src/services/demo-api.ts:44-73`: every call goes to `url + '/safekeeps' + path` with a Bearer token and an 8 s timeout (`demo-api.ts:51`).
- `safekeeps/src/components/check-in-card.tsx`: the wearer's card. It draws `view.screen` from the server and adds only small local overlays (`check-in-card.tsx:87-92`). Ok and duress share one code path:

```tsx
  function answer(result: GestureResult) {
    if (!result) return;
    Vibration.vibrate(50); // ok and duress feel and look the same
    // "Thanks!" shows while the event is delivered (retried for about 10 s), the same for ok and duress
    setSending(true);
    void state.sendNightEventRetry(result === 'ok' ? 'ConfirmOk' : 'Duress').then(sent => {
      setSending(false);
      if (sent) setThanks(true);
    });
  }
```

- `PinEntry` (`check-in-card.tsx:236-260`): the phone checks only "4 digits". The phone never knows the right PIN. "Cancel an alert" on the armed screen (`check-in-card.tsx:151`) lets a duress user open the PIN entry even though the phone shows nothing.
- `safekeeps/src/services/gesture.ts`: the tap decoder, the same rules as the band. It is a pure state machine: you pass it times, and it never reads the clock (`gesture.ts:2-3`). That is why it has 18 unit tests.

```ts
    pressOut(t: number): GestureResult {
      const late = expire(t);
      if (pressedAt === null) return late;
      const held = t - pressedAt;
      pressedAt = null;
      if (held >= HOLD_MS) { armedUntil = t + DURESS_WINDOW_MS; duressTaps = 0; okTaps = 0; return late; }
      if (armedUntil !== null) return ++duressTaps >= 2 ? finish('duress') : late;
      lastTapAt = t;
      return ++okTaps >= 3 ? finish('ok') : late;
    },
```

  `createGestureDecoder` (`gesture.ts:10-58`) is a closure, a function that keeps private variables, like a small class.
- `safekeeps/src/app/find/[id].tsx`: Find them. Too close for GPS means no arrow (`find/[id].tsx:71-74`):

```tsx
  const metres = own.position && alert?.location ? distanceMetres(own.position, { lat: alert.location[0], lng: alert.location[1] }) : 0;
  // Indoor GPS is off by 20 to 50 m, so a short distance is mostly noise. Do not point the arrow at noise.
  const tooClose = metres < 30 || metres < own.accuracy + 20;
  const band = useBandSignal(own.position !== null && alert?.location != null && tooClose); // the band takes over when GPS cannot
```

- `safekeeps/src/components/night-effects.tsx`: sends GPS while a night runs and the app is open, on a 25 m move or every 30 s (`night-effects.tsx:13-14`, `night-effects.tsx:25-62`). It calls `api()` directly, not `mutate()`, so it never blocks a gesture (`night-effects.tsx:24`). `PingOverlay` rings for 5 s. With Reduce Motion on, it does not flash (`night-effects.tsx:85-101`).
- `safekeeps/src/components/alerts-section.tsx:46-111`: the responder side. The card text comes from the server. "I'm on it" shows only while nobody took it, "Resolve" only for the taker or a duress contact (`alerts-section.tsx:58`, `alerts-section.tsx:101-104`). The server checks this again.
- `safekeeps/src/app/night.tsx`: Start a night (trace 4.1).
- The teammate's original screens: friends list, friend requests, friend codes, the friend page, Settings. `friends/[id].tsx:46` ("Bluetooth not connected") and `settings.tsx:68-71` ("Emergency contacts") are static placeholders from the original design.

### 5.4 The band (`Hardware/kaze_band/kaze_band.ino`, `safekeeps/src/services/band.ts`, `band-relay.ts`)

**Arduino in 4 lines, for a Python person**
- `setup()` runs once at power-on. `loop()` then runs forever, like `while True:`.
- `millis()` is milliseconds since boot, like `time.monotonic()*1000`. `delay(ms)` is a blocking `time.sleep`.
- A BLE "service" is a named group of values. A "characteristic" is one value in it that the phone can read, write or subscribe to.
- TypeScript `async/await` works like Python's `asyncio`.

**Firmware**
- Pins: button D2, touch D3, buzzer D4, LED D5 (`kaze_band.ino:23`). Timings are named constants (`kaze_band.ino:25-36`, `kaze_band.ino:67`).
- Characteristics (`kaze_band.ino:38-41`): `eventChar` is notify only, so nobody can read the last answer later. `pingChar` and `askChar` are write.
- `isPressed()` (`kaze_band.ino:69-71`): button OR touch sensor, so the sensor can sit under fabric.
- `confirmBeep()` (`kaze_band.ino:77-84`): the only feedback, the same for ok and duress.
- `sendEvent()` (`kaze_band.ino:98-109`): always queues, never sends directly. Behaviour is the same with or without a phone.
- `flushPending()` (`kaze_band.ino:111-123`): sends only with three conditions: connected, at least 1 s after connect, and subscribed. Drops answers older than 60 s.

```cpp
void flushPending(bool connected) {
  if (pendingEvent != 0 && millis() - pendingAt > PENDING_MS) {
    pendingEvent = 0;  // too old: the server timer handles this check
    Serial.println("stored answer expired");
  }
  if (pendingEvent == 0 || !connected || millis() - connectedAt < SUBSCRIBE_MS) return;
  // writeValue reports success even with no subscriber, so wait until the phone subscribed.
  if (!eventChar.subscribed()) return;
  eventChar.writeValue(pendingEvent);
  eventChar.writeValue(0);  // clear it so the answer never lingers on the band
  pendingEvent = 0;
  Serial.println("event sent to phone");
}
```

- `onRelease()` (`kaze_band.ino:125-158`): hold 1 s arms duress (`kaze_band.ino:131-138`), then 2 taps send duress (`kaze_band.ino:141-146`), else 3 taps send ok (`kaze_band.ino:149-157`).
- `loop()` (`kaze_band.ino:187-261`):
  - advertise again after a phone connects, so a friend can still scan the signal (`kaze_band.ino:190-199`)
  - heartbeat byte 3 every 20 s while connected (`kaze_band.ino:203-206`)
  - ping (`kaze_band.ino:208-211`)
  - ask, which stops after 30 s and sends nothing (`kaze_band.ino:213-231`)
  - 60 ms debounce (`kaze_band.ino:233-247`)
  - a hold with no taps becomes ok (`kaze_band.ino:249-254`)
  - unfinished ok taps are forgotten after 1.5 s (`kaze_band.ino:256-260`)

**App helpers with no I/O: `band.ts`**
- `decodeEvent` (`band.ts:14-26`) turns the base64 value from the BLE library into `'ConfirmOk'`, `'Duress'` or `'heartbeat'`. These are the server's own event names, so a band answer and a screen answer become the same server event.
- `askKey` (`band.ts:35-37`) is `"state:deadline"` while asking or waiting. The relay writes ask once per key, so the band does not buzz on every poll.
- `keepPending` (`band.ts:44-47`): 60 s for ok and duress alike.
- `median`, `zone`, `trend` (`band.ts:85-100`): hotter and colder from signal strength. Median over 4 s, so one reflected reading cannot move it. A 3 dB dead band, so the screen does not flicker.

**The relay: `band-relay.ts`**
- It lives at module level, not in a screen. iOS can relaunch the app in the background with no screen (`band-relay.ts:1-4`).
- `relaySession()` (`band-relay.ts:19-35`) keeps a copy of the login readable after the first unlock, so it works with the phone locked in a pocket.
- `createManager()` (`band-relay.ts:55-73`) uses `restoreStateIdentifier: 'kaze-band'`. With it, iOS relaunches the app for data from the band. It needs the `central` background mode (`safekeeps/app.json:51-54`).
- `keepConnected()` (`band-relay.ts:89-116`): connect, subscribe, wait for disconnect, sleep 1 s, repeat. The `epoch` counter works like a cancel token.
- `sendEvent()` (`band-relay.ts:185-193`): retry every 700 ms for 10 s, then keep it and retry later.
- `onHeartbeat()` (`band-relay.ts:202-208`): each heartbeat wakes the app. If it is in the background, it fetches the night and calls `onNight`.
- `onNight()` (`band-relay.ts:216-230`): writes ask and ping to the band.

```ts
export function onNight(night: Night | null) {
  void flushPending();
  const view = night?.view;
  if (!night || !view || !connected) return;
  const key = askKey(view);
  if (key !== null && key !== askedKey) {
    askedKey = key;
    write(ASK_UUID).catch(() => { if (askedKey === key) askedKey = null; }); // try again on the next view
  }
  if (shouldPingBand(view.ping_at, pingedAt, night.now)) {
    const at = view.ping_at as number;
    pingedAt = at;
    write(PING_UUID).catch(() => { if (pingedAt === at) pingedAt = null; });
  }
}
```

## 6. How we know it works

### Server: 246 tests, all pass (2.5 s)

Run:

```
cd ~/Desktop/kaze-judge/server && SAFEKEEPS_DB=/tmp/kz-tour.sqlite3 ~/Desktop/kaze/server/.venv/bin/pytest -q
```

Result on 2026-10-17: `246 passed, 1 warning in 2.50s`.

| File | Tests | What it proves |
|---|---|---|
| `server/tests/test_scenarios.py` | 12 | The 7 KAZE scenarios, one group each (`test_1_safe` at line 19 to `test_7_privacy` at line 302). Written from PLAN.md only, never from loop.py (`server/tests/helpers.py:1`). |
| `server/tests/test_loop.py` | 120 | Edge rules: ignored events, re-alerts and final step, Leave, night end, hidden alerts, periodic and home-by, ping, cards, stale acks. |
| `server/tests/test_twin.py` | 13 | A watcher cannot tell duress or a fake end from an honest user. 500 random runs of 70 steps, plus explicit cases. |
| `server/tests/test_app.py` | 45 | HTTP routes, scenario 4 over a real WebSocket (`test_app.py:24`), a stuck socket does not slow a duress answer (`test_app.py:181`). |
| `server/tests/test_bridge.py` | 36 | Tokens and friend checks. Allowed event types (`test_bridge.py:143`). Same answer for anyone (`test_bridge.py:314`). Friends' data identical after ok and duress (`test_bridge.py:98`). Escalation with no polling (`test_bridge.py:173`, `:185`). |
| `server/tests/test_panel.py` | 9 | Key in header only (`test_panel.py:32`), privacy table matches `view_for` (`test_panel.py:89`). |
| `server/tests/test_safekeeps.py` | 8 | The teammate's profile and friend API. |
| `server/tests/test_persist.py` | 3 | Restart mid-alert keeps escalating (`test_persist.py:15-34`), corrupt file starts empty, reset deletes the file. |

The 7 scenarios map like this:

| Scenario | Test |
|---|---|
| 1 Safe | `test_1_safe`, `test_scenarios.py:19` |
| 2 No response | `test_2_no_response`, `test_scenarios.py:40` |
| 3 Duress | `test_3_duress`, `test_scenarios.py:78` |
| 4 Connectivity | `test_4_connectivity_failure`, `test_scenarios.py:121`. It checks the disconnected session escalates at the same second as a connected one (`test_scenarios.py:139`). |
| 5 Unacknowledged | `test_scenarios.py:149` and `:185` |
| 6 False alarm | `test_scenarios.py:212`, `:233`, `:252` |
| 7 Privacy | `test_7_privacy`, `test_scenarios.py:302`. No location inside the alert message (`:324-327`), gone after resolve (`:330-336`). |

How the tests stay fast:
- fake time in the loop tests (`helpers.py:44-67`)
- FastAPI's `TestClient`, which runs in-process with no network port
- `/demo/skip` instead of waiting
- a temporary state file for every test (`server/tests/conftest.py:4-9`)

### App: 57 node tests, all pass (90 ms)

Run:

```
cd ~/Desktop/kaze-judge/safekeeps && node --test src/services/*.test.ts
```

Result on 2026-10-17: `tests 57, pass 57, fail 0`.

| File | Tests | What it covers |
|---|---|---|
| `gesture.test.ts` | 18 | Each gesture rule and the edges: 1000 ms is a hold, 999 ms is a tap. |
| `band.test.ts` | 17 | Byte decoding, base64 for all 256 bytes, ask key, 60 s pending rule the same for ok and duress, ping rule, median, zones, trend. |
| `geo.test.ts` | 12 | Distance, bearing, arrow rotation, the short way round. |
| `home-by.test.ts` | 8 | Clock parsing, next time, rounding. |
| `age.test.ts` | 2 | "just now" and "N min ago". |

Not covered by automated tests: the screens and components, the polling, the retry, the ping overlay, the HTML panel's JavaScript, the band relay's Bluetooth code, and the firmware.

### Hardware: tested by hand

On an iPhone 15 Pro (Release build) and the Uno R4 WiFi band, 2026-10-17 (`DEMO_NOTES.md:9-16`, `DEMO_NOTES.md:96-104`):

| Test | Result |
|---|---|
| Pairing, "Band connected" on Home | Pass |
| Band ok and duress reach the server and look the same on the phone | Pass |
| A check makes the band ask. A Ping makes the phone ring and the band flash | Pass |
| Heartbeat: phone screen off, band asked about 12 s after a check started | Pass (a few tries, not 10 timed trials) |
| State restoration: app stopped from the Mac, iOS relaunched it in about 12 s, band answer reached the server with the screen off | Pass |
| Advertising while connected: a second phone still saw KAZE-Band | Pass |
| Hotter and colder at 0.5, 2 and 5 m | Not measured yet |
| Battery drain per hour | Not measured yet |

Honest note: these hardware tests ran on the earlier firmware and app from branch `home-by` (`DEMO_NOTES.md:9`). The latest firmware changes compile but were not tested on the board (`DEMO_SCRIPT.md:174-176`, `Hardware/kaze_band/HARDWARE.md:119`). They are: buzzer on, answers kept 60 s until a phone subscribes, and 0 after each answer. The app's band relay also changed after those tests and is untested on the phone with the band. Failed band answers are kept on the phone and retried for up to 60 s (`band-relay.ts:162-193`). The band is asked again at the louder stage (`band.ts:35-37`, `DEMO_NOTES.md:85-86`). A real server process restart was not tried before the demo (`DEMO_NOTES.md:20`).

### Test counts to quote

The `judging` branch has 246 server tests and 57 app node tests. `main` has 224 and 53, because the judging fixes are not merged yet. Quote the branch you demo.

## 7. Likely questions and answers

**Note on process questions.** A judge can ask "Did you write this code?" or "How did you build this?". Answer honestly about how the team built it. That includes AI-assisted coding, to the extent the team used it. It also includes who built which part (the teammate built the app's original screens). This guide does not script that answer.

### Potential impact

#### Q: How does this close the gap when someone cannot ask for help?
Silence is the alarm. Every trigger (a timer, home-by, a friend's request, a separation) starts a check (`loop.py:228-236`). If nobody answers in 45 s, contacts are alerted with no action from the person (`loop.py:304-318`). The server runs the timer, so a dead or lost phone still escalates.

#### Q: Does KAZE detect drugging or unconsciousness?
No, on purpose. Every trigger is a timer, a request, or a simulated separation (`loop.py:86`). Only silence or the duress gesture escalates. The response cards give steps and make no diagnosis, and a test fails on words like "drugged" or "unconscious" (`server/tests/test_loop.py:1110-1123`).

#### Q: What does a contact actually see?
First a banner. Then a card with what to do and what not to do, and who is on it. It also shows the location with its age (`alerts-section.tsx:46-111`). The card text comes from `cards.py:11-38`. The duress card says "Do not call their phone" (`cards.py:32-37`).

### Safety and reliability

#### Q: Why does the server own every timer, not the phone?
The person is often unable to touch the phone. The phone can die, lose signal or be killed by iOS. A timer on the phone stops at exactly the wrong moment. The ticker ticks every night each second (`app.py:152-156`). Tests: `test_4_connectivity_failure` (`test_scenarios.py:121`) and escalation with no polling (`test_bridge.py:173`).

#### Q: What if the first contact never answers?
Each tier has 20 s in the demo (`loop.py:30`, `loop.py:172-175`), then the next tier is alerted (`loop.py:337-344`). After the last tier, everyone is re-alerted with 60, 120, then 300 s gaps (`loop.py:165`). After 3 rounds nobody took, a `final_step` flag is set (`loop.py:178-179`). Tests: `test_scenarios.py:149`, `test_loop.py:241-271`.

#### Q: What if someone taps "I'm on it" and then does nothing?
"I'm on it" starts a 120 s hold (`loop.py:365`). If nobody resolves it in time, the alert goes back out and everyone sees who did not follow through (`loop.py:339-343`, `loop.py:479`). Test: `test_5_acknowledger_who_does_not_end_it_hands_the_alert_on` (`test_scenarios.py:185`).

#### Q: What stops a captor from forcing the user to cancel?
The first wrong PIN is a normal retry (`loop.py:281-283`). The second shows "Alert ended", but the alert becomes hidden, keeps escalating, and contacts are warned (`loop.py:284-289`). More guesses change nothing (`loop.py:279-280`). Leave is refused during a check or alert (`loop.py:292-294`), and a new night does not cancel a hidden alert (`loop.py:129-130`). Limit: a captor who forces out the real PIN can still cancel. The PIN is 4 digits, compared as plain text (`loop.py:274`).

#### Q: Can a watcher tell an ok from a duress?
Not from the phone, the band or the server answer. The app uses one code path (`check-in-card.tsx:103-112`). The band uses one `sendEvent` and one beep (`kaze_band.ino:98-109`). The server runs the ok code first (`loop.py:255`) and writes the same record (`bridge.py:96-97`). `test_twin.py` checks this over 500 random runs. Limits: the gesture itself differs (hold then 2 taps), the BLE link is not encrypted, and the HTTPS body length differs (`DEMO_NOTES.md:58`).

#### Q: What happens if the phone loses signal right when the user taps?
The app retries every 700 ms for 10 s (`safekeeps.tsx:140-149`). The band path then stores the answer on the phone (SecureStore). It retries it until 60 s after the band sent it (`band-relay.ts:185-193`, `band.ts:44-47`). This part is unit-tested only, not on the phone with the band. If it still fails, the server timer escalates. So a failure leads to help, not to silence.

#### Q: What if the server crashes mid-alert?
State is saved every second, atomically (`app.py:110-126`), and loaded at start (`app.py:129-149`). The test clears memory and starts a new client (`test_persist.py:15-34`). Limits: up to 1 s of changes can be lost, it is one process, and a real Ctrl+C restart was not rehearsed before the demo.

#### Q: Why does the band not report "no answer"?
Silence is the absence of a message, and only the server can count it reliably. The band just stops blinking after 30 s (`kaze_band.ino:222-226`). A dead band gives the same result as no answer: escalation. A timeout can also never become a duress byte (`HARDWARE.md:59-61`).

#### Q: How do you stop a phone from sending events it should not?
A phone can send only 5 event types (`bridge.py:17`). Resolve is always stamped with the caller (`bridge.py:94`). Acting on your own alert is a 400 (`bridge.py:106-107`). Every contact must be an accepted friend (`bridge.py:60-61`). Test: `test_bridge.py:143`.

### Usability and accessibility

#### Q: Can an impaired person really do three taps?
That is the only thing they need to do, and doing nothing is safe: silence escalates. A hold with no taps also counts as ok (`gesture.ts:25-29`, `kaze_band.ino:249-254`), so a clumsy press never sends duress. The band means they do not need to find or unlock the phone. Real usability with impaired users is not tested yet (`VALIDATION.md`).

#### Q: What happens when the phone is locked in a pocket?
The band sends a heartbeat every 20 s (`kaze_band.ino:203-206`). iOS wakes the app for it, the relay asks the server and tells the band to ask (`band-relay.ts:202-208`). Measured about 12 s on an iPhone 15 Pro (`DEMO_NOTES.md:14`). Limit: a swiped-away app is not relaunched by iOS (`DEMO_NOTES.md:52`).

#### Q: Why does the arrow disappear when you get close?
Indoor GPS is off by 20 to 50 m, so a short distance is mostly noise (`find/[id].tsx:72-73`). Below that, the screen says "Use Ping" and switches to Bluetooth signal strength. Hotter and colder is unit tested (`band.test.ts`) but not yet measured on hardware.

#### Q: Is the alarm safe for everyone?
Ping flashes every 400 ms, under 3 flashes a second, and does not flash with Reduce Motion on (`night-effects.tsx:85-98`). It plays sound even on silent mode (`night-effects.tsx:93`).

### Feasibility

#### Q: Why does the app poll instead of using WebSockets?
Polling recovers by itself after a dropped network, a new tunnel address or a server restart. iOS suspends sockets in the background anyway. The server owns every timer, so up to 2.5 s of delay is small against a 30 s ask. The WebSocket route exists for the old clients and tests (`app.py:363-380`). A real product uses push notifications, which need a paid Apple account.

#### Q: Why a Release build and not Expo Go?
Expo Go cannot load the native Bluetooth module (`README.md:43`). Release puts the JavaScript inside the app, so it does not need the venue Wi-Fi to reach the laptop. A new server address goes in Settings with no rebuild.

#### Q: What is simulated?
The passage of time (`app.py:394-402`) and phone disconnects (`loop.py:417-419`). Contacts who do not respond, and group separation. The final step (`loop.py:179`), and every alert. No SMS, calls or 911. The full list is `DEMO_NOTES.md:34-42`.

#### Q: What would change in production?
- Push notifications or SMS instead of polling, so contacts need not have the app open.
- Real timers: about 2 min, 1 min, 3 min, 10 min (`DEMO_SCRIPT.md:26-31`).
- A real database and several server instances instead of dicts and a pickle file.
- Hashed, expiring tokens and a hashed, rate-limited PIN.
- BLE bonding with encryption, and a per-user band id.
- A real dispatcher at the final step.
- No `/demo` routes.

#### Q: Why does the band need the phone?
The band only speaks BLE. On the Uno R4 WiFi, BLE and Wi-Fi share one radio chip, so a direct band-to-server path was not built (`DEMO_NOTES.md:54`). If no path exists, the server timer still escalates.

### Privacy and autonomy

#### Q: Who sees the location, and when?
All night, the phone sends it about every 30 s or after a 25 m move. It does this only while the app is open (`night-effects.tsx:13-14`, `night-effects.tsx:28-35`). A locked phone sends nothing, so the location can be old. The card shows its age. But `view_for` gives it only to contacts in an active alert (`loop.py:470`). The user can also limit it to the taker only. It is never inside the alert message (`test_scenarios.py:324-327`). When the alert ends, it is wiped (`loop.py:212`). The demo panel sees everything, on purpose, and is locked by a key (`DEMO_NOTES.md:61`).

#### Q: Does the group learn about a duress alert?
No. Duress goes only to the private duress list, one at a time (`loop.py:258`). Group members get `active: False` (`loop.py:468-469`), and the twin test checks they only ever get `left` (`test_twin.py:48-51`).

#### Q: Can a friend probe whether I have a night or a hidden alert?
No. Ack, resolve and ping always answer `{"ok": True}` (`bridge.py:101-109`). The loop decides whether it counts. Tests: `test_bridge.py:314` (ack and resolve) and `test_bridge.py:578` (ping).

#### Q: Can a friend ping a duress alert and expose it?
No. The app hides the button (`find/[id].tsx:144-145`), and the server refuses it anyway: `_on_ping` ignores hidden alerts (`loop.py:378`).

#### Q: Can the user leave a group?
Yes, from the armed screen, with one extra tap and no notice to anyone but a `left` effect (`loop.py:292-298`, `check-in-card.tsx:191-203`). Not during a check or alert, so a captor cannot use Leave to cancel.

#### Q: What if I remove a friend during a night?
Contacts are fixed for that night (`PLAN.md` decision 9, `DEMO_NOTES.md:59`). Otherwise a captor can remove contacts to cancel a hidden alert. The cost: the removed friend keeps that night's access.

### Code and design

#### Q: Why is the state machine one pure function?
All rules live in `step` (`loop.py:451-455`). Time comes in and effects go out. So it is testable with fake time, repeatable, and the web server stays thin (`app.py:90-92`). A swap from FastAPI to a queue does not touch the rules.

#### Q: How does the twin test work?
Two sessions get the same events, with one exception. One gets `Duress` where the other gets `ConfirmOk` (`test_twin.py:147`). Or one gets a second wrong PIN against the right PIN (`test_twin.py:164`). After every step it asserts the user views and user effects are equal (`test_twin.py:42-53`). It runs 500 fixed seeds of 70 steps and asserts it really reached the hard cases (`test_twin.py:212-219`).

#### Q: Walk me through one request from the phone to the state machine.
Use trace 4.5. The phone side is `check-in-card.tsx:108`, `safekeeps.tsx:145`, `demo-api.ts:53`. The server side is `bridge.py:83`, token at `safekeeps.py:51`, `apply_event` at `app.py:316`. Then `run` at `app.py:90`, `step` at `loop.py:451`, `_on_duress` at `loop.py:254`. Every entry point (phone, panel, ticker) ends in the same `run()`.

#### Q: How does the clock skip work without breaking the logic?
There is one `offset` and one `now()` (`app.py:40-44`). `/demo/skip` adds to it and ticks every night at once (`app.py:394-402`). The loop never reads the clock, so nothing else changes. The phone follows through `serverOffset` (`safekeeps.tsx:40`).

#### Q: Why are there two storages, SQLite and a pickle file?
SQLite holds the teammate's long-lived profiles and friends (`safekeeps.py:18-48`). The live nights are Python objects in memory, and the pickle file is only a crash copy of them (`app.py:118`). Reset clears nights but keeps profiles (`app.py:405-414`).

#### Q: How is the demo panel protected?
With `KAZE_DEMO_KEY` set, the data routes need the `X-Demo-Key` header, compared in constant time (`app.py:383-388`). The key never goes in the URL (`test_panel.py:32`). Limit: one shared secret, no rate limit. Without the key the routes are open, the server logs a warning (`app.py:161-162`) and the panel shows a red banner.

#### Q: Why the `safekeeps/safekeeps/` folder?
A leftover copy of the Expo starter template from the teammate's first app commit (7043337 "setup"). Nothing uses it (`PLAN.md:139`). `tsconfig.json` maps `@/*` to `./src/*`.

## 8. If you get stuck

1. Open `server/kaze/loop.py` at `step` (line 451) and follow the handler for that event in `_HANDLERS` (line 436).
2. Run the server tests: `cd ~/Desktop/kaze-judge/server && SAFEKEEPS_DB=/tmp/kz-tour.sqlite3 ~/Desktop/kaze/server/.venv/bin/pytest -q` and say "246 pass in under 3 seconds".
3. Run one scenario by name: add `-k test_3_duress` (or any scenario name from section 6) to the same command.
4. Show the panel at `/panel`: the hidden alert row and the privacy table come from the same `view_for` the phones use (`panel.py:34-50`).
5. Say "I do not know that detail, but here is where it lives". Then open the file from section 5 and read the comment above the function.
