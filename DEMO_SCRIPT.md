# KAZE demo script

This is the script for the judges. It shows the check-in loop on real phones and the band, then the 7 KAZE scenarios on the demo panel. The full script takes about 9 minutes. To fit 6 minutes, skip step 5c and step 6. Also skip the restart in step 7 and the duress PIN part of step 8. Every alert is simulated. Nothing calls 911 or a real contact.

## The pitch in one line

Safety apps assume that the person can ask for help. KAZE asks them first. Every trigger becomes a quiet "are you okay?". One answer means fine. Only silence, or a hidden duress signal, gets help.

## Cast and devices

| Role | Device | What runs on it | Night setup |
|---|---|---|---|
| Wearer | iPhone 15 Pro and the KAZE band | Safekeeps app, Release build with Bluetooth | Starts the night |
| Friend | Second iPhone | Safekeeps app. The band signal on Find them needs the Release build with Bluetooth. The web version in Safari does the rest | Tier 1 and duress contact |
| Second friend | Laptop, browser tab | Safekeeps web version (`<web tunnel address>`) | Tier 2, not a duress contact |
| Presenter | Laptop, second tab | Demo panel at `<tunnel address>/panel` | None |

Every friend of the wearer is also a group member for the night. So the second friend is both the tier 2 contact and a plain group member. In scenario 5 the alert visibly moves to the second friend. In the duress and privacy steps, the second friend visibly sees nothing.

The friend's phone needs a cable to get the Release build. Without it, the friend uses the web version, and you skip step 5c (the band signal).

### Demo timers

The server uses short demo timers so the judges do not wait. Say this out loud.

| Timer | Demo value | Production value (about) |
|---|---|---|
| Ask: "Are you okay?" before the louder stage | 30 s | 2 min |
| Grace: "Please answer now!" before contacts are alerted | 15 s | 1 min |
| Ack: a tier has this long to tap "I'm on it" before the next tier | 20 s | 3 min |
| Ack hold: "I'm on it" without "Resolve" before the alert goes back out | 120 s | 10 min |

After the last tier, the alert goes out to every contact again: 20 s later, then 60 s, 120 s and 300 s apart. When the round after the third one is due, the panel shows the simulated final step.

## Before the judges arrive (15 minutes)

1. Start the server with a demo key. Use the folder with the newest code: `~/Desktop/kaze-judge` until the `judging` pull request is merged into `home-by`, then `~/Desktop/kaze-band`. Neither folder has a `.venv`, so the command uses the venv from `~/Desktop/kaze`:
   `cd ~/Desktop/kaze-judge/server && KAZE_DEMO_KEY=<key> ~/Desktop/kaze/server/.venv/bin/uvicorn kaze.app:app --host 0.0.0.0 --port 8000`
   The server saves the nights to `server/kaze_state.pickle` every second (change the path with `KAZE_STATE`). Press Reset on the panel before the judges arrive, so the nights from rehearsal are gone.
2. Start the tunnel: `cloudflared tunnel --url http://localhost:8000`. Write down the address.
3. If the tunnel address changed, enter it on each phone in Settings, Connection. Open the web version in a laptop tab for the second friend.
4. Band: `QUIET_MODE` is `false` in `kaze_band.ino`, so the buzzer is on. Flash it. Power it from the power bank.
5. On the wearer's phone, open Settings, Band, Pair band. Home shows "Band connected. Start a night to use it." The server refuses band answers until a night runs. After step 6, Home shows "Band connected".
6. Make sure that the friend and the second friend are both friends of the wearer. On the wearer's phone, start a night:
   - 4-digit PIN, and Repeat PIN.
   - Duress PIN, and Repeat duress PIN. It must differ from the PIN. Write both PINs down for the presenter.
   - Friend: Tier 1, Duress contact on.
   - Second friend: Tier 2, Duress contact off.
   - How often: 15 min.
   - Who sees your location during an alert: Everyone alerted.
7. Open the panel on the laptop and enter the key. Make sure that the wearer's night shows as armed, with the friend in tier 1 and the second friend in tier 2.
8. Charge both phones. Turn the volume up on the wearer's phone. Turn auto-lock off on the wearer's phone. Step 6 locks it by hand.
9. Rehearse the restart in step 7 once. Automated tests cover it. Nobody tried it yet with a real server process.

If the venue Wi-Fi blocks the phones, use the hotspot of a phone that is not the wearer's. The tunnel works on any network.

## The script

### 1. The problem (30 s)

Say: "Most safety apps need you to press a button. The people who need help most often cannot: they are incapacitated, or someone is watching them. KAZE turns it around. It checks on you, and silence is the alarm."

### 2. Safe check, scenario 1 (50 s)

1. On the panel, press Trigger "manual" on the wearer's card. Or, on the friend's phone, tap "Request check-in".
2. The wearer's phone shows "Are you okay?" with a countdown. The band buzzes once and blinks.
3. Point at the phone: there is no "Leave night" button during a check. The server refuses Leave during a check too.
4. The wearer taps the band 3 times. Phone-only fallback: tap the check-in button on the phone 3 times.
5. The phone shows "Thanks!". The panel goes back to armed. Nobody is alerted.
6. A check can also come from a "be home by" time. Set it in Start a night. At that time the phone asks "Are you okay?" the same way. The panel shows "Home-by check" until it fires.

Say: "Every trigger is a check first. A trigger can be a timer, a friend asking, or being late home. A false alarm costs three taps, not a panic. And a person who grabs the phone cannot make the check go away by leaving the night."

### 3. Duress, scenario 3 (60 s)

1. Trigger another check from the panel.
2. The wearer holds the band button for 1 second, then taps twice. Phone-only fallback: the same gesture on the check-in button.
3. The band gives the same single flash as an ok. The phone shows the same "Thanks!".
4. On the panel: the alert is hidden ("the user's phone shows nothing"). Only the duress contact is alerted.
5. The friend's phone shows a silent alert with the wearer's location.
6. Point at the second friend's tab: it shows nothing. In the panel privacy view, the second friend does not see the alert.

Say: "If someone is watching, an ok and a duress look exactly the same. The band, the phone screen, and the vibration are identical. A test proves that a watcher cannot tell them apart. Only the contacts the person picked in private get the duress alert. The rest of the group sees nothing."

End it: on the friend's phone, tap "I'm on it", then "Resolve".

### 4. No answer, the next contact, and a stale "I'm on it", scenarios 2 and 5 (90 s)

1. Trigger a check. Do not answer.
2. Press +30 s on the panel. The wearer's phone shows "Please answer now!". Then press +15 s. The phone shows "Your contacts have been alerted". One +60 s skip jumps past "Please answer now!", so use the two smaller skips.
3. The friend's phone shows the alert banner and a response card: what to do, what not to do, and who is on it. For example, the card says "Stay with them once you find them" and "Do not leave them alone".
4. The friend does not tap "I'm on it". Press +30 s. The alert moves to tier 2: the second friend's tab now shows the alert.
5. On the second friend's tab, tap "I'm on it". Do not tap "Resolve".
6. Press +60 s twice. The alert goes back out to every contact. The friend's phone shows "<second friend's name> said they were on it but has not resolved it." The second friend's tab shows "You said you were on it but have not resolved it." The panel shows the same.
7. Press +15 min three times. The panel shows "Final step reached: emergency services would be contacted now (SIMULATED)". The friend's phone shows "Nobody answered. In a real deployment, emergency services would be contacted now (simulated)."

Say: "The server owns every timer. Contacts are ranked: a friend nearby first, then the group, then a sober contact who is not at the event. If nobody says 'I'm on it', it moves on. If someone says 'I'm on it' and then does nothing, it goes back out. Re-alerts slow down, so they do not spam people. At the end, a real product calls a dispatcher. Here it is only a flag on the panel."

Keep this alert running for step 5.

### 5. Find them (75 s)

a. Distance and direction. On the friend's phone, tap "Find them". It shows the distance and an arrow. Below about 30 m it says "You're close. GPS can't point closer than this. Use Ping." Indoor GPS is off by 20 to 50 m, so we do not fake precision. Under the name it shows "Location updated just now" or "Location updated N min ago". Right after the +15 min skips it shows a large age, until the wearer's phone sends its next location (about every 30 s).

b. Ping. The friend taps "Ping". The wearer's phone flashes and rings for 5 s, and the band beeps and flashes.

c. The band signal (needs the friend's phone on the Release build). Close to the wearer, the screen says "You're close. GPS can't point closer than this. Use Ping." Below that it shows "Their band is in range". Walk right up to the band. It changes to "You're right next to them". Under Ping it says "Bluetooth can only tell when you are right beside them. Use Ping to hear them." The friend's phone reads the band's Bluetooth signal strength. It uses the median of the last 4 s.

Say: "A location without its age is a guess, so we always show how old it is. Bluetooth signal strength cannot measure metres indoors, so the screen says only what it can tell: right beside them, or not. Ping works only on visible alerts. On a duress alert, a ringing phone tells the person watching that help is coming. So the server refuses it."

Then on the friend's phone tap "I'm on it", then "Resolve".

### 6. The phone in a pocket: heartbeat (30 s)

1. Lock the wearer's phone and put it in a pocket.
2. Trigger a check from the panel.
3. Within about 20 s the band buzzes and blinks. The wearer taps 3 times. The panel goes back to armed.

Phone-only fallback: if the band does not buzz within 30 s, take out the phone and answer on it. Say that the band step is still under hardware test.

Say: "The band is the point: you answer without taking out your phone. When a known Bluetooth device sends data, iOS wakes the app in the background. It does this even after iOS closed the app to save memory. So the band sends a small heartbeat every 20 seconds. Each heartbeat wakes the app. The app asks the server whether a check is waiting, and tells the band to ask. Push notifications are faster, but they need a paid Apple account. If the band dies or is out of range, the server timer still escalates."

### 7. Connection lost and server restart, scenario 4 (50 s)

1. Trigger a check. On the panel, press "Disconnect phone". This only marks the phone offline on the panel, because the phones poll the server. The phone itself keeps working.
2. Press +60 s. The server still escalates. The friend still gets the alert.
3. Restart the server mid-alert. In the server's terminal, press Ctrl+C, then run the same command again. The tunnel keeps running, so the address stays the same. Within a few seconds the panel and the friend's phone show the same alert, still escalating.
4. To end it, the friend taps "I'm on it", then "Resolve". Step 8 needs a new alert.

Say: "The countdown lives on the server, not the phone. A dead battery or no signal is not a way out. The server saves its state every second. A restart does not lose an alert either."

### 8. Cancel with a PIN, and the duress PIN, scenario 6 (75 s)

1. Start an alert as in step 4, parts 1 and 2.
2. On the wearer's phone, enter a wrong PIN. It says "Incorrect PIN, try again".
3. Enter a wrong PIN again. It shows "Alert ended" with an outlined check.
4. On the panel, the alert is still running, now hidden.
5. On the wearer's phone, tap "Cancel an alert" and enter another wrong PIN. It shows "Alert ended" again. More guesses show nothing new, and nobody is told.

Say: "If someone forces you to cancel, they cannot. The second wrong PIN looks like a cancel to the person watching, but help keeps coming. You know it is fake, because the check is outlined, not filled. The right PIN, or the friend who took the alert, ends it for real."

End it: tap "Cancel an alert" and enter the right PIN. The check is filled, and the panel shows the alert resolved.

The duress PIN:

6. Start a new alert as in step 4, parts 1 and 2.
7. On the wearer's phone, enter the duress PIN. It shows "Alert ended" with a filled check, exactly as the right PIN did a moment ago.
8. On the panel, the wearer's alert is still running, now hidden. A new hidden alert of kind duress runs too.
9. The friend's phone (the duress contact) now shows the silent duress alert. The wearer's location appears with the phone's next update, within about 30 s.

Say: "This is a duress PIN. If someone makes you cancel, you type it instead of your PIN. To the person watching, it is a real cancel, with the same filled check. In secret it alerts your duress contacts, and the first alert keeps going. Tests prove that both PINs look the same on the phone, in the server answers and to the group."

End it: tap "Cancel an alert" and enter the right PIN. Both alerts end.

### 9. Privacy, scenario 7 (30 s)

Point at the privacy view on the panel, and at the second friend's tab from step 3.

Say: "Location goes to the server all night, but contacts see it only during an alert, and only the people that alert reached. In Start a night, the wearer can limit it to whoever says 'I'm on it'. When the alert ends, the sharing stops. Group members never learn about a duress alert. Groups last one night. Anyone can leave from the armed screen with one more tap, and nobody gets a notice. During a check, Leave is hidden and the server refuses it."

## The 7 KAZE scenarios

| # | Scenario | Script step | What the judges see | Automated test |
|---|---|---|---|---|
| 1 | Safe | 2 | "Thanks!", panel back to armed | `server/tests/test_scenarios.py` |
| 2 | No response | 4 | The friend gets the alert | same file |
| 3 | Duress | 3 and 8 | Friend alerted, second friend sees nothing. The duress PIN looks like a real cancel | same file, plus `test_twin.py` (a watcher cannot tell) |
| 4 | Connectivity failure | 7 | The alert continues with the phone offline, and after a server restart | same file, over a real WebSocket, plus `test_persist.py` |
| 5 | Unacknowledged alert | 4 | The alert moves from the friend to the second friend, and goes back out after a stale "I'm on it" | same file, plus `test_loop.py` |
| 6 | False alarm | 8 | Fake end on wrong PINs, real end on the right PIN | same file |
| 7 | Privacy | 9 | Privacy view, second friend sees nothing in duress | same file, plus `test_panel.py` |

## What is real, simulated, and assumed

Say this before the judges ask. The full list is in `DEMO_NOTES.md`. The studies we plan for the rest are in `VALIDATION.md`.

- Real (runs in the prototype and passes automated tests):
  - The server state machine and its timers, the tiers, "I'm on it" and its hold time, and the re-alert backoff.
  - The saved state across a restart, and the demo panel.
  - The Safekeeps app in a web browser. Find them with the GPS arrow, and the ping rules on the server.
  - The duress PIN on the server: the same answer as the right PIN, and a silent duress alert (automated tests only).
- Real on hardware (iPhone 15 Pro and the band, 2026-10-17):
  - Pairing, band ok and duress through the app to the server, the band asking, and Ping reaching the band.
  - The heartbeat: with the screen off, the band asked about 12 s after a check started.
  - iOS state restoration: after the app was stopped, iOS relaunched it in the background and a band answer still reached the server, with nobody touching the phone.
  - A second phone still sees the band while it is connected.
- Built, not yet tested on hardware:
  - The two-state band signal on Find them (it needs a second phone on the native build). The first version, with three zones and Warmer or Colder, was not accurate past 1 m in the two-person test.
  - The duress PIN on a phone and the Start a night fields for it.
  - The latest firmware changes: the buzzer on, and answers kept for 60 s until a phone subscribes. They compile. The tests above ran on the earlier firmware.
- Simulated with the panel: the passage of time, a phone disconnect, a contact who does not answer, group separation, the final step (emergency services), and every alert. No SMS, calls, or 911.
- Assumed:
  - Contacts have the app open. There is no push or SMS yet.
  - The timers are demo values.
  - Some path from the band to the server always exists.
  - Outdoor GPS is good to 5 to 10 m.
  - Only one band is nearby. Every band has the same name, so the band signal on Find them follows any KAZE band.

## Likely questions

- Why not detect drugging or unconsciousness? Out of scope on purpose. We do not diagnose. We ask, and silence escalates.
- Why not an RSSI cutoff for group separation? We measured at the venue: 2 m and 20 m look the same indoors. Only a lost signal for 30 s means something.
- Why can the band not tell a friend how many metres away the person is? Bluetooth signal strength (RSSI) past 1 m is noise. At the venue, right beside the band read -41 dBm. From 1 m to 20 m it read -75 to -88 dBm, in no order. Our first version showed three zones and Warmer or Colder. In the two-person test it was wrong past 1 m. So the app now says only "right next to them" or "in range", and Ping does the rest. The real fix is UWB (ultra-wideband) radio, which measures distance. It is in the "Not built" list in `DEMO_NOTES.md`.
- What if the phone is off? The server timer escalates anyway (scenario 4).
- What if the server restarts? It saves its state every second and loads it at start (step 7).
- What if someone takes the phone and cancels? The user can type the duress PIN. It looks like a real cancel, but it silently alerts the duress contacts and the alert keeps going. Two wrong PINs also show a fake "Alert ended", and more guesses change nothing. Leave does not work during a check. Removing contacts mid-night does not stop the alert either: contacts are fixed for the night.
- What if a friend taps "I'm on it" and then does nothing? After the hold time, the alert goes back out with their name on it.
- Why a band at all? It answers without the phone, and the touch sensor can hide under fabric. But everything works on a phone alone.
- How do you know it works for real people? We do not know yet. `VALIDATION.md` lists the studies, each with a target. We have not run them.

## If something fails during the demo

- Band does not connect: answer on the phone. The same gestures work on the check-in button.
- Tunnel down: restart it, then enter the new address in each phone's Settings and in the second friend's tab. No rebuild needed.
- Server stops: run the same command again. The saved state brings the nights back.
- A phone does not update: pull to the Home screen. It polls every 2.5 s.
- Nothing works: run the panel alone. The 7 scenarios are on the panel's scenario guide, with the privacy view.
