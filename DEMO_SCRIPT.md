# KAZE demo script

This is the script for the judges. It shows the check-in loop on real phones and the band, then the 7 KAZE scenarios on the demo panel. It takes about 6 minutes. Every alert is simulated. Nothing calls 911 or a real contact.

## The pitch in one line

Safety apps assume that the person can ask for help. KAZE asks them first. Every trigger becomes a quiet "are you okay?". One answer means fine. Only silence, or a hidden duress signal, gets help.

## Cast and devices

| Role | Device | What runs on it |
|---|---|---|
| Wearer | iPhone 15 Pro and the KAZE band | Safekeeps app, Release build with Bluetooth |
| Friend | Second iPhone | Safekeeps app. Hotter and colder needs the Release build with Bluetooth. The web version in Safari does the rest |
| Presenter | Laptop | Demo panel at `<tunnel address>/panel` |

The friend's phone needs a cable to get the Release build. Without it, the friend uses the web version (`<web tunnel address>`), and you skip step 5c (hotter and colder).

## Before the judges arrive (15 minutes)

1. Start the server with a demo key: `cd ~/Desktop/kaze-app/server && KAZE_DEMO_KEY=<key> ~/Desktop/kaze/server/.venv/bin/uvicorn kaze.app:app --host 0.0.0.0 --port 8000`.
2. Start the tunnel: `cloudflared tunnel --url http://localhost:8000`. Write down the address.
3. If the tunnel address changed, enter it on each phone in Settings, Connection.
4. Band: set `QUIET_MODE = false` in `kaze_band.ino` and flash it. Power it from the power bank.
5. On the wearer's phone, open Settings, Band, Pair band. Make sure that Home shows "Band connected".
6. Make sure that the two phones are friends. On the wearer's phone, start a night: PIN, the friend in tier 1, the friend as duress contact, check every 15 min.
7. Open the panel on the laptop and enter the key. Make sure that the wearer's night shows as armed.
8. Charge both phones. Turn the volume up on the wearer's phone.

If the venue Wi-Fi blocks the phones, use one phone's hotspot. The tunnel works on any network.

## The script

### 1. The problem (30 s)

Say: "Most safety apps need you to press a button. The people who need help most often cannot: they are incapacitated, or someone is watching them. KAZE turns it around. It checks on you, and silence is the alarm."

### 2. Safe check, scenario 1 (45 s)

1. On the panel, press Trigger "manual" on the wearer's card. Or, on the friend's phone, tap "Request check-in".
2. The wearer's phone shows "Are you okay?" with a countdown. The band buzzes once and blinks.
3. The wearer taps the band 3 times.
4. The phone shows "Thanks!". The panel goes back to armed. Nobody is alerted.
5. A check can also come from a "be home by" time. Set it in Start a night. At that time the phone asks "Are you okay?" the same way. The panel shows "Home-by check" until it fires.

Say: "Every trigger is a check first. A trigger can be a timer, a friend asking, or being late home. A false alarm costs three taps, not a panic."

### 3. Duress, scenario 3 (60 s)

1. Trigger another check from the panel.
2. The wearer holds the band button for 1 second, then taps twice.
3. The band gives the same single flash as an ok. The phone shows the same "Thanks!".
4. On the panel: the alert is hidden ("the user's phone shows nothing"). Only the duress contact is alerted.
5. The friend's phone shows a silent alert with the wearer's location.

Say: "If someone is watching, an ok and a duress look exactly the same. The band, the phone screen, and the vibration are identical. A test proves that a watcher cannot tell them apart. Only the contacts the person picked in private get the duress alert. The rest of the group sees nothing."

End it: on the friend's phone, tap "I'm on it", then "Resolve".

### 4. No answer, then the next contact, scenarios 2 and 5 (60 s)

1. Trigger a check. Do not answer.
2. Press +60 s on the panel. The wearer's phone shows "Please answer now!", then "Your contacts have been alerted".
3. The friend's phone shows the alert banner and a response card: what to do, what not to do, and who is on it.
4. Do not tap "I'm on it". Press +30 s. The panel shows the alert move to the next tier.

Say: "The server owns every timer. Contacts are ranked: a friend nearby first, then the group, then a sober contact who is not at the event. If nobody says 'I'm on it', it moves on."

### 5. Find them (75 s)

a. Distance and direction. On the friend's phone, tap "Find them". It shows the distance and an arrow. Below about 30 m it says "You're close. GPS can't point closer than this. Use Ping." Indoor GPS is off by 20 to 50 m, so we do not fake precision.

b. Ping. The friend taps "Ping". The wearer's phone flashes and rings for 5 s, and the band beeps and flashes.

c. Hotter and colder (needs the friend's phone on the Release build). Walk toward the band. The screen goes from "They're somewhere nearby" to "Getting close" to "You're right next to them", with "Warmer" or "Colder". The friend's phone reads the band's Bluetooth signal strength, smoothed over 4 s.

Say: "Ping works only on visible alerts. On a duress alert, a ringing phone tells the person watching that help is coming. So the server refuses it."

Then on the friend's phone tap "Resolve".

### 6. The phone in a pocket: heartbeat (30 s)

1. Lock the wearer's phone and put it in a pocket.
2. Trigger a check from the panel.
3. Within about 20 s the band buzzes and blinks. The wearer taps 3 times. The panel goes back to armed.

Say: "The band is the point: you answer without taking out your phone. When a known Bluetooth device sends data, iOS wakes the app in the background. It does this even after iOS closed the app to save memory. So the band sends a small heartbeat every 20 seconds. Each heartbeat wakes the app. The app asks the server whether a check is waiting, and tells the band to ask. Push notifications are faster, but they need a paid Apple account. If the band dies or is out of range, the server timer still escalates."

### 7. Connection lost, scenario 4 (30 s)

1. Trigger a check. On the panel, press "Disconnect phone".
2. Press +60 s. The server still escalates. The friend still gets the alert.

Say: "The countdown lives on the server, not the phone. A dead battery or no signal is not a way out."

### 8. Cancel with a PIN, scenario 6 (45 s)

1. Start an alert as in step 4.
2. On the wearer's phone, enter a wrong PIN. It says "Incorrect PIN, try again".
3. Enter a wrong PIN again. It shows "Alert ended" with an outlined check.
4. On the panel, the alert is still running, now hidden.

Say: "If someone forces you to cancel, they cannot. The second wrong PIN looks like a cancel to the person watching, but help keeps coming. You know it is fake, because the check is outlined, not filled. The right PIN, or the friend who took the alert, ends it for real."

### 9. Privacy, scenario 7 (30 s)

Point at the privacy view on the panel.

Say: "Location goes to the server all night but is shown only during an alert, only to the people that alert reached. It stops when the alert ends. Group members never learn about a duress alert. Groups last one night, and anyone can leave without a notice."

## The 7 KAZE scenarios

| # | Scenario | Script step | Automated test |
|---|---|---|---|
| 1 | Safe | 2 | `server/tests/test_scenarios.py` |
| 2 | No response | 4 | same file |
| 3 | Duress | 3 | same file, plus `test_twin.py` (a watcher cannot tell) |
| 4 | Connectivity failure | 7 | same file, over a real WebSocket |
| 5 | Unacknowledged alert | 4 | same file |
| 6 | False alarm | 8 | same file |
| 7 | Privacy | 9 | same file, plus `test_panel.py` |

## What is real, simulated, and assumed

Say this before the judges ask. The full list is in `DEMO_NOTES.md`.

- Real: the server state machine and its timers, the app on a real iPhone, the band over Bluetooth, the heartbeat, find them with GPS, ping, and hotter and colder.
- Simulated with the panel: the passage of time (+60 s), a phone disconnect, a contact who does not answer, group separation, and every alert. No SMS, calls, or 911.
- Assumed: some path from the band to the server always exists, outdoor GPS is good to 5 to 10 m, and only one band is nearby. Every band has the same name, so hotter and colder follows any KAZE band.

## Likely questions

- Why not detect drugging or unconsciousness? Out of scope on purpose. We do not diagnose. We ask, and silence escalates.
- Why not an RSSI cutoff for group separation? We measured at the venue: 2 m and 20 m look the same indoors. Only a lost signal for 30 s means something.
- What if the phone is off? The server timer escalates anyway (scenario 4).
- What if someone takes the phone and cancels? Two wrong PINs show a fake "Alert ended". Removing contacts mid-night does not stop the alert either: contacts are fixed for the night.
- Why a band at all? It answers without the phone, and the touch sensor can hide under fabric. But everything works on a phone alone.

## If something fails during the demo

- Band does not connect: answer on the phone. The same gestures work on the check-in card.
- Tunnel down: restart it, then enter the new address in each phone's Settings. No rebuild needed.
- A phone does not update: pull to the Home screen. It polls every 2.5 s.
- Nothing works: run the panel alone. The 7 scenarios are on the panel's scenario guide, with the privacy view.
