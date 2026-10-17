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
- [x] 2.1, 2.3, 2.4 Safekeeps app screens, built on branch `checkin-screens` while the teammate slept. Waiting for her review in the pull request. Tested in a web browser with two tabs. The app was installed on one iPhone 15 Pro. The rest is untested on phones.
- [x] 2.5 Triggers: periodic, "ask a friend" and "be home by" work. Home-by: server `home_by` plus an optional field in Start a night. Tested in automated tests only (server tests, `home-by.test.ts`), not on a phone.
- [x] 2.6 Push to alerted contacts through ntfy: `KAZE_NTFY_URL` and `KAZE_NTFY_SECRET`, `GET /safekeeps/push`, a block in Settings. Off by default. Tested with a faked sender only. Real phone delivery is untested.
- [x] 3.1 Demo panel (`server/kaze/panel.py`, `server/panel/index.html`, `server/tests/test_panel.py`). Not yet tried on real phones.
- [x] 4.1 to 4.2 Find them: server ping on `main`, app on branch `find-them` (pull request into `checkin-screens`). Tested in a web browser with a faked location. The compass arrow, real GPS, and the ping sound need a phone. See decisions 10 and 11.
- [x] 5.1 iPhone Release build works (iPhone 15 Pro).
- [x] 5.2 Band firmware. The gestures, ask and ping were tested in nRF Connect. The heartbeat (0x03 every 20 s while connected) and advertising again on connect compile but are not tested on the board.
- [x] 5.3 Band relay in the app, on branch `band`: pair in Settings, band ok and duress go to the server through one code path, the app writes `ask` and `ping`, iOS background mode and state restoration, and the heartbeat wakes the app to check the server. Unit tests pass. Tested on hardware on 2026-10-17 (`home-by` build): pairing, ok and duress, ask, ping, heartbeat (about 12 s), state restoration, advertising while connected.
- [x] 5.4 Hotter and colder on Find them, on branch `band`. Unit tests pass. The two-person test showed that the three zones were not accurate past 1 m. Replaced by two states in 6.13.
- [x] 6.x Judging fixes, on branch `judging` (see the judging review). All done in automated tests only: 246 server tests and 57 app node tests pass, with type check and lint clean. Nothing in this list was run on a phone, in a browser, or on the band.
  - [x] 6.1 Response cards: every card has three new "do" lines and two new "do not" lines about staying with the person (see `server/kaze/cards.py`). No diagnosis words.
  - [x] 6.2 Ack hold: an "I'm on it" holds the alert for `ack_hold_seconds` (120 s demo). If the alert is not resolved by then, it goes back out with `stale_ack_by`, and the contact gets `ack_stale`. Alert fields only, so the watcher test stays green.
  - [x] 6.3 Coercion holes: Leave is refused while asking or waiting. An okay or duress while armed no longer moves the next check later. After any end screen from a PIN, more wrong PINs show the end screen again and tell nobody.
  - [x] 6.4 Location time: `location_at` on every location, shown as "Location updated N min ago" on the alert card and Find them.
  - [x] 6.5 Re-alert backoff (60, 120, 300 s) and a simulated final step flag on the alert and the panel.
  - [x] 6.6 Ticker: one broken night cannot stop the others (`tick_all`, also used by `/demo/skip`).
  - [x] 6.7 Saved state: the server pickles its state to `KAZE_STATE` (default `server/kaze_state.pickle`) every second and at shutdown, and loads it at start. Tested through the test client only, not with a real server restart.
  - [x] 6.8 App:
    - Leave is hidden during a check, and asks once more on the armed screen.
    - Start a night has "Night ends at" and "Who sees your location during an alert".
    - Intervals go from 5 min to 2 hours. The default is 15 min.
    - The dead "Alert emergency contacts" button is gone.
    - The alert card shows the stale "I'm on it" line and the final step line.
  - [x] 6.9 Band relay: asks the band again at the louder stage, and keeps band answers that fail in SecureStore to retry them later.
  - [x] 6.10 Firmware: `QUIET_MODE = false`, answers kept while no phone is connected, the answer is notify only with a 0 after each answer. Compiles, not tested on the board.
  - [x] 6.11 Docs:
    - DEMO_SCRIPT: a third person as tier 2, the demo timers, and the new beats.
    - DEMO_NOTES: the brief's four groups, with a hardware results table.
    - New `VALIDATION.md`, and the env vars in README.
- [x] 6.12 Duress PIN (decision 12). Tested in automated tests only, not on a phone or the band.
  - Server: `Config.duress_pin`, and `_raise_duress`, which the Duress gesture also uses. Then `_on_duress_pin` in `loop.py`, and the 400 check in `begin_night`.
  - API.md section 6 has "The duress PIN".
  - App: "Duress PIN" and "Repeat duress PIN" in Start a night. Live hints: "The PINs do not match" and "Use a different PIN from your normal PIN".
  - Tests: the twin test (random runs and all 8 front states), the HTTP twin, scenario 3, and the loop tests.
- [x] 6.13 Fixes from the two-person hardware retest (2026-10-17). Tested in automated tests only, not on a phone or the band:
  - Find them: the three zones and Warmer or Colder are gone. Two states with hysteresis (`nextNear`, -60 dBm enter, -68 dBm leave). A new line under Ping: "Bluetooth can only tell when you are right beside them. Use Ping to hear them."
  - Band relay: a 404 (no night) drops a band answer and does not retry it. With no night running, Home says "Band connected. Start a night to use it."
  - Server 273 tests and app 57 node tests pass, with type check and lint clean.

## Handoff: start here (2026-10-17, evening)

A new session continues from this section. Read it first, then the Status list above.

Branch `ntfy` (newest work, 2026-10-17 evening):
- Worktree `~/Desktop/kaze-ntfy`, made from `judging`. Commit `ea1e5ab` adds the ntfy push (task 2.6). Not pushed, no pull request yet. 300 server tests and 57 app node tests pass.
- One live push to ntfy.sh worked from a scratch server. Delivery to a real phone is not tested.
- Retest of 6.12 and 6.13 over HTTP on a scratch server: the duress PIN and the duress gesture pass in all five front states. The phone gets the same answer as for the real PIN or an ok.
- The Find them simulation is stable at 4 or more readings a second. Open bugs, not fixed:
  - One reading can enter "right next to them" (`band.ts:71`).
  - A failed Bluetooth scan never restarts (`use-band-signal.ts:28`).
  - `HARDWARE.md:111-113` describes the 30 s separation rule as built. It is not built.
- Open design question for the user: after an end, PIN guesses are unlimited. The filled or outlined check shows which PIN is real, and the real PIN ends a duress alert (`loop.py:281`).
- An LLM council graded the project at about 60 of 100. Its top must-haves:
  1. Run everything from one checkout.
  2. Retest duress on the phones.
  3. Remove false lines from DEMO_SCRIPT (`:97` contact ranking, `:83`, `:193`) and from DEMO_NOTES (`:7` test count).
  4. Disclose the limits.
  5. Try ntfy on a real phone.
  6. Make a 5-minute demo story.
  7. Make three slides.
  8. Record a backup video.

Judging branch:
- Worktree `~/Desktop/kaze-judge`, branch `judging`. It holds the 6.x items above, all committed (6.12 in `de2aedf`, 6.13 in `a100f73`). Pull request #8 (`judging` into `main`) is open. `judging` also has the teammate's UI overhaul from `main` (`9f13b4e`). It also has the pixel home sprites (`348c740`) and the check mark fix (`a75e86b`).
- Checked on 2026-10-17, evening: 291 server tests and 57 app node tests pass on `judging`, and `tsc` is clean.
- The demo processes run from `kaze-judge`: the server on port 8000 (with `SAFEKEEPS_DB=~/Desktop/kaze-app/server/safekeeps.sqlite3`), its tunnel, and the web app on port 8090 with its own tunnel. The logs are in `/private/tmp/claude-501/kz/`.
- Two-person retest on 2026-10-17 (two iPhones and the band): most of the judging build worked. Not tested: scaled alerts (the hand-off to tier 2). Two problems, both fixed in code (6.12, 6.13) and waiting for a retest:
  - Find them was not accurate. Walking away sometimes showed a closer state.
  - The duress PIN did nothing, on the phone ("Cancel an alert") or from the band. The build had no duress PIN. The band gesture may also have been made during the user's own alert: the server ignored the duress gesture in escalating and acknowledged. Fixed: the gesture now starts the duress alert in every front state. A band paired with no night running also gets its answers refused (Home now says so).
- Hardware test on 2026-10-17 (branch `home-by` build and firmware): pairing, band ok and duress, ask, ping, heartbeat (about 12 s), state restoration and advertising while connected all pass. Results are in `DEMO_NOTES.md`. Still to test:
  - the two-state band signal on Find them
  - the duress PIN on a phone
  - scaled alerts with three people
  - battery drain
  - the latest firmware and app from `judging`
- Ideas from the judging review that are not done:
  - Push to contacts through ntfy. The user asked for it on 2026-10-17, evening. Plan first, then build.
  - Slides.
  - Rewrite DEMO_SCRIPT as a 5-minute story.
  - A duress practice card on Start a night.
  - A buzz and sound on the contact's phone for a new alert.
  - The hallway gesture test with other hackers (the user's job).

Where the code is:
- Pull requests #1 and #7 are merged into `main`. So `main` has the whole branch chain and the teammate's UI overhaul. #2, #3, #4 and #6 are closed because their work arrived through #7. Open: #8 (`judging`) and #5 (`ui-fresh`, rejected option B, closing it is the user's call).
- Test counts: `judging` has 291 server tests (`cd server && ~/Desktop/kaze/server/.venv/bin/pytest -q`) and 57 app node tests (`cd safekeeps && node --test src/services/*.test.ts`).
- The paragraphs below describe the older branch chain. They stay for history.
- Branch `checkin-screens` has the teammate's app with tasks 2.1, 2.3, 2.4 added, plus `main` merged in. Pull request #1 (https://github.com/Mystanile/htvaura/pull/1) is open and waits for the teammate's review. Do not merge it without the user.
- Branch `find-them` (pull request #2, into `checkin-screens`) adds find them and ping.
- Branch `test-fixes` (pull request #3, into `find-them`) fixes the first phone test: Find them hides the arrow below about 30 m because indoor GPS is off by 20 to 50 m, "Open in Maps" is a picker (Apple Maps, Google Maps, Waze), and you can rename a friend who added you (`POST /safekeeps/friends/{friend_id}/name`). 214 server tests pass.
- Two redesigns were compared, both from `test-fixes`, both with a real dark theme and labeled inputs, both without new native packages:
  - Option A, chosen: `ui-refine` (pull request #4, into `test-fixes`, worktree `~/Desktop/kaze-refine`) keeps the teammate's brand: her greens, Righteous, her wording. The user picked this one.
  - Option B, rejected: `ui-fresh` (pull request #5, worktree `~/Desktop/kaze-fresh`) is a new look: slate and cobalt, Figtree. The pull request is still open. Closing it is the user's call.
- Branch `band` (pull request #6, into `ui-refine`, phase 5) adds the band relay in the app, the heartbeat wake, and hotter and colder on Find them.
- Branch `home-by` (pull request #7, into `band`, task 2.5) adds the "be home by" check. It is the newest branch and has everything.
- The merge order is #1, #2, #3, #4, #6, #7. Each pull request targets the branch before it.
- `~/Desktop/kaze-band` is the git worktree on `home-by`. Run the newest code from there. It has no `.venv`, so start the server with `~/Desktop/kaze/server/.venv/bin/uvicorn`. After the pull requests are merged, the main folder becomes the place to run the newest code.
- `~/Desktop/kaze-app` is an older git worktree on `test-fixes`. Do not run the newest code from it. Each worktree needs `safekeeps/expo-env.d.ts` (ignored by git, made by Expo) for `tsc`. Copy it from another worktree if it is missing.
- The user changed `Hardware/kaze_band/kaze_band.ino` (debounce) and left it uncommitted in the main folder `~/Desktop/kaze`. That change is already in `band`. Before merging, discard the main-folder copy with `git checkout -- Hardware/kaze_band/kaze_band.ino` there. Do not commit or touch it until then.

How the demo runs (these processes die when the session that started them ends, so check and restart them):
1. Server: `cd ~/Desktop/kaze-band/server && KAZE_DEMO_KEY=<pick one> ~/Desktop/kaze/server/.venv/bin/uvicorn kaze.app:app --host 0.0.0.0 --port 8000`. The key protects `/panel` data and `/demo/*` through the `X-Demo-Key` header. The user knows the current key. Never commit it.
2. Tunnel, because the venue Wi-Fi blocks phone-to-laptop traffic (checked: Safari on a phone could not reach the laptop): `cloudflared tunnel --url http://localhost:8000`. The address changes on every start, so the phones and the panel need the new one.
3. App. The app now needs a native build (`react-native-ble-plx`, `expo-location`, `expo-audio`), so Expo Go cannot run the band features. Two ways:
   - Web version: `cd ~/Desktop/kaze-band/safekeeps && EXPO_PUBLIC_API_URL=<tunnel address> npx expo start`, press `w`, and use two tabs as two phones. It works for everything except Bluetooth.
   - iPhone Release build: see "iPhone build" below.
4. Panel: `<tunnel address>/panel`, then type the key.

Rules from the user for this repo:
- No "Co-Authored-By: Claude" line in commits and no Claude line in pull requests. The user wants to be the only contributor.
- The teammate owns `safekeeps/`. Preserve her design. Change her app only on a branch with a pull request, and only when the user asks.
- Open question, not decided: rewriting `main` to remove the old Claude co-author lines needs a force push. Do not do it unless the user asks again.

The app was installed on one iPhone 15 Pro. The rest is untested on phones: vibration, real taps, the panel with real phones, and everything with the band. The list is in `DEMO_NOTES.md`, under "Needs manual testing".

iPhone build (task 5.1, works on 2026-10-17 on one iPhone 15 Pro):
- One time on the Mac: Xcode signed in with an Apple ID, `brew install cocoapods`. The Signing team is set in Xcode (Personal Team). The bundle id is `com.mystanile.safekeeps` in `safekeeps/app.json`.
- One time per phone: plug in, Trust This Computer, turn on Developer Mode (Settings, Privacy & Security), and after the first install trust the developer (Settings, General, VPN & Device Management).
- Build and install: `cd ~/Desktop/kaze-band/safekeeps && CI=1 EXPO_PUBLIC_API_URL=<tunnel address> npx expo run:ios --device <UDID> --configuration Release --no-bundler`. Get the UDID from `xcrun devicectl list devices`. Release mode puts the JavaScript inside the app, because the venue Wi-Fi blocks the phone from the Mac. Every code change needs a rebuild. If the tunnel address changes, enter the new one in the app's Settings under Connection, no rebuild needed.
- `ios/` is generated and ignored by git. If `npx expo prebuild` runs again, it rewrites the `ios` and `android` npm scripts in `package.json`. Put them back.
- A free Apple ID install expires after 7 days.

Next steps, in order:
0. The newest code is on branch `home-by` (worktree `~/Desktop/kaze-band`). The user picked option A (`ui-refine`). Hold off on color changes: the teammate is redoing the palette. In order:
   - First (6.12 and 6.13 are committed): build `judging` onto both iPhones. Retest with a night running:
     - The duress PIN from "Cancel an alert". The duress contact gets the alert, and the phone shows the filled check.
     - The band duress gesture.
     - The two-state band signal on Find them.
     - Scaled alerts (the tier 2 hand-off) with a third person.
   - The user runs the full hardware test: build `home-by` onto the iPhone 15 Pro, flash the band, and run the list in DEMO_NOTES "Needs manual testing". The friend's phone needs a Release build for hotter and colder, so it needs a cable. The demo script is `DEMO_SCRIPT.md`.
   - Then fix what breaks.
   - Then merge the chain in order: #1, #2, #3, #4, #6, #7. Before merging, discard the main-folder copy of `kaze_band.ino` (see "Where the code is").
   - Closing #5 is the user's call.
0b. Done: the user picked `ui-refine`. Earlier step: install `ui-refine` and `ui-fresh` on the iPhone 15 Pro one at a time (same bundle id, so each install replaces the other) with the build command in "iPhone build", run from `~/Desktop/kaze-refine/safekeeps` or `~/Desktop/kaze-fresh/safekeeps`. The user compares them and picks one.
1. Done: phase 4, find them. The app side waits for the teammate's review in its pull request, and its phone test waits for the Xcode build.
2. Phase 5 on the user's Mac: 5.1 works on one iPhone (see "iPhone build" above). Install it on the second iPhone the same way. This is also when the app gets its first real-phone test (gestures, vibration, find them). Then the band relay in the app (5.3), then RSSI hotter and colder (5.4). The spec is `Hardware/kaze_band/HARDWARE.md`.
3. (was step 1) Fix what breaks on the real phones.
4. Before judging: keep `README.md` and `DEMO_NOTES.md` up to date. DEMO_NOTES uses the brief's four groups now.

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
3. Wrong PIN. The first wrong PIN is a silent retry: the screen shows a normal "Incorrect PIN, try again", nothing changes on the server, and no one is told. From the second wrong attempt on, the screen says "Alert ended". A person watching cannot tell. Contacts see "Someone tried to cancel with a wrong PIN." A small cue that only the user knows shows the truth. Correct PIN: filled check mark. Wrong PIN: outlined check mark, and the alert keeps going. After any end screen (the fake end or a real end), every later wrong PIN shows "Alert ended" with the outlined check again and tells nobody, until the next check starts. So a person who forces more guesses learns nothing. The right PIN, or a contact, still ends a hidden alert.
4. Ending duress. The user (correct PIN) or one of the duress contacts can end it.
5. Ranked tiers. The user ranks who gets alerted. Each tier is a list of people. If no one in a tier taps "I'm on it" in time, the next tier gets alerted. Modes are only presets of tiers:
   - Night out: tier 1 one chosen friend, tier 2 the whole group, tier 3 the sober contact who is not at the event.
   - Everyday: tier 1 contact A, tier 2 contact B.
6. Duress contacts are a separate private list. Duress never goes to the group.
7. Team phones are all iPhones. The app needs a native build from Xcode on a Mac for Bluetooth, location and sound (phase 5). The web version works for everything except Bluetooth. Expo Go cannot run the band features.
8. Band hardware (phase 5): Arduino Uno R4 WiFi with ArduinoBLE, one Grove button, one Grove touch sensor, a Grove buzzer, and an LED. The button and the touch sensor use the same gestures as the app (decision 1). Ping plays the buzzer and blinks the LED. The full spec is in `Hardware/kaze_band/HARDWARE.md`: pins, BLE UUIDs, event bytes, ask and ping behavior, and RSSI measured at the venue.
9. Removing a friend during a night (decided 2026-10-17). Contacts are fixed when the night starts. If the user removes a friend while a night is running, the removal applies from the next night. For the rest of the current night, the removed friend still gets alerts, location, ack, and resolve exactly as before. Reason: if removal applied at once, a person holding the phone could remove contacts to cancel a hidden alert, and every workaround for that created a new tell. Cost: a friend removed mid-night can still see that night's alerts and location until the night ends. Exception: a hidden alert (duress or fake end) carries into the next night with its contacts, so a removed friend keeps it, with live location, until it is resolved. Test: `test_a_hidden_alert_carries_into_the_next_night_for_a_removed_friend`.

10. Location during a night (decided 2026-10-17). While a night runs and the app is open, the phone sends its GPS location to the server about every 30 s. The server shows it to contacts only during an active alert (`view_for`), and clears it when the alert ends. Reason: the phone never knows a duress alert is running, so this is the only way duress contacts get a location.
11. Ping only for visible alerts (decided 2026-10-17). A contact can ping the person's phone (loud sound and flash) only through the user's visible front alert, never a hidden one. A ringing phone would expose a duress alert to the person watching.
12. Duress PIN (decided 2026-10-17). The user sets a second 4-digit PIN at setup, different from the cancel PIN. The user types it in the same PIN box. The phone shows exactly what the right PIN shows: "Alert ended" with the filled check. In secret, a duress alert starts with the front location, exactly as after the duress gesture. Nothing is resolved. The user's own alert, if one runs, becomes hidden and keeps escalating. This is like a fake end, but no contact gets `wrong_pin_warning`. It never counts as a wrong PIN. The right PIN still ends every alert later.
   - Reason: the KAZE brief gives this as an example of a duress mechanism. It is a code that appears to cancel an alert while it silently asks for help.
   - How it relates to decision 3: both hide an alert from the watcher. Decision 3 stays. It protects a user who types a wrong PIN, by accident or on purpose, and its screens do not change. The duress PIN is the planned way. It gives the filled check and a new alert to the duress contacts.
   - Tests: `test_twin.py` compares the duress PIN with the right PIN, in random runs and from all 8 front states. Also the HTTP twin in `test_bridge.py`, and `test_3_duress_pin_looks_like_a_real_cancel_but_alerts_the_duress_contacts`.

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
safekeeps/            Expo (React Native) app, native iPhone build or web (teammate)
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
    duress_pin: str | None = None   # decision 12. Must differ from pin
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

Events are dataclasses: `Trigger(kind)` with kind in home_by, separation, periodic, manual. `ConfirmOk()`, `Duress()`, `Tick()`, `Ack(contact_id)`, `Ping(contact_id)`, `Resolve(by, pin=None)`, `Disconnect()`, `Reconnect()`, `LocationUpdate(lat, lng)`, `Leave()`.

User screens: `armed`, `asking`, `alarm`, `alert_active`, `thanks`, `pin_retry`, `ended_true`, `ended_fake`.

Effect kinds:
- To the user: `check` {kind, deadline}, `alarm` {deadline}, `screen` {screen}, `ping` {at}.
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
  - Duress PIN (decision 12), checked first. The front does exactly what the correct PIN does, so the user gets `ended_true`. Before that, a duress alert starts as for Duress. Nothing is resolved. A front alert becomes hidden and keeps escalating, with no warning. wrong_pins does not change. In ended, the user gets nothing, but the duress alert still starts.
- On the next Tick, resolved goes to armed. It does not change `screen`. Armed or resolved goes to ended on a Tick after night_ends_at, and `left` goes to every group member. An active alert never ends because of the night end time.
- Leave in armed, asking, waiting, or resolved goes to ended and sends `left` to every group member. In escalating or acknowledged it is ignored, so the user must cancel with the PIN first. In ended it is ignored.

Alert rules. Contacts act on alerts and never on the front.
- Duress in armed, asking, or waiting makes the front do exactly what ConfirmOk does, so the user gets the same single `screen` thanks effect. It also starts a new hidden alert of kind duress. It does not start one if an unacknowledged duress alert for the same duress contacts is already active. An acknowledged one does not block it. That alert alerts duress contact 1 only. It never sends anything to a group member who is not in duress_contacts. In escalating, acknowledged, or ended the front does nothing, exactly as for ConfirmOk, but the hidden duress alert still starts (fixed 2026-10-17: before, the gesture did nothing during the user's own alert).
- Tick runs every alert's ack timer on its own. It does so after the front ended or left. After the last tier, every contact in every tier (or every duress contact) is re-alerted and the ack timer restarts.
- A contact acts on one alert at a time, the one on their screen. That is a duress alert first, else the newest. An alert that another contact already took comes last. `view_for`, Ack, and Resolve all pick the alert the same way. A contact who is alerted by two alerts never ends one by acting on the other.
- Ack from a contact applies to the alert that alerted this contact and has no acknowledger yet. A normal alert goes to acknowledged, clears its deadline, and sends `owner` to the other alerted contacts. A duress alert sets acknowledged_by, clears its deadline, sends `owner`, and its state stays duress. If the alert is the front alert, the front goes to acknowledged. Ack from a contact who was not alerted is ignored. If this contact was also alerted by the front alert and it has no acknowledger yet, the same Ack takes the front alert too. So a contact in both the tiers and `duress_contacts` gives the same front result as for an honest user. Two hidden alerts still need one Ack each.
- Resolve with `by` equal to a contact applies to the alert on that contact's screen, if that contact is allowed. For a normal alert only its acknowledged_by contact is allowed. For a duress alert any contact in duress_contacts is allowed. A duress contact who has no alert on their screen yet may still end an active duress alert. `by=None` is always ignored. Anything else is ignored with no effects. The alert becomes resolved, its alerted contacts get `resolved`, and the alert forgets its location. If this contact may also end the front alert (they are its acknowledger), that alert ends in the same step.
- Location. The front keeps one position, set by LocationUpdate. It is cleared whenever the front ends (correct PIN, 2nd wrong PIN, the acknowledger resolves the front alert, Leave, or the night's end time). A location update that arrives after the front has ended does not set it again. It is not carried to a new night. Each alert also keeps its own position, set when it starts and updated by LocationUpdate. A contact sees the position of the alert on their screen. So a hidden alert never changes the position that a front alert shows, and ending a hidden alert never clears it.
- Resolving a hidden alert sends nothing to the user and does not touch the front. Resolving the front alert by its acknowledger also resolves the front. The user gets `screen` `ended_true` and wrong_pins is reset.
- Ping (decision 11) from a contact counts only on the visible front alert. The front must be escalating or acknowledged, the front alert must not be hidden, the contact must be in its `alerted` list, and its `acknowledged_by` must be None or that contact. Then `Session.ping_at` is set to `now` and the user gets one `ping` effect {at: now}. Otherwise it is ignored with no effects. A hidden alert (duress or fake-ended) and a duress-only contact can never ping. `ping_at` is cleared when the front ends. It is a front field, so a hidden-alert user and an honest twin stay identical.
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
- For the user: `{"state", "screen", "deadline", "ping_at"}`. The state is the front state, and resolved shows armed. Deadline is only shown in asking and waiting. After the duress gesture, the user gets exactly the same dict as a user who tapped ok. The word "duress" never appears in the user's view.
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
| escalating / acknowledged / ended | duress gesture | same state (same as tap ok, which does nothing here) | user sees no change. A hidden duress alert starts, as above. The user's own alert keeps going. |
| escalating | contact taps "I'm on it" | acknowledged | others told who owns it, location shared per settings |
| escalating / acknowledged | correct PIN, or acknowledging contact resolves | resolved | everyone in the alert told "resolved", location sharing stops |
| escalating / acknowledged | 1st wrong PIN | same state | user sees "Incorrect PIN, try again", no one told |
| escalating / acknowledged | 2nd+ wrong PIN | resolved | user sees fake "Alert ended" (outlined check). The alert becomes hidden and keeps escalating. Contacts warned. |
| armed / asking / waiting | correct PIN | same state | user sees "Alert ended" (filled check). Hidden alerts raised under that PIN are resolved. |
| armed / asking / waiting | 1st or 2nd+ wrong PIN | same state | the same screens as above, so nothing tells the user's case apart |
| any but ended | duress PIN | as for the correct PIN | user sees "Alert ended" (filled check). A hidden duress alert starts. Nothing is resolved. A running front alert becomes hidden and keeps escalating. |
| ended | duress PIN | ended | user sees nothing. A hidden duress alert starts. |
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

Phase 2: app and bridge

A teammate owns `safekeeps/` and tasks 2.1 to 2.5. Do not edit anything in `safekeeps/`. She builds against the "Safekeeps bridge" section of `API.md`. Her app polls the server. It does not use WebSockets.

- 2.0 (me) Bridge: authenticated endpoints under `/safekeeps` that use her tokens and friends list to drive the loop. Periodic check-ins move into the loop (`Config.check_every_seconds`). Her "ask a friend to check in" becomes `Trigger("manual")` on the friend's session. ConfirmOk and Duress both record a normal check-in in her SQLite data, so duress leaves no trace there.

- 2.1 (teammate) Night setup screen: PIN, rank friends into tiers, pick duress contacts, check-in interval. It calls `POST /safekeeps/night`.
- 2.2 (teammate) Groups: her friend codes cover this. Nothing new.
- 2.3 (teammate) Check-in screen from `view.state` and `view.screen`: the gestures from decision 1, countdown, "Thanks!", PIN cancel with filled vs outlined check.
- 2.4 (teammate) Responder screen from the `alerts` list: response card, "I'm on it", resolve.
- 2.5 (teammate) Triggers: periodic now runs on the server. "Ask a friend" is the manual trigger. Home-by time is done (a `home_by` server time on the night). Separation comes from the demo panel only.

Phase 3: demo panel (`/panel` served by FastAPI)
- 3.1 Done. A one-file web page at `/panel`. It polls `GET /demo/state` every second and shows every night: front state, screen, countdown, connected badge, next periodic check, location, and every alert (hidden ones too, marked). Each night has buttons for Trigger (manual, periodic, separation, home_by), Disconnect or Reconnect, and a sample location. The night card shows the last ping time. The top bar has skip buttons (+15 s, +30 s, +60 s, +15 min) and a reset with an in-page confirm. A privacy table per night shows what `view_for` gives each person. A scenario guide lists the 7 KAZE scenarios as steps. Endpoints: `GET /panel`, `GET /demo/state`, `POST /demo/event` (Trigger, Disconnect, Reconnect, LocationUpdate for any session, Safekeeps ones too), `POST /demo/skip`, `POST /demo/reset`. If `KAZE_DEMO_KEY` is set, the four data routes need it as the header `X-Demo-Key` (not in the URL, so it stays out of logs). The page asks for the key. Safekeeps nights count as connected, since phones poll. `POST /safekeeps/night` takes `share_location_with`. Reset leaves the Safekeeps SQLite profiles alone. "Contact ignores" needs no button: nobody taps "I'm on it" and time skips ahead. "Separate friend" is Trigger "separation".

Phase 4: find them
- 4.1 During an active alert, the acknowledging friend sees a GPS arrow (expo-location position + heading) and distance.
- 4.2 "Ping" button: the person's phone plays a loud sound and flashes. Server side is done: `POST /safekeeps/alerts/{owner_id}/ping`, `Ping` in the loop, `ping_at` in the user's view (decision 11). The app side is on branch `find-them`: the Find screen with the Ping button, the sound and flash, and the 30 s `LocationUpdate` sender (decision 10). A browser run checked the Find screen, the Ping button rules, and the flash, with the location faked in the page. The compass, real GPS, and the sound need a phone. The button is hidden when another friend has the alert.

Phase 5: BLE band (only after phases 1 to 4 work)

The app is the product and works on any phone without a band. The band is an extra way to answer the same check-in. The owner's phone, running the teammate's app, sits between the band and the server. The spec is `Hardware/kaze_band/HARDWARE.md`.

- 5.1 Development build of the teammate's app with `react-native-ble-plx`. Expo Go has no Bluetooth. The builds run on the user's Mac (done: Xcode 27.1, CocoaPods, and Personal Team signing). Do one test build of the current app on one iPhone early, before any BLE code.
- 5.2 Done: `Hardware/kaze_band/kaze_band.ino`. Service `7f1a0001-...`, `event` notify (0x01 ok, 0x02 duress), `ping` write, `ask` write. Tested in nRF Connect.
- 5.3 The app subscribes to `event` and forwards 0x01 as ConfirmOk and 0x02 as Duress to `/safekeeps/night/events`. When the user's view goes to `asking`, the app writes to `ask`. The band never reports silence, so the server timer handles a missed or dead band.
- 5.4 Find them: the finder's phone scans the band and shows two states from HARDWARE.md. It uses the median of the last 4 s. A median stronger than -60 dBm shows "You're right next to them". Only a median weaker than -68 dBm ends it. Otherwise the screen shows "Their band is in range". This changed in 6.13. The first version had three zones and Warmer or Colder. They were not accurate past 1 m. "Ping" writes to the band. Separation means the band's signal is lost for 30 s or more, not an RSSI cutoff.

## Simulated or assumed (start of DEMO_NOTES.md)

- Simulated: group separation, the passage of time (skip button), contacts who do not respond, phone disconnects, the band (the phone acts as the band).
- Assumed: the band uses BLE only in the demo. On the Uno R4 WiFi, BLE and Wi-Fi share one radio chip, so a direct band-to-server Wi-Fi path is not built. Some path from the band to the server always exists (own phone, friend's phone relay, or home Wi-Fi). iOS background limits allow the check-in to reach the user. GPS is good to 5 to 10 m outdoors only.
- Not built: real SMS or calls, relay through friends' phones, encrypted relay payload, UWB precision finding.

## Hosting for the demo

The server runs on a laptop. If the venue Wi-Fi blocks phone-to-laptop traffic, a `cloudflared` tunnel gives the phones a public URL.

## Verification

- `cd server && pytest` runs the 7 scenarios and the loop tests. All must pass before each commit.
- Phase 1: start uvicorn, connect two WebSocket clients with a small script, and watch scenario 2 happen live.
- Phase 2 to 4: manual test on real iPhones with the Release build. Each scenario is listed in `DEMO_NOTES.md` with how to trigger it from the panel. Real phones, BLE, and the Arduino band cannot be tested automatically. They are listed as manual tests.
