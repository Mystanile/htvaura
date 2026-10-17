# Demo notes

This file lists what the prototype really does, what the demo fakes, and what the design assumes. We update it as we build.

## Demonstrated

- The check-in loop on the server: triggers, ask and grace timers, ranked tiers, acknowledgement, PIN cancel with one silent retry, duress, and privacy views. The 7 KAZE scenarios pass as automated tests (102 server tests in total).
- Timers keep running on the server after a phone disconnects (scenario 4, tested over a real WebSocket).

## Simulated

- Group separation. The demo panel sends it. Indoor GPS drifts 20 to 50 m, so we do not detect it for real.
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

## Not built

- Relay through friends' phones, and the encrypted payload it needs.
- UWB precision finding.
- Real SMS or calls.

## Needs manual testing

Automated tests cannot cover real phones, BLE, or the Arduino band. We list each manual test here when the feature exists.
