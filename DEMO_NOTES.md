# Demo notes

This file sorts the prototype into the four groups that the KAZE brief asks for. We update it as we build. The studies and the path to a real product are in `VALIDATION.md`.

## What the prototype actually demonstrates

These items run in the prototype and pass automated tests: 244 server tests and 57 app node tests.

- The check-in loop on the server: triggers, ask and grace timers, ranked tiers, acknowledgement, PIN cancel with one silent retry, duress, and privacy views. The 7 KAZE scenarios pass as automated tests.
- Timers keep running on the server after a phone disconnects (scenario 4, tested over a real WebSocket).
- The server saves its state to a file every second and at shutdown, and loads it at start. A night and a running alert come back after a restart. The test restarts the server inside the test client. Nobody stopped and restarted a real server process yet.
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
- Ping (a contact makes the person's phone ring) works only on visible alerts. It never works on a duress or fake-ended alert, because a ringing phone shows a hidden alert to a watcher. The server side is tested. The sound and flash on a real phone are not tested yet.
- Automated tests only, not on hardware: the home-by checks, the band relay logic in the app, and the hotter and colder logic.

## What is simulated

- Group separation. The demo panel sends it (Trigger "separation"). Indoor GPS drifts 20 to 50 m, so we do not detect it for real.
- The passage of time. The demo panel can skip timers ahead.
- Contacts who do not respond. In the demo they do not tap.
- Phone disconnects. The panel button only marks the phone offline.
- The final step. The panel shows "Final step reached: emergency services would be contacted now (SIMULATED)" and the app shows a line of text. Nothing is called.
- All alerts. No real SMS, calls, or 911.
- A sample location. When a phone has no GPS, the panel button "Set sample location" sends one.

## What assumptions the concept relies upon

- Contacts must have the app open to notice an alert. The prototype has no push notifications and no SMS. While the app is open, it polls every 2.5 s. A contact sees a new alert only at a poll.
- The timers are demo values: ask 30 s, grace 15 s, ack 20 s, ack hold 120 s. Production values are about ask 2 min, grace 1 min, ack 3 min, ack hold 10 min.
- Location is uploaded all night while a night runs, not only during an alert. The server keeps it in memory and in the state file on the laptop (`server/kaze_state.pickle`, or the path in `KAZE_STATE`). Contacts see it only during an alert.
- The server loads the state file without checks. Anyone who can write that file can run code on the server. This is fine for a laptop demo only.
- Some path from the band to the server always exists: the owner's phone, a friend's phone as a relay, or home Wi-Fi.
- Only one band is near. Every band has the same name, so hotter and colder follows any KAZE band.
- The app is not swiped away. iOS does not relaunch an app that the user swiped away, so the band cannot wake it.
- When the phone is locked, an ask or a ping reaches the band up to 20 s late. The heartbeat wakes the app only every 20 s.
- The demo band uses BLE only. On the Uno R4 WiFi, BLE and Wi-Fi share one radio chip, so we did not build a direct band-to-server path over Wi-Fi.
- iOS background limits still let the check-in reach the user.
- GPS is accurate to 5 to 10 m outdoors only.
- Nobody can read another person's session without a token. On the Safekeeps path every call has a per-user token, and the old phase 1 endpoints refuse the ids of Safekeeps phones. On the demo-panel path (ids from `POST /users`) there is no auth. A person who holds such a phone and knows a contact's id can read a hidden alert. `POST /demo/reset` and `POST /demo/skip` have no auth either, unless `KAZE_DEMO_KEY` is set, and they affect every night. A real build needs real auth on those.
- The demo runs through a cloudflared tunnel over HTTPS, so the event names (`ConfirmOk` and `Duress`) are encrypted on the network. Only the length of the request body differs. A real build pads the two bodies to the same size.
- When a night starts, its contacts are fixed. A friend who is removed during a night keeps seeing, acking and resolving that night's alerts, and their location, until the night ends. The removal applies from the next night. This is on purpose. If removal worked at once, a person holding the phone can cancel a hidden alert by removing the contacts. A hidden alert (duress, or after a fake end) also carries into the next night. The removed friend keeps seeing it, with the user's live location, until someone resolves it. Without that rule, remove, Leave, and a new night cancel it.
- The demo server is public through a cloudflared quick tunnel. When `KAZE_DEMO_KEY` is set, the data routes (`/demo/state`, `/demo/event`, `/demo/skip`, `/demo/reset`) need that key. The panel sends it as the `X-Demo-Key` header. The `/panel` page itself is open but holds no data. If we start the server without a key, anyone who knows the random tunnel address can use the data routes. The server logs a warning and the panel shows a red banner. A real build does not expose them.
- The demo panel is a demo tool. It shows the presenter every running night all night: hidden alerts (duress and fake-ended) and the live location of each user. It shows the location also when no alert runs. This is on purpose, so judges can see what the contacts see. The key is the only protection. A real build has no such view.

## What would require further testing or validation before real-world deployment

The studies we plan, each with a method and a target, are in `VALIDATION.md`. We have not run any of them.

### Manual tests on hardware

Automated tests cannot cover real phones, BLE, or the Arduino band.

- Band on its own (an earlier firmware was tested in nRF Connect, see `Hardware/kaze_band/HARDWARE.md`): 0x01 and 0x02 arrive over notify, ask and ping writes work, the band reconnects without a reset, and it runs from a power bank. Still to check on the button and the touch sensor:
  - The gestures: 3 taps ok, hold 1 s plus 2 taps duress, hold alone ok after 2.5 s, 1 or 2 taps nothing.
  - The same flash for ok and duress.
  - An unanswered ask stops after 30 s and sends nothing.
- Current firmware, compiled but not tested on the board:
  - The buzzer is on (`QUIET_MODE = false`).
  - An answer made while no phone is connected is kept and sent after the phone connects. The band gives the same flash and beep for ok and duress, connected or not.
  - The answer is notify only, not readable. The band sends 0 after each answer, and the app ignores it.
  - After a reconnect, the app has 1 s to subscribe again. If it takes longer, a kept answer can be lost.
  - The answer and the 0 go out back to back. Nobody checked yet that both reach iOS in order.
- Band with the app, all untested on real hardware:
  - Pair the band in Settings. Home shows "Band connected".
  - Band ok and duress reach the server, and both look the same on the phone.
  - When a check starts, the band buzzes and blinks. A ping makes the band beep.
  - The app asks the band again at the louder stage. This assumes the firmware starts the ask again on each write.
  - An answer from the band can fail to reach the server. Then the app keeps it and sends it later. It keeps an ok or a duress for 60 s, the same for both, so a late one cannot tell them apart and cannot answer a later check. The band keeps an answer made with no phone connected for the same 60 s. A duress that cannot be sent within 60 s is lost. The server timer still escalates silence. A server refusal is also kept and retried until it expires.
  - Heartbeat: lock the phone, put it away, trigger a check. The band asks within about 20 s.
  - State restoration: background the app, stop it from the Mac (`xcrun devicectl`), then tap the band. The event must still reach the server. A swiped-away app is not relaunched by iOS, by Apple's rule.
  - Advertising while connected: with the wearer's phone connected, a second phone still sees KAZE-Band.
  - Hotter and colder on the friend's phone: the three zones and Warmer or Colder.

### Hardware test results

Fill this in during the hardware test. Move each pass to "What the prototype actually demonstrates". Write each fail here with its fallback (the server timer still escalates).

| Test | How | Result | Date |
|---|---|---|---|
| Ask to band delay, phone locked | 10 trials. Median and max in seconds |  |  |
| State restoration | Stop the app from the Mac, tap the band. Pass or fail |  |  |
| Battery drain per hour, 20 s heartbeat | Phone and band battery percent per hour |  |  |
| Hotter and colder at 0.5 m | Zone shown |  |  |
| Hotter and colder at 2 m | Zone shown |  |  |
| Hotter and colder at 5 m | Zone shown |  |  |
| Advertising while connected | A second phone sees KAZE-Band. Pass or fail |  |  |

### Built, but checked only by automated tests

- The new app screens pass type check, lint and unit tests:
  - Leave hidden during a check, and the Leave question.
  - The location age.
  - The "said they were on it" and final step lines.
  - "Night ends at" and "Who sees your location during an alert".
  - Nobody opened them in a browser or on a phone yet.
- A restart of a real server process (Ctrl+C, then start again). Only the test client restart is tested.
- With "Only whoever says I'm on it", nobody sees the location between an "I'm on it" that went stale and the next "I'm on it".

### Not built

- Relay through friends' phones, and the encrypted payload it needs.
- UWB precision finding.
- Real SMS, calls, or push notifications.
