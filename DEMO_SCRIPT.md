# Homebound demo script

This is a 5 and a half minute demo for the Project KAZE sponsor judge. It shows the check-in loop on real phones and the band. Every alert is simulated. Nothing calls 911 or a real contact.

The pitch in one line: safety apps assume you can ask for help. Homebound asks you first. One answer means fine. Silence, or a hidden duress signal, gets help.

## Cast

| Who | Device | Role in the story |
|---|---|---|
| Presenter | iPhone A and the band | The person going out. Starts the night. |
| Friend 1 | iPhone B, locked, subscribed in ntfy | One of "the friends you put first" (Tier 1). |
| Friend 2 | Browser tab on the laptop, Homebound web app | The duress contact and Tier 2. |
| Panel | Browser tab on the laptop | "Our time machine". Skips time and shows what the server sees. |

With fewer people, one person holds iPhone B and the laptop, and the Presenter holds iPhone A. With one person alone, skip the locked-phone push in beat 2 and say so. Use the Friend 1 web tab instead.

The demo timers are short so nobody waits. Beat 2 says this once.

## Setup, done before the judges arrive

1. Start the server from `~/Desktop/kaze` on `main`:
   `cd server && KAZE_DEMO_KEY=<key> KAZE_NTFY_URL=https://ntfy.sh KAZE_NTFY_SECRET=<secret> .venv/bin/uvicorn kaze.app:app --host 0.0.0.0 --port 8000`
2. Start the tunnel: `cloudflared tunnel --url http://localhost:8000`. Write down the address.
3. Enter the address on both phones: Settings, Connection. Start the web app with `cd safekeeps && npx expo start --web` and open it in a laptop tab for Friend 2. Enter the same address in that tab: Settings, Connection.
4. Open `<server address>/panel` in another tab. Enter the key. Press Reset.
5. On iPhone B, open Settings and find "Get alerts when the app is closed". Subscribe to the topic in the ntfy app. Allow notifications. Check the push in step 8.
6. On iPhone A, open Settings, Band, Pair band. Home shows "Band connected. Start a night to use it." Charge the power bank that runs the band. Charge both phones.
7. On iPhone A, tap "Start a night":
   - "4-digit PIN" and "Repeat PIN". Write both down.
   - "Duress PIN" and "Repeat duress PIN". Pick a different number. Write it down.
   - Friend 1: Tier 1, "Duress contact" off.
   - Friend 2: Tier 2, "Duress contact" on.
   - "How often": 2 hours. The demo uses only panel triggers.
   - "Who sees your location during an alert": Everyone alerted.
8. In the panel, check that iPhone A shows as armed with Friend 1 in the first group and Friend 2 in the second.
9. Deny location access for Homebound on iPhone A. Then the app does not overwrite the sample location. On the panel, press "Set sample location" for iPhone A.
10. Test the push: press Trigger "manual", then +30 s, then +15 s. Check iPhone B's lock screen. Friend 1 taps "I'm on it", then "Resolve".
11. Set up VoiceOver as a shortcut on iPhone A: Settings, Accessibility, Accessibility Shortcut, VoiceOver.
12. Turn on a phone hotspot as a backup network. Turn iPhone A auto-lock off for the demo. Turn the volume up.
13. Put the backup video on the laptop, ready to play.

## The story

### 0. Hook (15 s)

Say: "Most safety apps need a button press. The people who need help most often cannot press it. Homebound checks on you. Silence is the alarm."

### 1. A safe check (30 s)

Do:
1. Panel: press Trigger "manual" on the Presenter card.
2. iPhone A shows "Are you okay?" and buzzes. The band buzzes and blinks.
3. Presenter taps the band 3 times.
4. iPhone A shows "Thanks!". The panel goes back to armed.

Say: "Every trigger is a question first. Three taps on the band and I am fine. Nobody is alerted. A false alarm costs three taps, not a panic."

### 2. Silence (85 s)

Do:
1. Panel: press Trigger "manual". The Presenter does not answer.
2. Panel: press +30 s. iPhone A shows "Please answer now!". Press +15 s. iPhone A shows "Your contacts have been alerted".
3. Friend 1's locked iPhone B shows the ntfy push: "Homebound: A Homebound alert is waiting for you. Open the app." Friend 1 opens Homebound at once and taps "I'm on it" within 20 s of the +15 s press. Later, Friend 2's tab would get the plain alert and beat 3 would not work.
4. Show the card with what to do and what not to do, and the location.
5. Friend 1 taps "Find them". The screen shows the distance and the GPS arrow. If the phones are close, it shows "You're close... Use Ping." instead.
6. Friend 1 taps "Ping". iPhone A rings and the band beeps.

Say once: "The timers here are short so nobody waits. A question lasts 30 s here and about 2 min in a real build. The louder stage lasts 15 s, about 1 min. A friend has 20 s to answer, about 3 min."

Say: "Silence is the alarm. Here, 45 seconds of silence stand for a real wait. The server counts, so the phone can die and help still comes. Friend 1 gets a push on a locked phone, sees what to do, and says 'I'm on it'. Then the app guides them to me. Ping makes my phone ring so they can hear me."

Keep this alert running. Do not tap "Resolve".

### 3. Duress with the PIN (60 s)

Do:
1. The Presenter looks at iPhone A. The alert screen has a PIN box. The Presenter types the duress PIN and taps "End alert".
2. iPhone A shows "Alert ended" with a filled check, the same as the real PIN shows.
3. Show Friend 1's screen. Nothing new appears.
4. Show the Friend 2 tab. The duress alert appears with the location.
5. Friend 2 taps "I'm on it".
6. Do this within 2 min of Friend 1's "I'm on it" in beat 2, or the beat 2 alert goes back out. Presenter taps "Cancel an alert", types the real PIN, and taps "End alert". It ends the Presenter's own alert. The duress alert stays on Friend 2's screen.
7. Friend 2 taps "Resolve". The duress alert ends.

Say: "Someone is watching me and makes me cancel. I type a second PIN. My phone says 'Alert ended', exactly as it does for the real PIN. Friend 1's screen shows nothing new. Only the contact I picked in private, Friend 2, gets the alert. And no PIN ends it. Only Friend 2 can."

### 4. Nobody answers (45 s)

Do:
1. Panel: press Trigger "manual". Press +30 s, then +15 s. The alert goes to Friend 1. Nobody taps "I'm on it".
2. Panel: press +30 s. The alert moves to Friend 2's tab.
3. Friend 2 taps "I'm on it", then "Resolve".

Say: "The panel is our time machine. Each click stands for waiting. +30 s means the question went unanswered. +15 s means the louder stage went unanswered. The next +30 s means Friend 1 did not tap 'I'm on it'. So the alert moves on to the next friend. It does not stop at one person."

### 5. The phone loses connection (35 s)

Do:
1. Panel: press Trigger "manual".
2. On iPhone A, turn on airplane mode for real.
3. Panel: press +30 s, then +15 s.
4. Friend 1's phone shows the alert and the push.
5. Turn airplane mode off. Friend 1 taps "I'm on it", then "Resolve". Do it within 20 s of the +15 s press, or the alert moves to Friend 2 as well.

Say: "I just cut my phone off the network for real. Help still comes. The countdown lives on the server, not on my phone."

### 6. Privacy (20 s)

Do:
1. Panel: scroll to the Privacy view. Every contact shows "no" now.
2. Friend 1 and Friend 2 screens show no location and no alert.

Say: "Contacts see my location only while an alert runs, and only the people it reached. When it ends, they stop seeing it. Group members never learn about a duress alert."

### 7. VoiceOver (25 s)

Do: turn VoiceOver on, on iPhone A (the Accessibility Shortcut). Trigger a check from the panel. One double-tap on "Are you okay?" answers it. It says "Thanks!". Turn VoiceOver off.

Say: "The same check works with a screen reader."

### 8. Validation (10 s)

Say: "We have not tested this with real users yet. `VALIDATION.md` lists the studies and their targets."

### Optional: duress on the band

Do this beat only if the band duress gesture passed 10 of 10 on a retest. It has not passed yet, so skip it by default.

Hold the band button for 1 second, then tap twice. The band flashes once, like an ok. The phone shows "Thanks!". Friend 2 gets the alert.

## Timing

| Beat | Time |
|---|---|
| 0. Hook | 15 s |
| 1. A safe check | 30 s |
| 2. Silence | 85 s |
| 3. Duress with the PIN | 60 s |
| 4. Nobody answers | 45 s |
| 5. The phone loses connection | 35 s |
| 6. Privacy | 20 s |
| 7. VoiceOver | 25 s |
| 8. Validation | 10 s |
| Total | 5 min 25 s |

## If a beat fails

| Beat | Fallback |
|---|---|
| 1 | The band does not connect: tap the "Are you okay?" button once on the phone. Say the band is a prototype. |
| 2 | No push: open Homebound on iPhone B by hand and say the push passed in testing. No location: panel, "Set sample location". Ping does not ring: say the volume or the Ringer is off and move on. |
| 3 | The alert does not reach Friend 2: check the Friend 2 tab is on the right address. Reload it. If it still fails, show the panel: the alert is marked hidden and Friend 2 is listed. |
| 4 | A skip is wrong: press the next skip. The panel shows the stage. |
| 5 | Airplane mode drops the band too: say so. The server timer still runs. Show Friend 1's phone getting the alert. If the phone does not return, switch to the hotspot. |
| 6 | The privacy view is empty: press Trigger "manual" and skip 60 s once. Friend 1 (Tier 1) now shows location "yes". Friend 1 taps "I'm on it", then "Resolve". Friend 1 goes back to "no". |
| 7 | VoiceOver does not speak: skip it. Say it passed in testing. |
| Any | The tunnel is down: restart it, then enter the new address in Settings, Connection on both phones and in the Friend 2 tab. The server is down: run the same command again. Saved nights come back. Nothing works: play the backup video. |

## Hard questions

- Fumbled duress: it reads as ok and clears the check. This is deliberate, so a watcher sees nothing odd. We have not run the user study yet.
- Dead phone with a band duress: the band keeps the newest answer for 60 s, then it is lost. The server timer still escalates silence.
- Bluetooth sniffing: the prototype sends plain text. The product path is bonding and encryption.
- Accidental duress: only a duress contact can end a duress alert. A PIN cannot.
- Ask a friend misuse: a friend can ask for a check. A real build needs a rate limit and a log.
- Contact consent: contacts are not told their role yet. A real build asks them first.
- Time to help: the worst case is about one check interval plus the ask and grace times. That is about 16 min at 15 min checks with the demo timers, and about 18 min with real-build timers. Shorter checks shorten it.
- Detection: we do not detect drugging or unconsciousness. This is by design. We ask, and silence escalates.

## Do not claim

- The band duress gesture works. It failed once before the fix. The retest is pending.
- Find them with Bluetooth works on two phones. It did not pass on hardware.
- Battery life. We did not measure it.
- A reminder from a band wake works. It did not pass.
- Android or TalkBack works. We did not try it.
- Group separation works by itself. It is a panel trigger only.
- The band is wearable. It is an Arduino UNO R4 WiFi dev board on a power bank.
- A watcher cannot tell ok from duress. Tests compare the screens. They are not a study with people.
- Contacts are ranked by who is nearby or sober. The user orders the contacts in groups. The app does not rank them.
- Any call to 911 or a real contact. Everything is simulated.
- The 12 s band wake is a timed study. It is a few tries.
- The timers are real. They are demo values.

## What passed on hardware

Source of truth: the results table in `DEMO_NOTES.md`.

- Two iPhones and the band: pairing, band ok taps, the band asking, Ping (phone ring and band beep), state restoration, and advertising while connected.
- The heartbeat woke a locked phone in about 12 s, in a few tries.
- One iPhone 13 and browser contacts: the duress PIN, the hand-off to Tier 2, the ntfy push to a locked phone, a local reminder for a scheduled check, the VoiceOver check-in.
- Both iPhones: the themed header and the alert names.
- Real server restarts during a running night kept the nights.
- Tests: 305 server tests and 64 app node tests.
