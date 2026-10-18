# Homebound code tour: a study guide for the Q&A

All paths are relative to the repository root, `~/Desktop/kaze` on branch `main`. Every line number was checked against the files on `main`. The test counts come from runs on 2026-10-17.

The app's visible name is Homebound. The code, the folders and some strings still say safekeeps and KAZE. This guide uses those names where the code does.

## 1. How to use this guide

Read sections 2 to 4 first. They give you the whole system and one night through the code. When a judge asks a question, find it in section 7, say the short answer, then open the file at the line number given. If you get stuck, use section 8.

## 2. The system on one page

```
   Wearer's phone (Expo app)                 Friend's phone (same app)
   - draws the server's view                 - sees alerts, "I'm on it", Resolve
   - gestures, PIN, GPS every 30 s           - Find them: GPS arrow, Bluetooth, Ping
   - own reminders (local notifications)     - ntfy app: alert when Homebound is closed
   - band relay (Bluetooth)                         |        ^
        ^  |   BLE bytes 1/2/3, writes ask/ping     |        | push (optional)
        |  v                                        |        |
   KAZE band (Arduino Uno R4 WiFi)                  |      ntfy server
                                                    |        ^
        HTTPS, poll every 2.5 s, POST for actions   |        |
        |                                           |        |
   cloudflared tunnel (public https address) <------+        |
        |                                                    |
   FastAPI server (server/kaze/) -----------------------------+
   - app.py: routes, 1 s ticker, save/load, ntfy push
   - bridge.py: tokens and friends -> loop events
   - loop.py: the pure state machine (all the rules)
   - SQLite (safekeeps.sqlite3): profiles, tokens, friends
   - state file (kaze_state.pickle): live nights, saved every 1 s
        |
   Demo panel (server/panel/index.html at /panel), locked by X-Demo-Key
```

**Phone app.** The app in `safekeeps/` is the same for the wearer and the friends. It holds no safety timers and no safety rules. Every 2.5 s it asks the server for "my own view" and "alerts I am allowed to see", then draws exactly that (`safekeeps/src/state/safekeeps.tsx:60-73`). Taps, the PIN, "I'm on it", Resolve and Ping are POST requests. It runs in a browser tab (two tabs act as two phones) or as an iPhone Release build, which adds Bluetooth and notifications.

**Band.** An Arduino Uno R4 WiFi with a button, a touch sensor, a buzzer and an LED (`Hardware/kaze_band/kaze_band.ino`). It decides nothing. It turns a gesture into one byte (1 = ok, 2 = duress) and sends it over Bluetooth Low Energy (BLE). It obeys two commands from the phone: ask (blink and buzz) and ping (loud alarm). The wearer's phone relays bytes to the server (`safekeeps/src/services/band-relay.ts`).

**Server with the loop.** A Python FastAPI process. `loop.py` holds every rule as one pure function. `app.py` feeds events into it and delivers what comes out. A background task ticks every night once a second (`server/kaze/app.py:189-193`). So countdowns keep running with no phone at all.

**SQLite.** The teammate's profile data: people, tokens, friendships, private nicknames, friend requests and check-in requests (`server/kaze/safekeeps.py:18-48`). The live nights are not in SQLite.

**State file.** A pickle file holds a copy of the live nights. Pickle is Python's built-in way to turn objects into bytes. The server writes it every second (`server/kaze/app.py:147-163`) and reads it at start (`app.py:166-186`). A restart mid-alert carries on.

**Push to contacts (ntfy).** Optional. ntfy is a free service that sends a message to every phone that follows a named channel, called a topic. It stands in for Apple's own push service, which needs a paid developer account. It is off unless `KAZE_NTFY_URL` and `KAZE_NTFY_SECRET` are set (`server/kaze/app.py:81-91`). Each contact has their own topic, made from an HMAC of their id (`app.py:91`). The text is always the same and has no name and no location (`app.py:98`). The server sends it for `alert` effects only, to contacts only, never to the wearer (`app.py:105-108`). See trace 4.13.

**Local reminders.** Separate from ntfy. The wearer's phone schedules its own notifications for the next check and the home-by time, from the wearer's own view. No server push is involved. See trace 4.12.

**Demo panel.** One HTML page served by the server at `/panel`. It shows every night, hidden alerts included, and can fire triggers, mark a phone offline, set a sample location, skip the clock and reset. When the server is started with `KAZE_DEMO_KEY`, its data routes need the `X-Demo-Key` header (`server/kaze/app.py:425-430`). Without it they are open, and the server logs a warning (`app.py:198-199`).

**Tunnel.** `cloudflared tunnel --url http://localhost:8000` gives the laptop server a public https address. Venue Wi-Fi often blocks phone-to-laptop traffic, and the tunnel works on any network (`README.md`, the tunnel step). It also encrypts the request bodies, so the words `ConfirmOk` and `Duress` are not visible on the network.

## 3. The core idea in code

### One pure step function

`server/kaze/loop.py:1` says: "Pure Python: no I/O, no clock, no UI." Every rule goes through one function, `step`, at `loop.py:475-479`. It picks a handler by the type of the event, from the table at `loop.py:460-472`.

```python
def step(session: Session, event, now: float) -> tuple[Session, list[Effect]]:
    """Apply one event. Changes the session in place."""
    if session.state == "resolved" and type(event) in (Trigger, ConfirmOk, Duress):
        _arm(session, now)  # the user view already shows armed, so these must work now
    return session, _HANDLERS[type(event)](session, event, now)
```

- Time comes in as the number `now`. The loop never reads the clock.
- Nothing is sent from the loop. It returns a list of `Effect(to, kind, data)` (`loop.py:77-81`), and the server delivers them.
- The only place the server calls it is `run` in `server/kaze/app.py:127-129`:

```python
async def run(user_id: str, event) -> None:
    _, effects = loop.step(sessions[user_id], event, now())
    await push(effects)
```

**Why this matters.** Tests can move fake time by sending `Tick` events (`server/tests/helpers.py:44-67`). The 190 tests in `test_loop.py`, `test_scenarios.py` and `test_twin.py` (147 + 13 + 30) run in under a second. The same events always give the same effects, so a test can run two sessions side by side and compare them exactly. The demo clock skip works for free, because the server has one `now()` (`app.py:46-47`) and the loop only sees that number.

**Python note.** `@dataclass` makes a plain record class, like a C++ struct with a constructor. Events are tiny dataclasses (`loop.py:84-123`), for example `Trigger(kind)`, `ConfirmOk`, `Duress`, `Tick`, `Ack(contact_id)`, `Resolve(by, pin)`.

### The front and the hidden alerts

A session has two halves (`loop.py:6-13`):

- **The front** (`loop.py:59-68`) is what the user's phone shows: `state`, `deadline`, `screen`, `wrong_pins` and a few more. Its states are armed, asking, waiting, escalating, acknowledged, resolved, ended (`loop.py:60`).
- **The alerts** (`loop.py:38-53`, list at `loop.py:70`) are what contacts see. An alert can be `hidden`: a duress alert, or the user's own alert after a fake end with a wrong PIN or after the duress PIN.

The rule: front code reads only front fields and whether a PIN is right. It never looks at hidden alerts (`loop.py:9`). The user's own view is built only from front fields (`loop.py:484-491`). So a hidden alert cannot change anything on the user's phone. This is how an "ok" and a duress look the same to a person watching.

Duress first runs exactly the code of an "ok", then adds the hidden alert (`loop.py:255-271`):

```python
def _raise_duress(s: Session, now: float) -> list[Effect]:
    """Start a hidden duress alert. Takes the front location, so call it before the front ends."""
    tiers = [[c] for c in s.config.duress_contacts]
    # one open duress alert at a time. One that someone already took does not count.
    if any(a.state == "duress" and not a.acknowledged_by and a.tiers == tiers for a in _active(s)):
        return []
    a = Alert(kind="duress", tiers=tiers, state="duress", hidden=True, location=s.location,
              location_at=s.location_at, pin=s.config.pin)
    s.alerts.append(a)
    return _alert_next_tier(s, a, now)  # tier 1 = duress contact 1 only


def _on_duress(s, e, now):
    # The front does exactly what ConfirmOk does, which is nothing in an alert or after the end.
    # The duress alert starts in every front state, as for the duress PIN. ConfirmOk changes nothing
    # in the other states either, so a watcher still cannot tell the two apart.
    return (_front_ok(s, now) or []) + _raise_duress(s, now)
```

The duress PIN uses the same idea. It runs the same front code as the right PIN and calls the same `_raise_duress` (`loop.py:302-313`). See trace 4.8.

Note: "duress" is not a front state. It is an `Alert.state` (`loop.py:46`). CLAUDE.md lists duress among the states. Be ready to explain the difference: the phone never enters a duress state, on purpose.

`test_twin.py` proves the split holds. It runs 500 random runs of 70 steps (`server/tests/test_twin.py:22-23`). Each run picks one of three kinds (`test_twin.py:194`):
- One session gets `Duress` where its twin gets `ConfirmOk` (`test_twin.py:165`).
- One session gets a second wrong PIN where its twin gets the right PIN (`test_twin.py:177`).
- One session gets the duress PIN where its twin gets the right PIN (`test_twin.py:152-163`). Later in the run, the honest twin can type the right PIN again. Then the hidden twin types the duress PIN half the time (`test_twin.py:223-225`).

After every step it asserts that the user's view and the user's effects are the same (`test_twin.py:43-54`). The view now includes `next_check`, so a duress that re-armed the timer differently fails the test (`test_twin.py:89-92`).

## 4. Follow one night through the code

Each trace is a list of steps with `path:line`. "Poll" means the 2.5 s refresh in `safekeeps/src/state/safekeeps.tsx:60-73`.

### 4.1 Start a night

1. Home, "Start a night": `safekeeps/src/app/index.tsx:85`, then `router.push('/night')` in `safekeeps/src/components/night-entry.tsx:6`.
2. The form checks the inputs (`safekeeps/src/app/night.tsx:51-66`):
   - The PIN is 4 digits and typed twice.
   - The duress PIN is 4 digits, typed twice, and different from the PIN (`night.tsx:55-57`).
   - The tiers are in rank order, with at least one duress contact, and the times are valid. On iOS the two times come from the system time picker. On the web the user types them as HH:MM (`TimeField`, `safekeeps/src/components/form.tsx:44-73`).
   - Live hints show under the fields while the user types (`night.tsx:45-49`). They are "The PINs do not match" and "Use a different PIN from your normal PIN".
3. It asks for location permission, at most 3 s on the web (`night.tsx:69-70`).
4. It converts phone time to server time with `serverOffset` (`night.tsx:73-74`). Then it calls `state.startNight` with `pin` and `duress_pin` (`night.tsx:71`).
5. `startNight` is `postNight('/night', config)` (`safekeeps.tsx:162`), then `postNight` (`safekeeps.tsx:131-140`), then `mutate` (`safekeeps.tsx:75-94`), then `api` (`safekeeps/src/services/demo-api.ts:49-80`).
6. Server: `start_night` (`server/kaze/bridge.py:53-68`). It checks the token, then checks that every contact is an accepted friend (`bridge.py:61-62`). It copies names and turns minutes into seconds (`bridge.py:63-67`). All accepted friends become the group (`bridge.py:68`).
7. `begin_night` (`server/kaze/app.py:306-334`) checks the night setup. A duress PIN equal to the PIN gets 400, and the answer never shows either PIN (`app.py:315-318`). It refuses with 409 while an alert is running (`app.py:327-328`). Then it calls `loop.new_session` (`app.py:331`).
8. `new_session` (`server/kaze/loop.py:126-132`) arms the front with `_arm` (`loop.py:139-143`), which plans the next periodic check. Still-running hidden alerts from the old night are carried over (`loop.py:130-131`).
9. The phone reloads (`safekeeps.tsx:135-137`) and goes back to Home (`night.tsx:77`). The new view carries `next_check`, which starts the local reminders (trace 4.12).

### 4.2 A check starts

**Manual, from the panel**
1. Panel button: `server/panel/index.html:300-305` posts `/demo/event`.
2. `demo_event` (`server/kaze/panel.py:78-85`) allows only Trigger, Disconnect, Reconnect, LocationUpdate (`panel.py:18`).
3. `apply_event` (`server/kaze/app.py:358-376`) checks the trigger kind (`app.py:371-372`), then `run` (`app.py:127-129`), then `step` (`loop.py:475-479`).
4. `_on_trigger` (`loop.py:229-237`): only from armed. State asking, deadline now + 30 s, one `check` effect.

**Manual, a friend taps "Request check-in"**
1. `safekeeps/src/app/friends/[id].tsx:38` calls `requestCheckIn` (`safekeeps.tsx:173`).
2. `request_check_in` (`server/kaze/safekeeps.py:208-221`) records it, then calls `ask_to_check_in` (`safekeeps.py:220`).
3. `ask_to_check_in` (`server/kaze/bridge.py:26-35`) checks that the sender is a contact or group member of that night (`bridge.py:33-34`). Only then does it start `Trigger("manual")` (`bridge.py:35`).
4. Same as above from `_on_trigger` (`loop.py:229-237`).

**Periodic**
1. Ticker: `server/kaze/app.py:189-193`, then `tick_all` (`app.py:132-137`), then `step(Tick)`.
2. `_on_tick` (`loop.py:359-369`) calls `_tick_front` (`loop.py:325-354`).
3. When armed and `now >= next_check`, it calls `_on_trigger(Trigger("periodic"))` (`loop.py:350-351`).

**Home-by**
1. The time is set in Start a night (`night.tsx:63`, `night.tsx:73`) and stored in `Config.home_by` (`loop.py:34`).
2. `_tick_front` fires it once, only from armed (`loop.py:347-349`).

**The phone and the band see it**
1. Next poll: `GET /safekeeps/night` (`bridge.py:71-80`) returns the user's own `view_for` (`loop.py:484-491`).
2. The card buzzes once (`safekeeps/src/components/check-in-card.tsx:111`) and shows "Are you okay?" with a countdown (`check-in-card.tsx:175`, `check-in-card.tsx:248-261`). A screen reader says the same words once (`check-in-card.tsx:32`, `check-in-card.tsx:119`).
3. `applyNight` (`safekeeps.tsx:38-43`) calls `onNight` (`safekeeps.tsx:42`). The band relay builds an ask key (`safekeeps/src/services/band.ts:35-37`) and writes ask once (`band-relay.ts:224-228`). With the app closed, `onNight` also calls `notifyCheckNow` (`band-relay.ts:222`, trace 4.12).
4. The band: `askChar.written()` gives one 40 ms buzz, then blinks for up to 30 s (`Hardware/kaze_band/kaze_band.ino:213-231`).

### 4.3 The user answers "ok" on the phone

1. One tap. `onPressIn` and `onPressOut` feed times to the decoder (`check-in-card.tsx:159-160`). A short release returns `'ok'` at once (`safekeeps/src/services/gesture.ts:41`). The button hint says "Tap if you are okay" and the spoken text says "Tap the button if you are okay." Under TalkBack, a double-tap sends one click with no touch. `onPress` counts that click as one quick tap (`check-in-card.tsx:161-167`). The band still needs three taps (trace 4.4).
2. `answer('ok')` (`check-in-card.tsx:131-140`): one 50 ms vibration, "Thanks!" at once, then `sendNightEventRetry('ConfirmOk')`.
3. `sendNightEventRetry` (`safekeeps.tsx:144-151`) tries every 700 ms for up to 10 s through `postNight`.
4. Server: `night_event` (`bridge.py:90-105`) checks the token and the type (`bridge.py:95-96`), then `apply_event` (`app.py:358-376`), then `step`.
5. `_on_confirm_ok` (`loop.py:251-252`), then `_front_ok` (`loop.py:240-248`): back to armed, screen `thanks`. No contact gets anything.
6. `record_check_in` (`bridge.py:103-104`, `safekeeps.py:180-185`) writes the last check-in time.
7. After 4 s the card goes back to the armed look (`check-in-card.tsx:26`, `check-in-card.tsx:98-103`).

### 4.4 The user answers "ok" on the band (through the relay)

1. Debounce in `loop()` (`kaze_band.ino:233-247`), then `onRelease` (`kaze_band.ino:125-158`). The third tap calls `sendEvent(EVENT_OK)` (`kaze_band.ino:155-156`).
2. `sendEvent` (`kaze_band.ino:98-109`) queues the byte and gives the short beep (`kaze_band.ino:77-84`).
3. Next pass of `loop()`: `flushPending` (`kaze_band.ino:111-123`) sends 1, then 0, once the phone is connected and subscribed.
4. Phone: the monitor callback (`band-relay.ts:102-103`) calls `decodeEvent` (`band.ts:23-26`), which gives `'ConfirmOk'`.
5. `onEvent` (`band-relay.ts:198-201`), then `sendEvent` (`band-relay.ts:188-196`), then `deliver` (`band-relay.ts:158-163`), which POSTs `/safekeeps/night/events`.
6. If every try fails for 10 s, the answer is saved and retried later, for at most 60 s (`band-relay.ts:194-195`, `band.ts:45-47`).
7. If the server answers 404, no night is running, so there is nothing to answer. `deliver` counts that as done: no retry, nothing kept, and a kept answer is dropped (`band-relay.ts:161-162`, `noNight` at `band.ts:60`). The check does not look at the event type, so ok and duress take the same path. Home then says "Band connected. Start a night to use it." (`safekeeps/src/app/index.tsx:79-84`).
8. Server: the same as 4.3 steps 4 to 6.

### 4.5 Duress

1. Phone: hold 1 s or more, then 2 taps. `gesture.ts:39` arms duress, `gesture.ts:40` returns `'duress'`. Band: `kaze_band.ino:131-146`.
2. App: the same `answer` path (`check-in-card.tsx:131-140`), with only the string `'Duress'` different. A screen reader says "Thanks!" for both (`check-in-card.tsx:34`). Band: the same `sendEvent` and beep, byte 2.
3. Server: `night_event` (`bridge.py:90-105`), then `apply_event`, then `step`.
4. `_on_duress` (`loop.py:267-271`): `_front_ok` gives the same "thanks" screen, or nothing in an alert, exactly as for an ok (`loop.py:271`). Then, in every front state, `_raise_duress` adds a hidden alert with one tier per duress contact (`loop.py:255-264`). `_alert_next_tier` (`loop.py:170-189`) alerts duress contact 1 with a 20 s ack timer.
5. `record_check_in` writes the same record as an ok (`bridge.py:103-104`).
6. The duress friend's poll: `get_night` (`bridge.py:71-80`) includes the alert from `view_for` (`loop.py:492-506`). It adds the person's name to the alert (`bridge.py:78-79`, `display_name` at `bridge.py:83-87`). That is the name the viewer gave the friend, else the name the friend picked. So a contact who removed the friend during the night still sees who it is. The banner (`safekeeps/src/components/alert-banner.tsx:7-20`) and the card (`safekeeps/src/components/alerts-section.tsx:46-124`) show it, with the fallback `alert.name ?? 'A friend'` (`alert-banner.tsx:12`, `alerts-section.tsx:76`).
7. The second friend (not a duress contact): `view_for` returns `active: False` (`loop.py:493-494`), and `bridge.py:77` filters it out.
8. If push is on, the duress contact's phone also gets an ntfy message. Only the duress contacts get one, because only they get the `alert` effect (trace 4.13).

### 4.6 Silence escalates to tier 1, then tier 2

1. Ticker (`app.py:189-193`) or panel "+30 s" (`index.html:297-298`, then `demo_skip` at `app.py:436-444`). Both call `tick_all` (`app.py:132-137`).
2. `_tick_front`: asking past its deadline becomes waiting. The screen is `alarm` and the grace deadline is counted from the ask deadline (`loop.py:328-333`).
3. The phone shows "Please answer now!" and buzzes every 1.5 s (`check-in-card.tsx:122-129`, `check-in-card.tsx:175`). The band is asked again because the ask key changed (`band.ts:35-37`, `band-relay.ts:224-228`). This is unit-tested in `band.test.ts` but not yet tried on the band (`DEMO_NOTES.md:99`).
4. Panel "+15 s": waiting past its deadline becomes escalating. A front alert is created and the user sees `alert_active` (`loop.py:334-342`).
5. `_alert_next_tier` (`loop.py:170-189`) alerts tier 1 and sets a 20 s ack deadline (`loop.py:173-176`). The alert effect carries the response card, never the location (`loop.py:187`).
6. Panel "+30 s": `_on_tick` sees the alert's deadline passed (`loop.py:361-362`) and calls `_alert_next_tier` again, which alerts tier 2 (`loop.py:368`).
7. After the last tier, everyone is re-alerted with gaps of 60, 120, then 300 s (`loop.py:166`, `loop.py:177-182`). After 3 rounds nobody took, `final_step` is set (`loop.py:179-180`). It is only a flag.

### 4.7 "I'm on it", and the hold running out

1. The friend taps "I'm on it" (`alerts-section.tsx:114-116`), then `ackAlert` (`safekeeps.tsx:165`).
2. `ack_alert` (`bridge.py:119-121`), then `act_on_alert` (`bridge.py:108-116`), then `send` (`bridge.py:20-23`), then `step(Ack(me))`.
3. `_on_ack` (`loop.py:372-395`): the contact takes the free alert on top of their screen. The hold deadline is now + 120 s (`loop.py:389`). A plain alert becomes acknowledged (`loop.py:390-391`), and the front follows (`loop.py:392-393`). The other contacts get `owner` (`loop.py:394`).
4. The answer is always `{"ok": True}` (`bridge.py:116`).
5. The hold runs out with no Resolve: `_on_tick` (`loop.py:363-367`) sets `stale_ack_by` and clears `acknowledged_by`. The alert goes back to escalating, and the taker gets `ack_stale`. Then the next tier is alerted (`loop.py:368`).
6. The friends see "said they were on it but has not resolved it" from `stale_ack_by` (`loop.py:504`, `alerts-section.tsx:81-85`).

### 4.8 Resolve with the PIN, and a wrong PIN twice

1. `PinEntry.end()` (`check-in-card.tsx:281-288`) checks 4 digits on the phone, then sends `Resolve` with the PIN (`safekeeps.tsx:163`).
2. `night_event` (`bridge.py:98-101`) requires a string PIN and sets `by` to the caller.
3. `_on_resolve` (`loop.py:433-438`) sends it to `_on_user_resolve` (`loop.py:274-299`). A typed PIN equal to the night's duress PIN goes to the duress PIN path first (`loop.py:275-276`, see step 9).
4. Right PIN (`loop.py:284-288`): screen `ended_true`, the front ends, and every plain alert raised under this PIN ends, hidden ones too. `mine` (`loop.py:283`) leaves out every duress alert. `_resolve` wipes their location (`loop.py:213`).
5. First wrong PIN (`loop.py:291-293`): screen `pin_retry`. Nothing is sent to contacts, with one exception. The typed PIN can be the PIN of an older night whose hidden alert carried over. Then that alert ends (`loop.py:283`, `loop.py:293`).
6. Second wrong PIN (`loop.py:294-299`): screen `ended_fake`. The front alert becomes hidden and keeps escalating. The front looks ended (`_end_front`, `loop.py:217-224`). Every alerted contact gets `wrong_pin_warning`.
7. More guesses after that (`loop.py:289-290`): `ended_fake` again, and nobody is told.
8. The app shows a filled check for `ended_true` and an outlined check for `ended_fake` (`check-in-card.tsx:215-229`, fill at `check-in-card.tsx:222`). Both have the same ring in the card line colour (`check-in-card.tsx:220`), about 2.9:1 on the panel, so only the fill tells them apart. A screen reader says "Alert ended" for both (`check-in-card.tsx:37-38`).
9. Duress PIN (`_on_duress_pin`, `loop.py:302-313`). The user types it in the same PIN box. A typical case: someone forces them to cancel.
   - First `_raise_duress` starts a hidden duress alert, with the front location (`loop.py:305`). It runs first because the end clears that location.
   - Then the front does exactly what the right PIN does: screen `ended_true` (the filled check), `_end_front`, and `pin_ended` (`loop.py:308-312`).
   - Nothing is resolved. A running alert of the user becomes hidden and keeps escalating, like after a fake end (`loop.py:309-310`). Nobody gets `wrong_pin_warning` or `resolved`.
   - In `ended` (after Leave or the night end), the phone gets nothing, the same as for the right PIN. The duress alert still starts (`loop.py:306-307`).
   - `wrong_pins` does not change, so it is never a wrong PIN.
   - The bridge does not call `record_check_in` on Resolve, so friends see the same `lastCheckIn` for both PINs (`bridge.py:103-104`).
10. Decision 13: no PIN ends a duress alert, not even the real one. `mine` skips every alert of kind `duress` (`loop.py:283`, comment at `loop.py:281-282`). The duress alert still carries the night's PIN (`loop.py:262`), but the filter ignores it. A guess sweep from 0000 to 9999 ends nothing (`test_loop.py:1384`). Tests: `test_loop.py:1363` and `test_loop.py:1375`. Only a duress contact ends it (next paragraph). The reason: the end screen shows which PIN is real. A captor who forces out the real PIN, or tries PINs until the filled check shows, still cannot cancel the duress alert.

A contact can also end it. `_on_contact_resolve` (`loop.py:416-430`) uses `_may_resolve` (`loop.py:410-413`): only the contact who took a plain alert, or any duress contact for a duress alert.

### 4.9 The phone disconnects

1. Panel "Disconnect phone": `index.html:300-305`, then `panel.py:78-85`, then `apply_event` (`app.py:358-376`). A closed WebSocket does the same (`app.py:421-422`).
2. `_on_disconnect` (`loop.py:441-443`) only sets `connected = False`.
3. The countdown is in the session on the server. The ticker keeps running it (`app.py:189-193`, then `loop.py:325-342`).
4. A real Safekeeps phone that loses signal sends nothing at all, because it polls. The server does not need to notice. It escalates on the same timer.

### 4.10 Server restart

1. While running: `save()` every second from the ticker (`app.py:193`, `app.py:147-163`). It writes a `.tmp` file, then swaps it in with `os.replace` (`app.py:158-160`).
2. Ctrl+C: FastAPI's shutdown runs `task.cancel()` and `save()` (`app.py:203-204`).
3. Start again: `lifespan` (`app.py:196-204`) calls `load()` (`app.py:166-186`). The dicts are refilled in place (`app.py:172`), the clock offset comes back (`app.py:179`), and `connected` is reset (`app.py:185-186`).
4. The ticker starts again (`app.py:201`). The next tier is alerted on time. Test: `server/tests/test_persist.py:15-34`.

### 4.11 A friend opens Find them and pings

1. "Find them" on the alert card (`alerts-section.tsx:91-93`) opens `safekeeps/src/app/find/[id].tsx:62`.
2. `useOwnPosition` (`find/[id].tsx:22-49`) watches the friend's GPS and compass.
3. Distance (`find/[id].tsx:71`, haversine in `safekeeps/src/services/geo.ts:14-19`). Under 30 m, or under GPS accuracy + 20 m, the arrow hides. The screen leaves that state only above 45 m and above accuracy + 35 m. So GPS jitter around the line does not flip it back and forth (`find/[id].tsx:72-76`). In the close state the Bluetooth band signal starts (`find/[id].tsx:77`, `safekeeps/src/hooks/use-band-signal.ts:17-62`). It shows one of two states: "You're right next to them" or "Their band is in range" (`find/[id].tsx:129-131`). Before the first reading it shows "Looking for the band...", and after 10 s with no reading "No band signal".
4. "Right next to them" needs two things. The median of the last 4 s must pass -60 dBm. The window must hold at least 3 readings (`band.ts:69`, `band.ts:81-84`, called with the reading count at `use-band-signal.ts:49`). One strong reflected reading never enters it.
5. A scan that fails restarts every 2.5 s. The code stops the dead scan first, so no listener piles up (`use-band-signal.ts:7`, `use-band-signal.ts:30`, `use-band-signal.ts:36`, `use-band-signal.ts:46`).
6. Far away: an arrow from bearing minus heading (`find/[id].tsx:138`, `geo.ts:22-32`).
7. A screen reader hears one line per state: head toward the person, or "You're close. GPS can't point closer than this. Use Ping.", or the band state (`find/[id].tsx:79-84`). The text is the same while the state holds. It is not repeated for every new distance.
8. Ping: `sendPing` (`find/[id].tsx:99-110`) POSTs `/alerts/<id>/ping`. For duress alerts, and for alerts another friend took, the button is hidden (`find/[id].tsx:152-165`).
9. Server: `ping_alert` (`bridge.py:129-132`), then `_on_ping` (`loop.py:398-407`). It works only for a visible front alert that is escalating or acknowledged, from an alerted contact (`loop.py:402-405`). It sets `ping_at` (`loop.py:406`).
10. The wearer's next poll carries `ping_at` (`loop.py:487`). `PingOverlay` rings only for a newer value (`safekeeps/src/components/night-effects.tsx:155-161`) and plays sound, vibration and flash for 5 s (`night-effects.tsx:169-179`).
11. In parallel the relay writes ping to the band (`band-relay.ts:229-233`), and the band plays `pingAlarm()` (`kaze_band.ino:208-211`, `kaze_band.ino:86-96`).

### 4.12 A reminder reaches a locked phone

This covers the wearer's own checks. It does not use the server to push.

1. The server adds `next_check` to the wearer's own view, only while armed and only if it falls before the night ends (`loop.py:487-488`). `home_by` is already there until it fires (`loop.py:489-490`). Both are front fields, so ok and duress give the same values (`test_twin.py:89-92`).
2. `wantedReminders` turns that view into a list of times on the phone clock. Past times and non-armed states give nothing (`safekeeps/src/services/reminders.ts:10-16`). It is pure, with 6 tests in `reminders.test.ts`.
3. `useReminders` (`night-effects.tsx:80-140`) schedules those times with `expo-notifications`. It asks for permission when a night starts (`night-effects.tsx:95-98`). It changes only what moved by more than 5 s, because the clock offset jitters with every poll (`night-effects.tsx:71`, `night-effects.tsx:119-139`). It cancels everything when the night ends or the user leaves (`night-effects.tsx:103-110`). It clears the lock screen when the app opens (`night-effects.tsx:113-116`).
4. A check that is already running while the app is closed: every night view goes through `onNight`, which calls `notifyCheckNow` (`band-relay.ts:222`, `safekeeps/src/services/check-now.ts:13-22`). It shows one notification per deadline, and only when the app is not active. With the band, the heartbeat fetches the view in the background (`band-relay.ts:205-211`). Without the band, nothing wakes the app. So a running check reaches a closed app only through the band heartbeat. An open app shows the check on the screen and no notification.
5. Every notification has the same text: "Homebound", "Open the app." (`check-now.ts:5`). No buttons, no "Are you okay?". A watcher who reads the lock screen learns nothing, and a one-tap answer cannot skip the gesture. In the foreground, nothing shows (`night-effects.tsx:74-78`).
6. A free Apple Personal Team cannot sign the push entitlement. A small plugin removes it, because only local notifications are used (`safekeeps/plugins/no-push-entitlement.js`, listed at `safekeeps/app.json:43`).

### 4.13 Push to a contact with the app closed (ntfy)

1. A contact opens Settings. `PushSection` calls `GET /safekeeps/push` (`safekeeps/src/app/settings.tsx:52-62`). The server answers with that contact's own topic (`server/kaze/safekeeps.py:187-194`). It shows only when push is on (`settings.tsx:64`). The contact installs the free ntfy app and follows the topic.
2. `ntfy_topic` returns `None` when `KAZE_NTFY_URL` is unset. It also returns `None` when `KAZE_NTFY_SECRET` is missing, and logs a warning once (`app.py:81-91`).
3. When an alert starts, `loop.py` returns an `alert` effect per contact (`loop.py:187-188`). `push` hands the effects to `deliver` for the sockets, and to `notify` when ntfy is on, each in a background task (`app.py:111-124`).
4. `notify` picks `alert` effects whose target is not the wearer and who have a topic (`app.py:105-108`). It sends all pushes together, so one slow request delays no other (`test_push.py:127`).
5. `send_ntfy` posts a fixed text: "A Homebound alert is waiting for you. Open the app." It has no name and no location (`app.py:94-99`, `test_push.py:58`). A failure, including a 429 or 5xx, is logged and dropped. The countdown goes on (`app.py:100-102`, `test_push.py:94`, `test_push.py:114`).
6. A duress alert pushes only the duress contacts, one tier at a time, like the alert itself (`test_push.py:49`).

## 5. The subsystems

### 5.1 The state machine (`server/kaze/loop.py`, 506 lines, and `server/kaze/cards.py`, 43 lines)

**Data**
- `Config` (`loop.py:20-35`): the night's setup. PIN, the optional `duress_pin` (`loop.py:27`), ranked `tiers` (a list of lists), private `duress_contacts`, `group`, `share_location_with`. Demo timers: ask 30 s, grace 15 s, ack 20 s, ack hold 120 s (`loop.py:29-32`).
- `Alert` (`loop.py:38-53`): who was alerted, the tier, who took it, its own timer and its state. It also has `hidden`, its own location and the PIN of the night that raised it. Then `stale_ack_by`, `rounds` and `final_step` (marked SIMULATED at `loop.py:53`).
- `Session` (`loop.py:56-74`): the front fields, then the alerts, `connected`, location and `ping_at`. `next_check` is a front field (`loop.py:65`).

**Helpers**
- `_arm` (`loop.py:139-143`): armed, and plan the next periodic check.
- `_to_user` (`loop.py:146-148`): set the screen and make one `screen` effect.
- `_told` (`loop.py:151-154`): one effect per alerted contact, no duplicates. `dict.fromkeys` keeps the order.
- `_raise_duress` (`loop.py:255-264`): start one hidden duress alert. The `Duress` gesture and the duress PIN both use it.
- `_pick` and `_viewed` (`loop.py:192-204`): which alert a contact sees. Duress first, else the newest. View, Ack and Resolve all use this, so a contact acts only on the alert on their screen.
- `_resolve` (`loop.py:207-214`): end alerts, tell contacts, wipe the location.
- `_end_front` (`loop.py:217-224`): the front looks ended. It does not touch the alert itself. This is how the fake end works.

**Front transitions**

| From | Event | To | Code |
|---|---|---|---|
| armed | `Trigger(kind)` | asking, sends `check` | `loop.py:229-237` |
| armed, asking, waiting | `ConfirmOk` | armed, screen `thanks` | `loop.py:240-252` |
| asking | Tick past deadline | waiting, `alarm` | `loop.py:328-333` |
| waiting | Tick past deadline | escalating, tier 1 alerted | `loop.py:334-342` |
| any | `Duress` | front: same as `ConfirmOk` (thanks only from armed, asking, waiting). A hidden duress alert starts in every state | `loop.py:267-271` |
| any but ended | `Resolve(user, pin)` | see the PIN rules in 4.8 | `loop.py:274-299` |
| any but ended | `Resolve(user, duress_pin)` | same as the right PIN, plus a hidden duress alert. Nothing is resolved | `loop.py:302-313` |
| ended | `Resolve(user, duress_pin)` | no change for the user, a hidden duress alert starts | `loop.py:306-307` |
| escalating | `Ack` on the front alert | acknowledged | `loop.py:392-393` |
| escalating, acknowledged | taker's `Resolve` | resolved, `ended_true` | `loop.py:427-429` |
| resolved | next Tick | armed | `loop.py:352-353` |
| armed, resolved | Tick after `night_ends_at` | ended, `left` to group | `loop.py:343-346` |
| armed, resolved | `Leave` | ended, `left` to group. Refused in any other state | `loop.py:316-322` |
| any | `Disconnect`, `Reconnect` | no change, only the flag | `loop.py:441-448` |

**Escalation** (`loop.py:166-189`):

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

**The PIN rules** (`loop.py:289-299`):

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

`mine` (`loop.py:283`) is the active alerts raised under the typed PIN, without duress alerts. No PIN ends a duress alert (decision 13). Only a duress contact does (`_on_contact_resolve`, `loop.py:416`). A wrong PIN matches only plain alerts carried from an older night that used that PIN.

**The duress PIN** (`loop.py:302-313`). It is checked before every other PIN rule (`loop.py:275-276`). So it never counts as a wrong PIN. It also never ends a carried alert, even one whose old PIN equals it.

```python
def _on_duress_pin(s, now):
    """The front does exactly what the right PIN does. Nothing is resolved: the user's own alert goes on
    hidden, as after a fake end but with no warning, and a duress alert starts."""
    help_ = _raise_duress(s, now)  # first: it takes the front location, which the end clears
    if s.state == "ended":
        return help_
    effects = [_to_user(s, "ended_true")]
    if s.front_alert:
        s.front_alert.hidden = True
    _end_front(s)
    s.pin_ended = True
    return effects + help_
```

Compare it with the right PIN at `loop.py:284-288`. The user gets the same `ended_true` effect, and the front fields end the same. The only difference is in the alerts, which the front never reads.

**Privacy: `view_for`** (`loop.py:482-506`) is the only place that decides who sees what.
- The user gets `state`, `screen`, `deadline`, `ping_at`, `next_check`, and `home_by` until it fires (`loop.py:484-491`). `resolved` is shown as `armed`. `next_check` shows only while armed and before the night ends (`loop.py:488`). It lets the phone plan its own reminders (trace 4.12).
- Anyone not alerted gets `{"user_id", "active": False}` (`loop.py:492-494`).
- An alerted contact gets kind, card, who took it, `stale_ack_by`, `final_step`. The location is included only under the rule at `loop.py:495`:

```python
    sees_location = (c.share_location_with == "alerted" or viewer_id == a.acknowledged_by) and a.location is not None
```

**Other rules worth knowing**
- Ping only on a visible front alert (`loop.py:398-407`). A ringing phone during duress tells the captor that help is coming.
- An "ok" while armed does not push the next periodic check later (`loop.py:244`). Otherwise a captor can tap ok again and again to delay checks.
- A new night carries hidden alerts (`loop.py:130-131`). A captor cannot cancel a duress alert by starting a new night.
- Shared contact (in tiers and duress list): one "I'm on it" takes both alerts (`loop.py:379-382`), so the front changes the same way as for an honest user.
- `cards.py`: one response card per alert kind (`cards.py:11-38`). The duress card says "Do not call their phone" (`cards.py:32-37`). `card_for` returns fresh copies (`cards.py:41-43`). No diagnosis words, checked by `server/tests/test_loop.py:1123-1134`.

### 5.2 The server shell (`server/kaze/app.py` 466 lines, `bridge.py` 132, `safekeeps.py` 257, `panel.py` 85)

**`app.py`**
- The store is five module variables: `users`, `groups`, `sessions`, `sockets`, `offset` (`app.py:39-43`). Plain dicts, because the state is small and this is a demo.
- `now()` = `time.time() + offset` (`app.py:46-47`). Every timer uses it, so the clock skip moves everything at once.
- `run` (`app.py:127-129`) is the only place state changes. `tick_all` (`app.py:132-137`) ticks every night, and one broken night cannot stop the others (try/except at `app.py:134-137`).
- `push` and `deliver` (`app.py:69-78`, `app.py:111-124`) send effects in a background task. A stuck contact socket must not slow the user's own answer. Otherwise a duress (which sends to a contact) answers slower than an ok (which sends to nobody). Test: `server/tests/test_app.py:183`.
- `ntfy_topic`, `send_ntfy` and `notify` (`app.py:81-108`): the optional push. See trace 4.13. The topic is `"kaze-" + hmac-sha256(secret, contact id)[:20]` (`app.py:91`), so a topic cannot be guessed from a user id. Anyone who learns a topic can read that contact's pushes, which carry no personal data.
- `begin_night` (`app.py:306-334`) and `apply_event` (`app.py:358-376`) hold the checks that the phone, the panel and the old phase 1 routes all share.
- `save` and `load` (`app.py:147-186`): see trace 4.10. `# ponytail: trusts the file` (`app.py:175`): unpickling an untrusted file can run code. It is safe here only because only this server writes it.
- `demo_key` (`app.py:425-430`): a FastAPI dependency (a function that runs before the route and can stop it).

```python
def demo_key(x_demo_key: str | None = Header(default=None)) -> None:
    """The demo routes need the header X-Demo-Key to match KAZE_DEMO_KEY when that variable is set.
    Header only: a key in the URL would land in access logs, browser history and screen shares."""
    want = os.environ.get("KAZE_DEMO_KEY")
    if want and not secrets.compare_digest((x_demo_key or "").encode(), want.encode()):
        raise HTTPException(401, "a demo key is needed")
```

`compare_digest` is a constant-time compare, so the time a check takes does not leak how many characters matched.

- `demo_skip` (`app.py:436-444`) adds to `offset`, ticks at once and saves. `demo_reset` (`app.py:447-456`) clears memory and the file, not SQLite profiles.
- The WebSocket route (`app.py:405-422`) serves the old phase 1 clients and the tests. It closes Safekeeps ids with code 1008 (`app.py:407-409`).

**`bridge.py`**: the link from the teammate's profiles to the loop.
- A person's SQLite id is also their loop user id (`bridge.py:1-5`).
- A phone can send only `ConfirmOk`, `Duress`, `Resolve`, `LocationUpdate`, `Leave` (`bridge.py:17`).
- `night_event` (`bridge.py:90-105`) forces `by = me` on Resolve (`bridge.py:101`) and writes the same check-in record for ok and duress (`bridge.py:103-104`).
- `get_night` (`bridge.py:71-80`) adds `name` to each alert with `display_name` (`bridge.py:78-79`, `bridge.py:83-87`). The name travels with the alert, so the app does not depend on the friend list (`test_bridge.py:245-257`).
- `act_on_alert` (`bridge.py:108-116`) is used by ack, resolve and ping. It always answers `{"ok": True}`, so a caller cannot probe whether someone has a night or a hidden alert.

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
- Profiles, friend codes, friends, nicknames and check-in requests live at `safekeeps.py:113-257`. `GET /safekeeps/push` is at `safekeeps.py:187-194`.

**`panel.py` and `server/panel/index.html`**
- `privacy_rows` (`panel.py:34-50`) calls the real `view_for` for each person. The panel's privacy table is computed by the same function that serves the phones.
- The page polls `/demo/state` every 1 s (`index.html:264-276`) and sends the key as a header (`index.html:160-163`). Skip buttons are 15 s, 30 s, 60 s, 15 min (`index.html:146`).

**Python notes.** A plain `def` route runs in a thread pool, an `async def` route runs on the event loop. That is why the code iterates over copies of `sessions` (`app.py:395`, `bridge.py:76`) and why `save()` catches errors. `lifespan` (`app.py:196-204`) is FastAPI's start and stop hook: code before `yield` runs at start, code after it at shutdown.

### 5.3 The app (`safekeeps/`)

**React in 6 lines, for a Python person**
- A component is a function that returns a description of the screen. When its data changes, React calls it again ("re-renders").
- `useState` is a variable that keeps its value between those calls. Calling the setter redraws the screen.
- `useEffect` means "after drawing, run this side job". The function it returns is the cleanup, a bit like `__exit__`.
- `useRef` is a box that survives redraws but does not cause one, like an instance attribute.
- A hook is any function named `use...` that bundles state and effects. A Context is one shared object every screen can read.
- expo-router: the file path is the route. `src/app/find/[id].tsx` is `/find/<id>`, like Flask's `/find/<id>`.

**Key pieces**
- `safekeeps/src/app/_layout.tsx`: imports the band relay at launch (`_layout.tsx:6`), wraps everything in `SafekeepsProvider` (`_layout.tsx:27`), mounts `NightEffects` once on every screen (`_layout.tsx:40`).
- **The themed header.** `_layout.tsx:29-32` passes `ScreenHeader` as the native-stack `header` option. So every inner screen draws the Home banner with a themed back button and the screen title, in place of the iOS glass back button (`safekeeps/src/components/screen-header.tsx:12-36`). Home draws its own banner with "HOMEBOUND" and hides the stack header (`_layout.tsx:33`, `safekeeps/src/app/index.tsx:66-73`). The route title for Home is "Homebound" (`_layout.tsx:33`). The title is a header for screen readers (`screen-header.tsx:29`). The back button is 44 pt (`screen-header.tsx:24`).
- `safekeeps/src/state/safekeeps.tsx` (the most important app file): one big hook, `useSafekeepsState` (`safekeeps.tsx:8-175`), shared through a Context (`safekeeps.tsx:177-186`). It does the polling, `serverOffset`, the lock and most server calls (location updates, Ping, the Settings push lookup and the band relay call `api()` directly).

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
- `refresh` (`safekeeps.tsx:45-58`) drops a poll result that started before a user action (`safekeeps.tsx:50`). Without that, an old poll can land after your tap and show the old screen.
- `serverOffset` (`safekeeps.tsx:38-43`) = server clock minus phone clock. Countdowns use it, so a phone with a wrong clock still shows the right time (`check-in-card.tsx:255`). The reminders use it too (`night-effects.tsx:119`).
- `mutate` (`safekeeps.tsx:75-94`): one action at a time (`lock`), and `busy` greys out buttons. A refused request (`ApiError`, the server answered no) is told apart from a connection problem (`demo-api.ts:45-47`, `safekeeps.tsx:87`). The state exposes `offline` and `clearError` (`safekeeps.tsx:159`). `ConnectionStatus` shows "Retry connection" only when offline. Otherwise it shows an "OK" button that clears the error (`safekeeps/src/components/connection-status.tsx:19-21`).
- `sendNightEventRetry` (`safekeeps.tsx:142-151`): a finished gesture is retried every 700 ms for 10 s, so it is never silently dropped.
- `safekeeps/src/services/demo-api.ts:49-80`: every call goes to `url + '/safekeeps' + path` with a Bearer token and an 8 s timeout (`demo-api.ts:56`).
- `safekeeps/src/components/check-in-card.tsx`: the wearer's card. It draws `view.screen` from the server and adds only small local overlays (`check-in-card.tsx:85-90`, `check-in-card.tsx:113-117`). With no night running, the card is `PlainCheckIn`. It shows "Thanks!" for 1.5 s after a saved check-in (`check-in-card.tsx:44-50`). Ok and duress share one code path:

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

- `PinEntry` (`check-in-card.tsx:275-299`): the phone checks only "4 digits". The phone never knows the right PIN. "Cancel an alert" on the armed screen (`check-in-card.tsx:189`) lets a duress user open the PIN entry even though the phone shows nothing.
- `safekeeps/src/services/gesture.ts`: the tap decoder. On the phone one short tap is ok, so there is no tap counting. The duress rules are the same as the band (hold 1 s, then 2 taps within 2.5 s). The band still needs 3 taps for ok. It is a pure state machine: you pass it times, and it never reads the clock (`gesture.ts:3-4`). That is why it has 13 unit tests.

```ts
    pressOut(t: number): GestureResult {
      const late = expire(t);
      if (pressedAt === null) return late;
      const held = t - pressedAt;
      pressedAt = null;
      if (held >= HOLD_MS) { armedUntil = t + DURESS_WINDOW_MS; duressTaps = 0; return late; }
      if (armedUntil !== null) return ++duressTaps >= 2 ? finish('duress') : late;
      return late ?? finish('ok');
    },
```

  `createGestureDecoder` (`gesture.ts:10-53`) is a closure, a function that keeps private variables, like a small class.
- `safekeeps/src/app/find/[id].tsx`: Find them. Too close for GPS means no arrow. The state has two thresholds, so it does not flip at the edge (`find/[id].tsx:72-77`):

```tsx
  // Indoor GPS is off by 20 to 50 m, so a short distance is mostly noise. Do not point the arrow at noise.
  // Enter below 30 m, leave above 45 m, so jitter around the line does not flip the screen (or the spoken line) back and forth.
  const [close, setClose] = useState(false);
  const tooClose = close ? !(metres > 45 && metres > own.accuracy + 35) : metres < 30 || metres < own.accuracy + 20;
  if (tooClose !== close) setClose(tooClose);
  const band = useBandSignal(own.position !== null && alert?.location != null && tooClose); // the band takes over when GPS cannot
```

- `safekeeps/src/components/night-effects.tsx`: three jobs, mounted once (`night-effects.tsx:21-25`).
  - Location: sends GPS while a night runs and the app is open, on a 25 m move or every 30 s (`night-effects.tsx:16-17`, `night-effects.tsx:29-66`). It calls `api()` directly, not `mutate()`, so it never blocks a gesture (`night-effects.tsx:27-28`, `night-effects.tsx:46`).
  - Reminders: `useReminders` (`night-effects.tsx:80-140`), see trace 4.12.
  - `PingOverlay` (`night-effects.tsx:144-188`) rings for 5 s. With Reduce Motion on, it does not flash (`night-effects.tsx:163-167`, `night-effects.tsx:176`).
- `safekeeps/src/components/alerts-section.tsx:46-124`: the responder side. The card text comes from the server. "I'm on it" shows only while nobody took it, "Resolve" only for the taker or a duress contact (`alerts-section.tsx:71`, `alerts-section.tsx:114-117`). The server checks this again. It also says "X is on it" and "Alert closed" to a screen reader (`alerts-section.tsx:53-65`).
- `safekeeps/src/app/settings.tsx`: `PushSection` shows the contact's ntfy topic when the server has push on (`settings.tsx:51-74`, placed at `settings.tsx:94`).
- `safekeeps/src/app/night.tsx`: Start a night (trace 4.1).
- The teammate's original screens: friends list, friend requests, friend codes, the friend page, Settings. `friends/[id].tsx:46` ("Bluetooth not connected") and `settings.tsx:95-98` ("Emergency contacts") are static placeholders from the original design.

**Accessibility, in the teammate's theme.** The look stays. The changes are small and sit in a few places.
- Text colours. The foreground tokens are darker versions of the same hues, so text reaches 4.5:1 on every surface (`safekeeps/src/constants/theme.ts:29-33`). The field border reaches 3:1 (`theme.ts:33`). The off-state of a switch has its own darker track (`safekeeps/src/components/form.tsx`, `offTrack`).
- Screen reader lines. `useAnnounce` says a line when its text changes. It skips the same text twice within 1 s (`safekeeps/src/hooks/use-announce.ts:8-16`). `ThemedText` takes an `announce` prop that uses it (`safekeeps/src/components/themed-text.tsx:11`, `themed-text.tsx:17`).
- The same words for the same look. The check card has one table of spoken lines, `SPOKEN` (`check-in-card.tsx:29-39`). Ok and duress both end on "Thanks!". The right PIN, the duress PIN and the fake end all say "Alert ended". Nothing a watcher can hear tells them apart.
- Labels and hints. The check button has a label that follows the screen and a hint, "Tap if you are okay" (`check-in-card.tsx:157-158`). Fields repeat their helper text as the hint and hide the visible copy from the reader (`form.tsx`).
- TalkBack. The `onPress` path counts one click as one quick tap, so one double-tap says ok (`check-in-card.tsx:161-167`).
- Large text. `ThemedText` allows text to grow to 2x (`themed-text.tsx:20`). The layouts have no fixed heights. The header title is the exception and shrinks to fit (`screen-header.tsx:29-30`).
- Touch targets. `TouchTarget` is 44 (`theme.ts:97`). Buttons and choice chips use it as a minimum height and width (`app-button.tsx`, `form.tsx`).
- Motion. The ping flash stops with Reduce Motion (`night-effects.tsx:163-176`).

### 5.4 The band (`Hardware/kaze_band/kaze_band.ino`, `safekeeps/src/services/band.ts`, `band-relay.ts`)

**Arduino in 4 lines, for a Python person**
- `setup()` runs once at power-on. `loop()` then runs forever, like `while True:`.
- `millis()` is milliseconds since boot, like `time.monotonic()*1000`. `delay(ms)` is a blocking `time.sleep`.
- A BLE "service" is a named group of values. A "characteristic" is one value in it that the phone can read, write or subscribe to.
- TypeScript `async/await` works like Python's `asyncio`.

**Firmware**
- Pins: button D2, touch D3, buzzer D4, LED D5 (`kaze_band.ino:23`). Timings are named constants (`kaze_band.ino:25-36`, `kaze_band.ino:67`).
- Characteristics (`kaze_band.ino:39-41`): `eventChar` is notify only, so nobody can read the last answer later. `pingChar` and `askChar` are write.
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
- `keepPending` (`band.ts:40-47`): 60 s for ok and duress alike.
- `median` and `nextNear` (`band.ts:62-84`): the band signal on Find them. The median over 4 s means one reflected reading cannot move it. `nextNear` has two states with hysteresis. With a median stronger than -60 dBm and at least 3 readings in the window, it enters "right next to them" (`band.ts:67`, `band.ts:69`, `band.ts:83`). Only with a median weaker than -68 dBm does it leave (`band.ts:68`). The 8 dB gap stops the screen from flickering. No reading in the last 4 s resets it (`band.ts:82`). Why only two states: at the venue, only "right beside" (-41 dBm) stood out. From 1 m to 20 m the readings were noise (-75 to -88 dBm, `Hardware/kaze_band/HARDWARE.md`). The old three zones and Warmer or Colder were not accurate past 1 m in the two-person test.
- `noNight` (`band.ts:60`): only a 404 drops a band answer. Every other failure is retried.

**The scan hook: `use-band-signal.ts`.** It scans for the band while Find them is in the close state. It keeps a 4 s window of readings (`use-band-signal.ts:47`) and calls `nextNear` every 500 ms with the median and the reading count (`use-band-signal.ts:44-50`). When a scan reports an error, `fail` marks it dead, waits 2.5 s, stops the old scan and starts a new one (`use-band-signal.ts:7`, `use-band-signal.ts:30`, `use-band-signal.ts:36`, `use-band-signal.ts:46`). Without the stop call, every retry leaves one more listener. Any KAZE band counts, because iPhones hide the hardware address and every band has the same name (`use-band-signal.ts:15-16`).

**The relay: `band-relay.ts`**
- It lives at module level, not in a screen. iOS can relaunch the app in the background with no screen (`band-relay.ts:1-4`).
- `relaySession()` (`band-relay.ts:25-36`) keeps a copy of the login readable after the first unlock, so it works with the phone locked in a pocket.
- `createManager()` (`band-relay.ts:56-73`) uses `restoreStateIdentifier: 'kaze-band'`. With it, iOS relaunches the app for data from the band. It needs the `central` background mode (`safekeeps/app.json:53-57`).
- `keepConnected()` (`band-relay.ts:90-117`): connect, subscribe, wait for disconnect, sleep 1 s, repeat. The `epoch` counter works like a cancel token.
- `sendEvent()` (`band-relay.ts:188-196`): retry every 700 ms for 10 s, then keep it and retry later.
- `onHeartbeat()` (`band-relay.ts:205-211`): each heartbeat wakes the app. If it is in the background, it fetches the night and calls `onNight`.
- `onNight()` (`band-relay.ts:219-234`): tells `notifyCheckNow` about the view (trace 4.12), then writes ask and ping to the band.

```ts
export function onNight(night: Night | null) {
  void flushPending();
  const view = night?.view;
  notifyCheckNow(view);
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

### Server: 305 tests, all pass (3 s)

Run:

```
cd ~/Desktop/kaze/server && SAFEKEEPS_DB=/tmp/kz-tour.sqlite3 ~/Desktop/kaze/server/.venv/bin/pytest -q .
```

Result on 2026-10-17 (branch `ntfy`): `305 passed, 1 warning in 2.95s`.

| File | Tests | What it proves |
|---|---|---|
| `server/tests/test_scenarios.py` | 13 | The 7 KAZE scenarios, one group each (`test_1_safe` at line 19 to `test_7_privacy` at line 333). Written from PLAN.md only, never from loop.py (`server/tests/helpers.py:1`). |
| `server/tests/test_loop.py` | 147 | Edge rules: ignored events, re-alerts and final step, Leave, night end, hidden alerts, periodic and home-by, `next_check` in the own view (`test_loop.py:272`), ping, cards, stale acks. The duress PIN in every front state, compared with a twin that gets the right PIN (`test_loop.py:1261`). No PIN ends a duress alert (`test_loop.py:1363`, `:1375`, `:1384`). |
| `server/tests/test_twin.py` | 30 | A watcher cannot tell duress, a fake end or the duress PIN from an honest user. 500 random runs of 70 steps, plus explicit cases. The next check is the same after duress and after ok (`test_twin.py:89`). The duress PIN against the right PIN from all 8 front states (`test_twin.py:431`). |
| `server/tests/test_app.py` | 47 | The duress PIN checks on `POST /sessions` (`test_app.py:316`). HTTP routes, scenario 4 over a real WebSocket (`test_app.py:24`), a stuck socket does not slow a duress answer (`test_app.py:183`). |
| `server/tests/test_bridge.py` | 39 | Tokens and friend checks. The HTTP twin with the duress PIN against the right PIN, compared byte for byte (`test_bridge.py:707`). The duress PIN is checked and never shown (`test_bridge.py:684`). Allowed event types (`test_bridge.py:159`). Same answer for anyone (`test_bridge.py:333`). Friends' data identical after ok and duress (`test_bridge.py:114`). Escalation with no polling (`test_bridge.py:189`, `:201`). The alert carries the name, also after a removal (`test_bridge.py:245`). |
| `server/tests/test_push.py` | 9 | ntfy: one push per alerted contact (`test_push.py:42`), duress pushes only the duress contacts (`:49`), the text has nothing personal (`:58`), off without the URL or the secret (`:76`, `:85`), a failing send does not break the countdown (`:94`), a topic is only the caller's own (`:106`), a rejection is logged (`:114`), pushes go out together (`:127`). No network: the send is replaced. |
| `server/tests/test_panel.py` | 9 | Key in header only (`test_panel.py:32`), privacy table matches `view_for` (`test_panel.py:89`). |
| `server/tests/test_safekeeps.py` | 8 | The teammate's profile and friend API. |
| `server/tests/test_persist.py` | 3 | Restart mid-alert keeps escalating (`test_persist.py:15-34`), corrupt file starts empty, reset deletes the file. |

The 7 scenarios map like this:

| Scenario | Test |
|---|---|
| 1 Safe | `test_1_safe`, `test_scenarios.py:19` |
| 2 No response | `test_2_no_response`, `test_scenarios.py:40` |
| 3 Duress | `test_3_duress`, `test_scenarios.py:78`. The duress PIN: `test_3_duress_pin_looks_like_a_real_cancel_but_alerts_the_duress_contacts`, `test_scenarios.py:119` |
| 4 Connectivity | `test_4_connectivity_failure`, `test_scenarios.py:152`. It checks the disconnected session escalates at the same second as a connected one (`test_scenarios.py:170`). |
| 5 Unacknowledged | `test_scenarios.py:180` and `:216` |
| 6 False alarm | `test_scenarios.py:243`, `:264`, `:283` |
| 7 Privacy | `test_7_privacy`, `test_scenarios.py:333`. No location inside the alert message (`:355-358`), gone after resolve (`:361-366`). |

How the tests stay fast:
- fake time in the loop tests (`helpers.py:44-67`)
- FastAPI's `TestClient`, which runs in-process with no network port
- `/demo/skip` instead of waiting
- a temporary state file for every test (`server/tests/conftest.py:4-9`)

### App: 59 node tests, all pass (80 ms)

Run:

```
cd ~/Desktop/kaze/safekeeps && node --test src/services/*.test.ts
```

Result on 2026-10-17: `tests 59, pass 59, fail 0`.

| File | Tests | What it covers |
|---|---|---|
| `gesture.test.ts` | 13 | Each gesture rule and the edges: 1000 ms is a hold, 999 ms is a tap. |
| `band.test.ts` | 18 | Byte decoding and base64 for all 256 bytes. The ask key, the 60 s pending rule (the same for ok and duress), the ping rule and the median. `nextNear`: enter at -60, leave at -68, reset with no reading, and no entry with fewer than 3 readings. `noNight`: only 404 drops. |
| `geo.test.ts` | 12 | Distance, bearing, arrow rotation, the short way round. |
| `home-by.test.ts` | 8 | Clock parsing, next time, rounding. |
| `reminders.test.ts` | 6 | Which reminders a view gives: next check, home-by, both, none, nothing while a check runs, and the same result after ok and after duress. |
| `age.test.ts` | 2 | "just now" and "N min ago". |

Not covered by automated tests: the screens and components, the polling, the retry, the ping overlay, the notification scheduling in `useReminders`, `notifyCheckNow`, the screen reader lines, the HTML panel's JavaScript, the band relay's Bluetooth code, and the firmware.

### Hardware: tested by hand

On an iPhone 15 Pro (Release build) and the Uno R4 WiFi band, 2026-10-17 (`DEMO_NOTES.md:9-16`, `DEMO_NOTES.md:111-127`):

| Test | Result |
|---|---|
| Pairing, "Band connected" on Home | Pass |
| Band ok and duress reach the server and look the same on the phone | Pass |
| A check makes the band ask. A Ping makes the phone ring and the band flash | Pass |
| Heartbeat: phone screen off, band asked about 12 s after a check started | Pass (a few tries, not 10 timed trials) |
| State restoration: app stopped from the Mac, iOS relaunched it in about 12 s, band answer reached the server with the screen off | Pass |
| Advertising while connected: a second phone still saw KAZE-Band | Pass |
| Hotter and colder, three zones (two-person test) | Not accurate past 1 m: walking away sometimes showed a closer state. Now two states, retest pending |
| Band duress gesture in the two-person test | Fail: the duress contact got nothing. Two likely causes are fixed. Retest pending |
| Band answers with no night running | Refused by the server. Home now says "Band connected. Start a night to use it." Retest pending |
| Battery drain per hour | Not measured yet |

On an iPhone 13 (Release build) with the friends in a web browser, branch `ntfy`, 2026-10-17 (`DEMO_NOTES.md:117-127`):

| Test | Result |
|---|---|
| Duress PIN from "Cancel an alert" | Pass: filled "Alert ended", the duress contact got the alert, the tier contact saw nothing new |
| Scaled alerts: tier 1 silent, tier 2 gets it | Pass |
| ntfy push to a locked phone | Pass: the lock screen showed "Homebound: A Homebound alert is waiting for you. Open the app." |
| Local reminder, 5 min check, phone locked, app not opened | Pass: the lock screen showed "Homebound: Open the app." Not covered: a check a friend starts while the app is closed and there is no band |
| New text colours and VoiceOver | Pass on the older three-tap build: the button and hint are read, three double-taps check in |
| Themed header and alert names (also on the iPhone 15 Pro) | Pass |

Not tested on a phone: TalkBack, the duress gesture with a screen reader on, the band with the duress PIN build, and the band signal scan rate.

Honest note: the band tests in the first table ran on the earlier firmware and app from branch `home-by` (`DEMO_NOTES.md:9`). The latest firmware changes compile but were not tested on the board (`DEMO_SCRIPT.md:187-190`, `Hardware/kaze_band/HARDWARE.md:126`). They are: buzzer on, answers kept 60 s until a phone subscribes, and 0 after each answer. The app's band relay also changed after those tests and is untested on the phone with the band. Failed band answers are kept on the phone and retried for up to 60 s (`band-relay.ts:165-196`). The band is asked again at the louder stage (`band.ts:35-37`, `DEMO_NOTES.md:99`). A real server process restart was not tried before the demo (`DEMO_NOTES.md:139`).

### Test counts to quote

`main` has 305 server tests and 59 app node tests.

## 7. Likely questions and answers

**Note on process questions.** A judge can ask "Did you write this code?" or "How did you build this?". Answer honestly about how the team built it. That includes AI-assisted coding, to the extent the team used it. It also includes who built which part (the teammate built the app's original screens). This guide does not script that answer.

### Potential impact

#### Q: How does this close the gap when someone cannot ask for help?
Silence is the alarm. Every trigger (a timer, home-by, a friend's request, a separation) starts a check (`loop.py:229-237`). If nobody answers in 45 s, contacts are alerted with no action from the person (`loop.py:328-342`). The server runs the timer, so a dead or lost phone still escalates.

#### Q: Does KAZE detect drugging or unconsciousness?
No, on purpose. Every trigger is a timer, a request, or a simulated separation (`loop.py:87`). Only silence or the duress gesture escalates. The response cards give steps and make no diagnosis, and a test fails on words like "drugged" or "unconscious" (`server/tests/test_loop.py:1123-1134`).

#### Q: What does a contact actually see?
First a banner that names the person. Then a card with what to do and what not to do, and who is on it. It also shows the location with its age (`alerts-section.tsx:46-124`). The card text comes from `cards.py:11-38`. The duress card says "Do not call their phone" (`cards.py:32-37`). The name comes from the server with the alert, so it shows even if the contact removed that friend during the night (`bridge.py:78-79`, `test_bridge.py:245`).

#### Q: How does a contact hear about an alert when the app is closed?
Only if push is on. The server sends a short message through ntfy to that contact's own topic. The contact follows the topic in the free ntfy app, and the topic is shown in Settings (`app.py:105-124`, `settings.tsx:52-74`). The text says "A Homebound alert is waiting for you. Open the app." It has no name and no location (`app.py:98`, `test_push.py:58`). A duress alert pushes only the duress contacts (`test_push.py:49`). Tested on an iPhone 13 with the screen locked (`DEMO_NOTES.md:125`). Limits: it is off unless the team sets `KAZE_NTFY_URL` and `KAZE_NTFY_SECRET`. ntfy is a third-party service. Anyone who learns a contact's topic can read those messages, but they carry no personal data. With push off, a contact sees an alert only while the app is open (`DEMO_NOTES.md:53`). A real product sends push through Apple's service.

#### Q: How does the wearer hear about a check when the app is closed?
Two ways. The phone schedules its own notifications for the next check and the home-by time (trace 4.12, `night-effects.tsx:119-139`). With the band, the band's heartbeat wakes the app, which then asks the band and shows a notification (`band-relay.ts:205-211`, `check-now.ts:13-22`). The text is always "Homebound: Open the app." Tested with a locked iPhone 13 (`DEMO_NOTES.md:126`). Limits: a check that a friend starts while the app is closed and there is no band reaches the phone only when the app opens. Focus modes can silence a notification. The notification has no "Are you okay?" on purpose, so a watcher learns nothing from the lock screen.

### Safety and reliability

#### Q: Why does the server own every timer, not the phone?
The person is often unable to touch the phone. The phone can die, lose signal or be killed by iOS. A timer on the phone stops at exactly the wrong moment. The ticker ticks every night each second (`app.py:189-193`). Tests: `test_4_connectivity_failure` (`test_scenarios.py:152`) and escalation with no polling (`test_bridge.py:189`).

#### Q: What if the first contact never answers?
Each tier has 20 s in the demo (`loop.py:31`, `loop.py:173-176`), then the next tier is alerted (`loop.py:361-368`). After the last tier, everyone is re-alerted with 60, 120, then 300 s gaps (`loop.py:166`). After 3 rounds nobody took, a `final_step` flag is set (`loop.py:179-180`). Tests: `test_scenarios.py:180`, `test_loop.py:242`.

#### Q: What if someone taps "I'm on it" and then does nothing?
"I'm on it" starts a 120 s hold (`loop.py:389`). If nobody resolves it in time, the alert goes back out and everyone sees who did not follow through (`loop.py:363-367`, `loop.py:504`). Test: `test_5_acknowledger_who_does_not_end_it_hands_the_alert_on` (`test_scenarios.py:216`).

#### Q: What stops a captor from forcing the user to cancel?
The first wrong PIN is a normal retry (`loop.py:291-293`). The second shows "Alert ended", but the alert becomes hidden, keeps escalating, and contacts are warned (`loop.py:294-299`). More guesses change nothing (`loop.py:289-290`). Leave is refused during a check or alert (`loop.py:316-318`), and a new night does not cancel a hidden alert (`loop.py:130-131`). The user can also type the duress PIN. It looks like a real cancel, but it starts a silent duress alert and ends nothing (`loop.py:302-313`). No PIN ends a duress alert, not even the real one (decision 13, `loop.py:281-283`). So a captor who forces out the real PIN ends only the user's own alert. Guessing PINs until the filled check shows gets the captor nothing against a duress alert (`test_loop.py:1384`). Limits: a user who triggers duress by accident cannot cancel it. A duress contact has to resolve it, and until then the alert repeats (`DEMO_NOTES.md:67`). Guesses after an end screen are not limited, and the filled and outlined checks are a cue the design assumes the captor does not know (`DEMO_NOTES.md:66`). The PIN is 4 digits, compared as plain text (`loop.py:284`).

#### Q: Can a watcher tell an ok from a duress?
Not from the phone, the band or the server answer. The app uses one code path (`check-in-card.tsx:131-140`). The screen reader says "Thanks!" for both (`check-in-card.tsx:34`). The band uses one `sendEvent` and one beep (`kaze_band.ino:98-109`). The server runs the ok code first (`loop.py:271`) and writes the same record (`bridge.py:103-104`). The next check and the reminders are the same after both (`test_twin.py:89`). `test_twin.py` checks this over 500 random runs. Limits: the gesture itself differs (hold then 2 taps), the BLE link is not encrypted, and the HTTPS body length differs (`DEMO_NOTES.md:75`).

#### Q: What happens if the phone loses signal right when the user taps?
The app retries every 700 ms for 10 s (`safekeeps.tsx:142-151`). The band path then stores the answer on the phone (SecureStore). It retries it until 60 s after the band sent it (`band-relay.ts:188-196`, `band.ts:45-47`). This part is unit-tested only, not on the phone with the band. If it still fails, the server timer escalates. So a failure leads to help, not to silence.

#### Q: What if the server crashes mid-alert?
State is saved every second, atomically (`app.py:147-163`), and loaded at start (`app.py:166-186`). The test clears memory and starts a new client (`test_persist.py:15-34`). Limits: up to 1 s of changes can be lost, it is one process, and a real Ctrl+C restart was not rehearsed before the demo.

#### Q: Why does the band not report "no answer"?
Silence is the absence of a message, and only the server can count it reliably. The band just stops blinking after 30 s (`kaze_band.ino:222-226`). A dead band gives the same result as no answer: escalation. A timeout can also never become a duress byte (`HARDWARE.md:59-61`).

#### Q: How do you stop a phone from sending events it is not allowed to send?
A phone can send only 5 event types (`bridge.py:17`). Resolve is always stamped with the caller (`bridge.py:101`). Acting on your own alert is a 400 (`bridge.py:113-114`). Every contact must be an accepted friend (`bridge.py:61-62`). Test: `test_bridge.py:159`.

### Usability and accessibility

#### Q: Can an impaired person really do one tap?
On the phone it is one tap. On the band it is three taps. That is the only thing they need to do, and doing nothing is safe: silence escalates. A hold with no taps also counts as ok (`gesture.ts:22-26`, `kaze_band.ino:249-254`), so a clumsy press never sends duress. The band means they do not need to find or unlock the phone. Real usability with impaired users is not tested yet (`VALIDATION.md`).

#### Q: Does the app work with a screen reader and large text?
Yes, in the parts the team changed and tested. The check screens, alerts and Find them speak short lines (`check-in-card.tsx:29-39`, `find/[id].tsx:79-84`, `alerts-section.tsx:53-65`). Ok and duress say the same words. The text colours reach 4.5:1 on every surface (`theme.ts:29-33`). Text grows to 2x (`themed-text.tsx:20`) and touch targets are at least 44 pt (`theme.ts:97`). Under TalkBack, a double-tap counts as one quick tap, so one double-tap says ok (`check-in-card.tsx:161-167`). Tested with VoiceOver on an iPhone 13 (`DEMO_NOTES.md:124`). Limits: TalkBack and the duress gesture with a screen reader are not tried on a phone. The outlined check after a wrong PIN is about 2.9:1, so it is visible but quiet (`DEMO_NOTES.md:72`). We have not run the planned studies with users yet (`DEMO_NOTES.md:82`, `VALIDATION.md`).

#### Q: What happens when the phone is locked in a pocket?
The band sends a heartbeat every 20 s (`kaze_band.ino:203-206`). iOS wakes the app for it, the relay asks the server, shows one plain notification and tells the band to ask (`band-relay.ts:205-211`, `check-now.ts:13-22`). Measured about 12 s on an iPhone 15 Pro (`DEMO_NOTES.md:14`). Limit: a swiped-away app is not relaunched by iOS (`DEMO_NOTES.md:59`). On a phone alone, the scheduled reminders still show for the next check (trace 4.12).

#### Q: Why does the arrow disappear when you get close?
Indoor GPS is off by 20 to 50 m, so a short distance is mostly noise (`find/[id].tsx:72-73`). Below 30 m, or below GPS accuracy + 20 m, the screen says "Use Ping" and switches to Bluetooth signal strength (`find/[id].tsx:75`). It leaves that state only above 45 m and above accuracy + 35 m, so the screen does not flip back and forth at the line (`find/[id].tsx:74-76`). It shows only two band states: "You're right next to them" or "Their band is in range" (`find/[id].tsx:129-131`). "Right next to them" needs at least 3 readings in the last 4 s with a median stronger than -60 dBm, so one strong reading is not enough (`band.ts:69`, `band.ts:83`). If the scan fails, it restarts every 2.5 s (`use-band-signal.ts:7`, `use-band-signal.ts:46`). Under Ping it says "Bluetooth can only tell when you are right beside them. Use Ping to hear them." (`find/[id].tsx:159-163`). The band states are unit tested (`band.test.ts`). The scan restart has no automated test. Neither one is tested on hardware yet. The real iOS scan rate is not measured (`DEMO_NOTES.md:70`).

#### Q: Why can the band not show the distance in metres?
Bluetooth signal strength (RSSI) is not a distance. At the venue, right beside the band read -41 dBm. From 1 m to 20 m it read -75 to -88 dBm, in no order (`Hardware/kaze_band/HARDWARE.md`). Bodies, walls and the way the board faces change it more than distance. The old three zones with Warmer and Colder were not accurate past 1 m in the two-person test: walking away sometimes showed a closer state. So the app now says only "right next to them" or "in range" (`band.ts:62-84`). Ping does the rest. The real fix is UWB (ultra-wideband) radio, which measures distance to within tens of centimetres. It is in "Not built" in `DEMO_NOTES.md` and `HARDWARE.md`.

#### Q: Is the alarm safe for everyone?
Ping flashes every 400 ms, under 3 flashes a second, and does not flash with Reduce Motion on (`night-effects.tsx:163-176`). It plays sound even on silent mode (`night-effects.tsx:171`).

### Feasibility

#### Q: Why does the app poll instead of using WebSockets?
Polling recovers by itself after a dropped network, a new tunnel address or a server restart. iOS suspends sockets in the background anyway. The server owns every timer, so up to 2.5 s of delay is small against a 30 s ask. The WebSocket route exists for the old clients and tests (`app.py:405-422`). The prototype adds optional ntfy for contacts and local reminders for the wearer. A real product uses Apple's push service, which needs a paid Apple account.

#### Q: Why a Release build and not Expo Go?
Expo Go cannot load the native Bluetooth module (`README.md`, the iPhone build step). Release puts the JavaScript inside the app, so it does not need the venue Wi-Fi to reach the laptop. A new server address goes in Settings with no rebuild.

#### Q: What is simulated?
The passage of time (`app.py:436-444`) and phone disconnects (`loop.py:441-443`). Contacts who do not respond, and group separation. The final step (`loop.py:180`), and every alert. No SMS, calls or 911. The ntfy message is real, but it only tells a contact to open the app. The full list is `DEMO_NOTES.md:43-49`.

#### Q: What changes in production?
- Apple's push service for contacts and for the wearer's checks, in place of polling and ntfy. SMS as a backup.
- Real timers: about 2 min, 1 min, 3 min, 10 min (`DEMO_SCRIPT.md:26-31`).
- A real database and several server instances instead of dicts and a pickle file.
- Hashed, expiring tokens and a hashed, rate-limited PIN.
- BLE bonding with encryption, and a per-user band id.
- A real dispatcher at the final step.
- No `/demo` routes.

#### Q: Why does the band need the phone?
The band only speaks BLE. On the Uno R4 WiFi, BLE and Wi-Fi share one radio chip, so a direct band-to-server path was not built (`DEMO_NOTES.md:61`). If no path exists, the server timer still escalates.

### Privacy and autonomy

#### Q: Who sees the location, and when?
All night, the phone sends it about every 30 s or after a 25 m move. It does this only while the app is open (`night-effects.tsx:16-17`, `night-effects.tsx:29-66`). A locked phone sends nothing, so the location can be old. The card shows its age. But `view_for` gives it only to contacts in an active alert (`loop.py:495`). The user can also limit it to the taker only. It is never inside the alert message or the push text (`test_scenarios.py:355-358`, `test_push.py:58`). When the alert ends, it is wiped (`loop.py:213`). The demo panel sees everything, on purpose, and is locked by a key (`DEMO_NOTES.md:78`).

#### Q: What does the ntfy server learn?
The push goes through the ntfy server the team picks. That server sees the topic name and the time of each push. It does not see a name or a location, because the text has none (`app.py:98`). The topic is an HMAC of the contact's id, so it does not show the id (`app.py:91`). A self-hosted ntfy server removes the third party, since `KAZE_NTFY_URL` can point at any ntfy server.

#### Q: Does the group learn about a duress alert?
No. Duress goes only to the private duress list, one at a time (`loop.py:257`). Group members get `active: False` (`loop.py:493-494`), and the twin test checks they only ever get `left` (`test_twin.py:49-52`). Push follows the same list (`test_push.py:49`).

#### Q: Can a friend probe whether I have a night or a hidden alert?
No. Ack, resolve and ping always answer `{"ok": True}` (`bridge.py:108-116`). The loop decides whether it counts. Tests: `test_bridge.py:333` (ack and resolve) and `test_bridge.py:602` (ping).

#### Q: Can a friend ping a duress alert and expose it?
No. The app hides the button (`find/[id].tsx:152-153`), and the server refuses it anyway: `_on_ping` ignores hidden alerts (`loop.py:402`).

#### Q: Can the user leave a group?
Yes, from the armed screen, with one extra tap and no notice to anyone but a `left` effect (`loop.py:316-322`, `check-in-card.tsx:230-242`). Not during a check or alert, so a captor cannot use Leave to cancel.

#### Q: What if I remove a friend during a night?
Contacts are fixed for that night (`PLAN.md` decision 9, `DEMO_NOTES.md:76`). Otherwise a captor can remove contacts to cancel a hidden alert. The cost: the removed friend keeps that night's access. They still see the person's name on the alert (`bridge.py:78-79`).

### Code and design

#### Q: Why is the state machine one pure function?
All rules live in `step` (`loop.py:475-479`). Time comes in and effects go out. So it is testable with fake time, repeatable, and the web server stays thin (`app.py:127-129`). A swap from FastAPI to a queue does not touch the rules.

#### Q: How does the twin test work?
Two sessions get the same events, with one exception. One gets `Duress` where the other gets `ConfirmOk` (`test_twin.py:165`). Or one gets a second wrong PIN against the right PIN (`test_twin.py:177`). Or one gets the duress PIN against the right PIN (`test_twin.py:152-163`, `test_twin.py:223-225`). After every step it asserts the user views and user effects are equal (`test_twin.py:43-54`). It runs 500 fixed seeds of 70 steps and asserts it really reached the hard cases (`test_twin.py:233-241`). For example, the duress PIN must hide a running alert in more than 50 runs (`test_twin.py:241`). It did so in 116 of 500.

#### Q: How is the duress PIN different from a wrong PIN?
Both leave the user's alert running in secret. They differ in four ways:
- The phone shows a filled check for the duress PIN (`ended_true`), the same as the right PIN. A wrong PIN shows "Incorrect PIN, try again" first, then an outlined check (`ended_fake`).
- The duress PIN starts a new silent alert to the private duress contacts (`loop.py:305`). A wrong PIN alerts nobody new.
- A second wrong PIN sends `wrong_pin_warning` to the alerted contacts. The duress PIN sends no warning. The duress contacts get a new alert instead.
- The duress PIN never counts as a wrong PIN (`loop.py:275-276`). Test: `test_duress_pin_is_not_a_wrong_pin` (`test_loop.py:1290`).

The wrong PIN rule still protects a user who does not type the duress PIN. See `PLAN.md` decisions 3 and 12.

#### Q: Can someone watching tell the duress PIN from the real one?
Not from the phone, the friends' screens or the server answer. The front runs the same code for both (`loop.py:308-312` against `loop.py:285-287`). The bridge does not record a check-in on Resolve, so `lastCheckIn` stays the same (`bridge.py:103-104`). `test_twin.py` compares the user's view and effects after every step. It does this from all 8 front states (`test_twin.py:431`) and in 500 random runs. The HTTP twin test compares status, body and length of every answer, and what every friend sees (`test_bridge.py:707`). Limit: the person who watches the hands sees which digits are typed.

#### Q: Walk me through one request from the phone to the state machine.
Use trace 4.5. The phone side is `check-in-card.tsx:136`, `safekeeps.tsx:147`, `demo-api.ts:58`. The server side is `bridge.py:90`, token at `safekeeps.py:51`, `apply_event` at `app.py:358`. Then `run` at `app.py:127`, `step` at `loop.py:475`, `_on_duress` at `loop.py:267`. Every entry point (phone, panel, ticker) ends in the same `run()`.

#### Q: How does the clock skip work without breaking the logic?
There is one `offset` and one `now()` (`app.py:43-47`). `/demo/skip` adds to it and ticks every night at once (`app.py:436-444`). The loop never reads the clock, so nothing else changes. The phone follows through `serverOffset` (`safekeeps.tsx:41`).

#### Q: Why are there two storages, SQLite and a pickle file?
SQLite holds the teammate's long-lived profiles and friends (`safekeeps.py:18-48`). The live nights are Python objects in memory, and the pickle file is only a crash copy of them (`app.py:155`). Reset clears nights but keeps profiles (`app.py:447-456`).

#### Q: How is the demo panel protected?
With `KAZE_DEMO_KEY` set, the data routes need the `X-Demo-Key` header, compared in constant time (`app.py:425-430`). The key never goes in the URL (`test_panel.py:32`). Limit: one shared secret, no rate limit. Without the key the routes are open, the server logs a warning (`app.py:198-199`) and the panel shows a red banner.

#### Q: Why does the app say Homebound but the code says safekeeps and KAZE?
The team renamed the app late. The visible name is Homebound: the home screen, the notifications, the permission texts and the ntfy message (`app.json:13`, `index.tsx:70`, `app.py:98`). The folder names, the Python package and some internal strings keep the old names. A rename touches every import and adds no feature.

#### Q: Why the `safekeeps/safekeeps/` folder?
A leftover copy of the Expo starter template from the teammate's first app commit (7043337 "setup"). Nothing uses it (`PLAN.md:191`). `tsconfig.json` maps `@/*` to `./src/*`.

## 8. If you get stuck

1. Open `server/kaze/loop.py` at `step` (line 475) and follow the handler for that event in `_HANDLERS` (line 460).
2. Run the server tests: `cd ~/Desktop/kaze/server && SAFEKEEPS_DB=/tmp/kz-tour.sqlite3 ~/Desktop/kaze/server/.venv/bin/pytest -q .` and say "305 pass in about 3 seconds".
3. Run one scenario by name: add `-k test_3_duress` (or any scenario name from section 6) to the same command.
4. Show the panel at `/panel`: the hidden alert row and the privacy table come from the same `view_for` the phones use (`panel.py:34-50`).
5. Say "I do not know that detail, but here is where it lives". Then open the file from section 5 and read the comment above the function.
