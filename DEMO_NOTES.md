# Demo notes

This file lists what the prototype really does, what the demo fakes, and what the design assumes. We update it as we build.

## Demonstrated

- The check-in loop on the server: triggers, ask and grace timers, ranked tiers, acknowledgement, PIN cancel with one silent retry, duress, and privacy views. The 7 KAZE scenarios pass as automated tests (100 server tests in total).
- Timers keep running on the server after a phone disconnects (scenario 4, tested over a real WebSocket).

## Simulated

- Group separation. The demo panel sends it (Trigger "separation"). Indoor GPS drifts 20 to 50 m, so we do not detect it for real.
- The passage of time. The demo panel can skip timers ahead.
- Contacts who do not respond.
- Phone disconnects.
- The band. A phone acts as the band until phase 5.
- All alerts. No real SMS, calls, or 911.

## Assumed

- Some path from the band to the server always exists: the owner's phone, a friend's phone as a relay, or home Wi-Fi.
- The demo band uses BLE only. On the Uno R4 WiFi, BLE and Wi-Fi share one radio chip, so we did not build a direct band-to-server path over Wi-Fi.
- iOS background limits still let the check-in reach the user.
- GPS is accurate to 5 to 10 m outdoors only.
- Nobody can read another person's session without a token. On the Safekeeps path every call has a per-user token, and the old phase 1 endpoints refuse the ids of Safekeeps phones. On the demo-panel path (ids from `POST /users`) there is no auth, so a person who holds such a phone and knows a contact's id could read a hidden alert. `POST /demo/reset` and `POST /demo/skip` have no auth either, unless `KAZE_DEMO_KEY` is set, and they affect every night. A real build needs real auth on those.
- Contacts are fixed when a night starts. A friend who is removed during a night keeps seeing, acking and resolving that night's alerts, and their location, until the night ends. The removal applies from the next night. This is on purpose: if removal worked at once, a person holding the phone could cancel a hidden alert by removing the contacts. A hidden alert (duress, or after a fake end) also carries into the next night. The removed friend keeps seeing it, with the user's live location, until someone resolves it. Without that, remove, Leave, and a new night would cancel it.
- The demo uses plain http, so event names (`ConfirmOk` vs `Duress`) are visible on the network. A real build needs TLS, and the two request bodies should be padded to the same size.

- The demo server is public through a cloudflared quick tunnel. The data routes (`/demo/state`, `/demo/event`, `/demo/skip`, `/demo/reset`) need the key in `KAZE_DEMO_KEY`, sent as the `X-Demo-Key` header, when that variable is set. The `/panel` page itself is open but holds no data. If we start the server without a key, anyone who knows the random tunnel address can use the data routes. The server logs a warning and the panel shows a red banner. A real build would not expose them.
- The demo panel is a demo tool. It shows hidden alerts (duress and fake-ended) on purpose, so judges can see what the contacts see. The key is the only protection. A real build would have no such view.

## Not built

- Relay through friends' phones, and the encrypted payload it needs.
- UWB precision finding.
- Real SMS or calls.

## Needs manual testing

Automated tests cannot cover real phones, BLE, or the Arduino band. We list each manual test here when the feature exists.

- Band on its own (the team tested this in nRF Connect, see `Hardware/kaze_band/HARDWARE.md`): 0x01 and 0x02 arrive over notify, ask and ping writes work, the band reconnects without a reset, and it runs from a power bank. Still to check on the button and the touch sensor: the new gestures (3 taps ok, hold 1 s plus 2 taps duress, hold alone ok after 2.5 s, 1 or 2 taps nothing), the same flash for ok and duress, and an unanswered ask that stops after 30 s and sends nothing.
- Band with the server: not connected yet. It needs task 5.3 in the app. Until then, a person can pass the band's answers to `/safekeeps/night/events` by hand.
- On web, the `@expo/ui` Switch labels render white on white (pre-existing, also in her Settings screen).
- On web, her `ServerAddress` input has the same typing bug that was fixed elsewhere with `'use no memo'`. We left it alone because it is her component and native iPhone is unaffected. Verify on a device.
