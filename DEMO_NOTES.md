# Demo notes

This file sorts the prototype into the four groups that the KAZE brief asks for. We update it as we build. The studies and the path to a real product are in `VALIDATION.md`.

## What the prototype actually demonstrates

These items run in the prototype and pass automated tests: 305 server tests and 64 app node tests.

On real hardware (iPhone 15 Pro Release build and the Uno R4 WiFi band, firmware and app from branch `home-by`, 2026-10-17):

- Pairing the band in Settings, and "Band connected" on Home.
- Band ok (3 taps) reaches the server. The band duress gesture (hold 1 s, 2 taps) is not passed yet. In the two-person retest the duress contact got nothing. The likely causes are fixed and pass over HTTP in every state. The retest on phones is pending (see "Hardware test results").
- A check makes the band ask. A friend's Ping makes the phone ring and the band flash.
- Heartbeat: with the phone screen off, the band asked about 12 s after a check started.
- State restoration: the app was stopped from the Mac. iOS relaunched it in the background about 12 s later with nobody touching the phone, and a band answer reached the server with the screen off.
- Advertising while connected: a second phone still saw KAZE-Band in nRF Connect.
- Push through ntfy, set with `KAZE_NTFY_URL`. ntfy.sh is a third-party public server. The text says "A Homebound alert is waiting for you. Open the app." and carries no name, no location and no personal data. A locked iPhone showed it.

Two-person retest (two iPhones and the band, `judging` build, 2026-10-17): most of the build worked. Two problems came up: the band duress gesture and the Find them band signal. Both are fixed in code and wait for a retest. See "Hardware test results".

On one iPhone 13 (Release build, branch `ntfy`, friends in a web browser, 2026-10-17):

- The duress PIN, scaled alerts (tier 2 got the alert when tier 1 did not take it), and ntfy push to a locked phone.
- A local reminder for a scheduled check, and a VoiceOver check-in.
- The themed header and alert names, also on the iPhone 15 Pro.

- The check-in loop on the server: triggers, ask and grace timers, ranked tiers, acknowledgement, PIN cancel with one silent retry, duress, and privacy views. The 7 KAZE scenarios pass as automated tests.
- Timers keep running on the server after a phone disconnects (scenario 4, tested over a real WebSocket).
- The server saves its state to a file every second and at shutdown, and loads it at start. A night and a running alert come back after a restart. The test restarts the server inside the test client. On 2026-10-17 we also stopped and started the real server process several times during running nights, and the nights came back each time.
- One broken night cannot stop the server timer for the other nights (tested).
- "I'm on it" has a hold time. When the contact does not resolve the alert in that time, the alert goes back out. The next tier gets it, or every contact after the last tier. The contact who took it sees that it went back out. This works the same for a duress alert, and the user's phone never changes (tested, also in the watcher test).
- After the last tier, re-alerts come 60 s, 120 s, then 300 s apart. When the round after the third one in a row that nobody took is due, the alert gets a "final step" flag. An "I'm on it" starts the count again (tested).
- Leave is refused while a check is asking or waiting. On the phone, Leave is hidden during a check and needs one more tap on the armed screen.
- An "I'm okay" or a duress signal while no check runs shows "Thanks!" but does not move the next check later. Both take the same path, so they still look the same.
- After any end screen from a PIN, more wrong PINs show the end screen again and tell nobody. The retry screen comes back only at the next check (tested).
- Location is sent all night, about every 30 s while the app is open, and shown to contacts only during an active alert. When the alert ends, the server clears it (tested). Duress contacts get a location this way, because the phone never knows a duress alert is running.
- Each location carries its time. Contacts see "Location updated just now" or "Location updated N min ago" (server tested, app helper unit tested).
- In Start a night, the user picks "Who sees your location during an alert": "Everyone alerted" or "Only whoever says I'm on it". The user can also set an optional "Night ends at" time. The server rules are tested.
- Response cards tell contacts what to do and what not to do, with no diagnosis words (tested).
- Ping (a contact makes the person's phone ring) works only on visible alerts. It never works on a duress or fake-ended alert, because a ringing phone shows a hidden alert to a watcher. The server side is tested. The ring and flash on the phone, and the band beep, passed on hardware on 2026-10-17.
- The duress PIN. The user sets a second PIN in Start a night. Typed in the PIN box, it shows the same filled-check "Alert ended" as the right PIN. In secret it alerts the duress contacts and ends nothing. Tests compare it with the right PIN in every front state, and in the random twin test, where it is one of three hidden kinds (it hid a running alert in 116 of 500 seeds). Over HTTP they compare the status, body and length, and the friends' snapshots. Limit: a watcher who holds a tier contact's phone sees the alert stay after the duress PIN, where the right PIN would end it. The wrong-PIN fake end has the same limit. Automated tests cover all states. The phone check passed on hardware.
- Automated tests only, not on hardware:
  - the home-by checks
  - the band relay retry: an answer kept and sent later after a failed send
  - the two-state band signal on Find them

## What is simulated

- Group separation. The demo panel sends it (Trigger "separation"). Indoor GPS drifts 20 to 50 m, so we do not detect it for real.
- The passage of time. The demo panel can skip timers ahead.
- Contacts who do not respond. In the demo they do not tap.
- Phone disconnects. The panel button only marks the phone offline.
- The final step. The panel shows "Final step reached: emergency services would be contacted now (SIMULATED)" and the app shows a line of text. Nothing is called.
- All alerts. No real SMS, calls, or 911.
- A sample location. When a phone has no GPS, the panel button "Set sample location" sends one.

## What assumptions the concept relies upon

- Without push (`KAZE_NTFY_URL` unset), contacts must have the app open to notice an alert. The prototype has no SMS. Push through ntfy is optional. Without `KAZE_NTFY_URL` the server sends none. While the app is open, it polls every 2.5 s. A contact sees a new alert only at a poll.
- The timers are demo values: ask 30 s, grace 15 s, ack 20 s, ack hold 120 s. Production values are about ask 2 min, grace 1 min, ack 3 min, ack hold 10 min.
- Location is uploaded all night while a night runs, not only during an alert. The server keeps it in memory and in the state file on the laptop (`server/kaze_state.pickle`, or the path in `KAZE_STATE`). Contacts see it only during an alert.
- The server loads the state file without checks. Anyone who can write that file can run code on the server. This is fine for a laptop demo only.
- The band is a prototype dev board (Arduino UNO R4 WiFi) on a power bank. It is not wearable yet.
- Some path from the band to the server always exists: the owner's phone, a friend's phone as a relay, or home Wi-Fi.
- Only one band is near. Every band has the same name, so the band signal on Find them follows any KAZE band.
- The app is not swiped away. iOS does not relaunch an app that the user swiped away, so the band cannot wake it.
- When the phone is locked, an ask or a ping reaches the band up to 20 s late. The heartbeat wakes the app only every 20 s.
- The demo band uses BLE only. On the Uno R4 WiFi, BLE and Wi-Fi share one radio chip, so we did not build a direct band-to-server path over Wi-Fi.
- iOS background limits still let the check-in reach the user.
- On a phone alone, a scheduled check reaches the user in the background only through the local reminder. A check started by a friend or the panel reaches the user only while the app is open. Push goes to contacts only. With the band, the heartbeat wakes the app, so the check reaches a phone in a pocket. A real build sends the check through APNs.
- Time to help: in the worst case, a person becomes unable to answer just after a check. Help starts after one check interval plus the ask and grace times. With a 15 min interval and the demo timers, that is about 16 min. A shorter interval shortens it.
- A hold on the band or the screen with no taps after it counts as "I'm okay", so a cut-off gesture never looks odd. It also clears the pending check. A fumbled duress gesture sends no alert.
- PIN guesses after an end screen are not limited and tell nobody. The filled check (right PIN or duress PIN) and the outlined check (wrong PIN) are a cue for the user. A watcher who knows the cue can try PINs until the filled check shows. The design assumes the watcher does not know the cue.
- No PIN ends a duress alert, not even the real one. Only a duress contact can end it. A user who triggers duress by accident cannot cancel it. A duress contact has to resolve it. That counts as scenario 6, a false alarm resolved by an authorized contact. Until then the alert repeats, 60 s, 120 s, then every 5 min, and the duress card tells the contact not to call or text, so they check in person.
- Misuse: any contact or group member in a night can start a check with "ask a friend", with no limit on how often. If the user stays silent, the alert shares their location with the alerted contacts. A real build needs a limit and a log of who asked.
- Contacts are not asked to accept their role. They accepted a friend request, but they are not told that they are a tier contact or a duress contact.
- The two Find them band states need several readings a second. The real iOS scan rate is not measured. With one reading a second or fewer, the state can still flip at the edge.
- Screen readers: the check screens, alerts and Find them speak short lines, and ok and duress say the same words. The text colours reach 4.5:1 on every text and background pair the app draws. VoiceOver passed on an iPhone 13 on 2026-10-17 (see the results table). TalkBack on Android is not tried. Under TalkBack, a double-tap counts as one tap, so three double-taps say ok. Duress with a screen reader on is not tested.
- The outlined check after a wrong PIN uses the card line colour (about 2.9:1 on its panel), so it is visible but quiet. A watcher close by can see it too.
- GPS is accurate to 5 to 10 m outdoors only.
- Nobody can read another person's session without a token. On the Homebound app path every call has a per-user token, and the old phase 1 endpoints refuse the ids of Homebound phones. On the demo-panel path (ids from `POST /users`) there is no auth. A person who holds such a phone and knows a contact's id can read a hidden alert. `POST /demo/reset` and `POST /demo/skip` have no auth either, unless `KAZE_DEMO_KEY` is set, and they affect every night. A real build needs real auth on those.
- The demo runs through a cloudflared tunnel over HTTPS, so the event names (`ConfirmOk` and `Duress`) are encrypted on the network. Only the length of the request body differs. A real build pads the two bodies to the same size.
- When a night starts, its contacts are fixed. A friend who is removed during a night keeps seeing, acking and resolving that night's alerts, and their location, until the night ends. The removal applies from the next night. This is on purpose. If removal worked at once, a person holding the phone can cancel a hidden alert by removing the contacts. A hidden alert (duress, or after a fake end) also carries into the next night. The removed friend keeps seeing it, with the user's live location, until someone resolves it. Without that rule, remove, Leave, and a new night cancel it.
- The demo server is public through a cloudflared quick tunnel. When `KAZE_DEMO_KEY` is set, the data routes (`/demo/state`, `/demo/event`, `/demo/skip`, `/demo/reset`) need that key. The panel sends it as the `X-Demo-Key` header. The `/panel` page itself is open but holds no data. If we start the server without a key, anyone who knows the random tunnel address can use the data routes. The server logs a warning and the panel shows a red banner. A real build does not expose them.
- The demo panel is a demo tool. It shows the presenter every running night all night: hidden alerts (duress and fake-ended) and the live location of each user. It shows the location also when no alert runs. This is on purpose, so judges can see what the contacts see. The key is the only protection. A real build has no such view.

## What would require further testing or validation before real-world deployment

The studies we plan, each with a method and a target, are in `VALIDATION.md`. We have not run any of them.

### Manual tests on hardware

Automated tests cannot cover real phones, BLE, or the Arduino band.

- Band on its own (an earlier firmware was tested in nRF Connect, see `Hardware/kaze_band/HARDWARE.md`): 0x01 and 0x02 arrive over notify, ask and ping writes work, the band reconnects without a reset, and it runs from a power bank. Passed on the board with the app: 3 taps ok. Still to check on the button and the touch sensor:
  - The gestures: hold 1 s plus 2 taps duress, hold alone ok after 2.5 s, 1 or 2 taps nothing.
  - The same flash for ok and duress.
  - An unanswered ask stops after 30 s and sends nothing.
- Current firmware (the two-person retest ran it on the board). Not checked yet:
  - The buzzer is on (`QUIET_MODE = false`). The Ping beep passed on 2026-10-17. The beep after an answer is not checked.
  - An answer made while no phone is connected is kept and sent after the phone connects. The band gives the same flash and beep for ok and duress, connected or not.
  - The answer is notify only, not readable. The band sends 0 after each answer, and the app ignores it.
  - After a reconnect, the band waits until the app subscribes again before it sends a kept answer.
  - The answer and the 0 go out back to back. Nobody checked yet that both reach iOS in order.
- Band with the app. Passed on hardware on 2026-10-17 (`home-by` build and firmware): pairing, band ok, the band asking, Ping reaching the band, the heartbeat, state restoration, and advertising while connected. See "What the prototype actually demonstrates". Still untested on hardware:
  - The app asks the band again at the louder stage. The firmware starts the ask again on each write.
  - An answer from the band can fail to reach the server. Then the app keeps it and sends it later. It keeps an ok or a duress for 60 s, the same for both, so a late one cannot tell them apart and cannot answer a later check. The band keeps an answer made with no phone connected for the same 60 s. A duress that cannot be sent within 60 s is lost. The server timer still escalates silence. A server refusal is also kept and retried until it expires. Only a 404 (no night running) is dropped at once.
  - The band signal on the friend's phone: "Their band is in range", then "You're right next to them" right beside the band, and the line under Ping.
  - With no night running, Home says "Band connected. Start a night to use it."
  - The band duress gesture with a night running, during an alert and with no alert.
  - Battery drain, a reminder after a band wake, and TalkBack.

### Hardware test results

Fill this in during the hardware test. Move each pass to "What the prototype actually demonstrates". Write each fail here with its fallback (the server timer still escalates).

| Test | How | Result | Date |
|---|---|---|---|
| Ask to band delay, phone locked | 10 trials. Median and max in seconds | About 12 s (a few tries, not 10 timed trials yet) | 2026-10-17 |
| State restoration | Stop the app from the Mac, tap the band. Pass or fail | Pass. Relaunched in about 12 s, answer reached the server with the screen off | 2026-10-17 |
| Battery drain per hour, 20 s heartbeat | Phone and band battery percent per hour |  |  |
| Hotter and colder, three zones | Two iPhones and the band. Walk away and back | Fail: not accurate past 1 m. Walking away sometimes showed a closer state. Replaced by two states, retest pending | 2026-10-17 |
| Duress PIN from "Cancel an alert" | Type the duress PIN on the phone | Pass (branch `ntfy`, iPhone 13 Release build, friends in a web browser): the phone showed the same filled "Alert ended" as the real PIN, the duress contact got the alert, the tier contact saw nothing new | 2026-10-17 |
| Band duress gesture | Hold 1 s, 2 taps on the band | Fail: the duress contact got nothing. Two possible causes, both fixed: the server ignored the gesture while the user's own alert ran, and a band paired with no night gets its answers refused (Home now says so). Retest during an alert and with no alert | 2026-10-17 |
| Scaled alerts | Tier 1 does not answer, tier 2 gets the alert | Pass (branch `ntfy`, iPhone 13 Release build, friends in a web browser): tier 2 got the alert after tier 1 did not take it | 2026-10-17 |
| Band signal at 0.5 m | State shown |  |  |
| Band signal at 2 m | State shown |  |  |
| Band signal at 5 m | State shown |  |  |
| Advertising while connected | A second phone sees KAZE-Band. Pass or fail | Pass | 2026-10-17 |
| New text colours and VoiceOver | Look at every screen. VoiceOver on: three double-taps on Check in | Pass (branch `ntfy`, iPhone 13 Release build, friends in a web browser): the text reads well in the teammate's colours, the outlined check shows, VoiceOver reads the button and hint, three double-taps check in and it says "Thanks!" | 2026-10-17 |
| ntfy push to a contact's phone | The phone is the contact, subscribed in the ntfy app. The person in a web browser stays silent, phone locked | Pass (branch `ntfy`, iPhone 13): the lock screen showed "Homebound: A Homebound alert is waiting for you. Open the app." | 2026-10-17 |
| Local reminder for the user's own check | Night with a 5 min check, phone locked, app not opened | Pass (branch `ntfy`, iPhone 13): the lock screen showed "Homebound: Open the app." when the check was due. A check started by a friend with the app closed and no band is not covered (known limit) | 2026-10-17 |
| Themed header and alert names | Open each inner screen. Get an alert from a friend | Pass (branch `ntfy`, iPhone 13 and iPhone 15 Pro): the banner header and back button show on every inner screen, and alerts show the person's name | 2026-10-17 |

### Built, but checked only by automated tests

- The new app screens pass type check, lint and unit tests:
  - Leave hidden during a check, and the Leave question.
  - The location age.
  - The "said they were on it" and final step lines.
  - "Night ends at" and "Who sees your location during an alert".
- Local reminders for the user's own checks (periodic and home-by), so a phone in a pocket with the app in the background gets a notification. Built with `expo-notifications`, local only: no push server, no `aps-environment` entitlement (a free Apple Personal Team cannot sign it). The text is always title "Homebound", body "Open the app.", with no buttons, and it is the same after duress and after ok (twin tests cover `next_check`; `reminders.test.ts` covers the schedule). The home-by reminder and a reminder after a band wake are tested only in unit tests. Limits: a check started by a friend or the panel reaches a pocket phone only if the band wakes the app or the app is open. Focus or Do Not Disturb can silence it.
- With "Only whoever says I'm on it", nobody sees the location between an "I'm on it" that went stale and the next "I'm on it".

### Not built

- Relay through friends' phones, and the encrypted payload it needs.
- UWB precision finding.
- Real SMS or calls.
