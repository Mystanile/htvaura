# Demo notes

This file lists what the prototype really does, what the demo fakes, and what the design assumes. We update it as we build.

## Demonstrated

- The check-in loop on the server: triggers, ask and grace timers, ranked tiers, acknowledgement, PIN cancel with one silent retry, duress, and privacy views. The 7 KAZE scenarios pass as automated tests (223 server tests in total).
- Timers keep running on the server after a phone disconnects (scenario 4, tested over a real WebSocket).
- Location is sent all night, about every 30 s while the app is open, and shown to contacts only during an active alert. It is cleared when the alert ends (tested). Duress contacts get a location this way, because the phone never knows a duress alert is running.
- Ping (a contact makes the person's phone ring) works only on visible alerts, and never on a duress or fake-ended alert, because a ringing phone would show a hidden alert to a watcher. The server side is tested. The sound and flash on a real phone are not tested yet.
- Automated tests only, not on hardware: the home-by checks, the band relay logic in the app, and the hotter and colder logic (52 app node tests).

## Simulated

- Group separation. The demo panel sends it (Trigger "separation"). Indoor GPS drifts 20 to 50 m, so we do not detect it for real.
- The passage of time. The demo panel can skip timers ahead.
- Contacts who do not respond.
- Phone disconnects.
- All alerts. No real SMS, calls, or 911.

## Assumed

- Some path from the band to the server always exists: the owner's phone, a friend's phone as a relay, or home Wi-Fi.
- Only one band is near. Every band has the same name, so hotter and colder follows any KAZE band.
- The app is not swiped away. iOS does not relaunch an app that the user swiped away, so the band cannot wake it.
- An ask or a ping reaches the band up to 20 s late when the phone is locked, because the heartbeat wakes the app every 20 s.
- The demo band uses BLE only. On the Uno R4 WiFi, BLE and Wi-Fi share one radio chip, so we did not build a direct band-to-server path over Wi-Fi.
- iOS background limits still let the check-in reach the user.
- GPS is accurate to 5 to 10 m outdoors only.
- Nobody can read another person's session without a token. On the Safekeeps path every call has a per-user token, and the old phase 1 endpoints refuse the ids of Safekeeps phones. On the demo-panel path (ids from `POST /users`) there is no auth, so a person who holds such a phone and knows a contact's id could read a hidden alert. `POST /demo/reset` and `POST /demo/skip` have no auth either, unless `KAZE_DEMO_KEY` is set, and they affect every night. A real build needs real auth on those.
- The demo uses plain http, so event names (`ConfirmOk` vs `Duress`) are visible on the network. A real build needs TLS, and the two request bodies should be padded to the same size.
- Contacts are fixed when a night starts. A friend who is removed during a night keeps seeing, acking and resolving that night's alerts, and their location, until the night ends. The removal applies from the next night. This is on purpose: if removal worked at once, a person holding the phone could cancel a hidden alert by removing the contacts. A hidden alert (duress, or after a fake end) also carries into the next night. The removed friend keeps seeing it, with the user's live location, until someone resolves it. Without that, remove, Leave, and a new night would cancel it.

- The demo server is public through a cloudflared quick tunnel. The data routes (`/demo/state`, `/demo/event`, `/demo/skip`, `/demo/reset`) need the key in `KAZE_DEMO_KEY`, sent as the `X-Demo-Key` header, when that variable is set. The `/panel` page itself is open but holds no data. If we start the server without a key, anyone who knows the random tunnel address can use the data routes. The server logs a warning and the panel shows a red banner. A real build would not expose them.
- The demo panel is a demo tool. It shows hidden alerts (duress and fake-ended) on purpose, so judges can see what the contacts see. The key is the only protection. A real build would have no such view.

## Not built

- Relay through friends' phones, and the encrypted payload it needs.
- UWB precision finding.
- Real SMS or calls.

## Needs manual testing

Automated tests cannot cover real phones, BLE, or the Arduino band. We list each manual test here when the feature exists.

- Band on its own (the team tested this in nRF Connect, see `Hardware/kaze_band/HARDWARE.md`): 0x01 and 0x02 arrive over notify, ask and ping writes work, the band reconnects without a reset, and it runs from a power bank. Still to check on the button and the touch sensor: the new gestures (3 taps ok, hold 1 s plus 2 taps duress, hold alone ok after 2.5 s, 1 or 2 taps nothing), the same flash for ok and duress, and an unanswered ask that stops after 30 s and sends nothing.
- Band with the app (branch `band`), all untested on real hardware:
  - Pair the band in Settings. Home shows "Band connected".
  - Band ok and duress reach the server, and both look the same on the phone.
  - When a check starts, the band buzzes and blinks. A ping makes the band beep.
  - Heartbeat: lock the phone, put it away, trigger a check. The band asks within about 20 s.
  - State restoration: background the app, stop it from the Mac (`xcrun devicectl`), then tap the band. The event must still reach the server. A swiped-away app is not relaunched by iOS, by Apple's rule.
  - Advertising while connected: with the wearer's phone connected, a second phone still sees KAZE-Band.
  - Hotter and colder on the friend's phone: the three zones and Warmer or Colder.
