# Homebound

Homebound is a safety app for people on a night out, with friends or alone. It gets help to someone who cannot ask for it themselves. Maybe they passed out after drinking. Maybe someone is with them and stops them from asking for help.

The person sets a schedule, for example every 15 minutes. On that schedule, the app asks "Are you okay?". Three quick taps mean yes. If the person does not answer, the people they chose get an alert. The alert moves from one group of these people to the next, until one of them taps "I'm on it".

These people need Homebound on their phones too. Homebound runs on iPhone and in a web browser. We have not tried it on Android.

We built Homebound in 36 hours at Hack the Valley 11, a student hackathon. We entered one of its challenges, Project KAZE, sponsored by Swapna Samuel. It asks teams to close the gap between two moments: when a person can no longer ask for help, and when someone else notices.

To learn what Homebound does, read up to "What is in this repository". The sections after that are for people who want to run the code.

## Words used in this README

- Night: one outing that the app watches over. It starts and ends when the person says so, at any time of day.
- Check: the question "Are you okay?". The person answers with three quick taps on the check-in button.
- Friends: people the person added in the app with a friend code.
- Contacts: the friends who get alerts. The person puts them in groups, in order: who hears first, and who hears next.
- "I'm on it": the button a contact taps to say they will help. It stops the alert from moving to the next group.
- PIN: a 4-digit code. The person types it under "Cancel an alert" to end an alert that went out by mistake.
- Duress: being threatened or forced by someone. The duress signal is a secret way to ask for help that looks like a normal answer.
- The band: an optional device with a button. The person can tap it instead of the phone. Ours is a prototype board, too big to wear yet, so for now the person carries it.
- The server: a program on a computer that the phones talk to over the internet. It keeps every timer.
- The demo panel: a web page we use during the demo to fake events. For example, it moves the server's clock forward, so that timers end sooner.

## How it works

The person starts a night in the app and picks how often to check. They put their contacts in groups and set a PIN. They also pick a second PIN, the duress PIN, and the contacts who get duress alerts. Nobody else sees the duress PIN or this list, not even the other contacts.

A check starts in one of these ways:

- the next scheduled check is due
- the "be home by" time passes (an optional time the person sets)
- a contact taps "Request check-in"
- the friends who went out together get separated (the app does not detect this yet, so we start it from the demo panel)

The phone asks the person. If they have the band, the band asks too. If they do not answer, the phone asks again more urgently and vibrates over and over. Then everyone in the first group of contacts gets an alert, with a card that says what to do. If nobody in that group taps "I'm on it" in time, the next group gets the alert. In the demo, each group has 20 seconds. In a real product, each group has a few minutes.

The server keeps the timers, not the phone. If the phone dies or loses its signal during a check, the countdown goes on and the alert still goes out.

The duress signal has two forms. The person holds the check-in button, on the phone or the band, for one second and then taps it twice. Or, when they are told to cancel an alert, they type the duress PIN instead of their real PIN. Either way, the phone looks the same as after a normal answer or a normal cancel. In secret, the server alerts the duress contacts, one at a time. The other contacts hear nothing about it. No PIN ends a duress alert, so a person who is forced to type their real PIN cannot cancel it. Only a duress contact can end it.

While a night runs, the phone sends its position to the server. Contacts see the position only during an alert. The person chooses who sees it: everyone who got the alert, or only the contact who tapped "I'm on it". When the alert ends, the server deletes the position.

A screen called "Find them" guides a contact to the person. From far away, it shows an arrow and the distance. A "Ping" button makes the person's phone ring. If the person has the band, the contact's phone also reads the band's Bluetooth signal. Close up, the screen then says "You're right next to them". This part is built but not yet tested on real hardware.

Even with the app closed, the phone reminds the person of each scheduled check. The reminder says only "Homebound: Open the app.". It looks the same for every check, so someone who reads the lock screen cannot tell what it is for. Contacts can also get alerts on a locked phone through ntfy, a free notification service.

Homebound does not detect drugging, drunkenness or unconsciousness. It does not call emergency services. If nobody in any group answers, a finished product calls emergency services at this point. This prototype does not. It only shows a warning on the demo panel and a line of text in the contacts' app.

The band is a small hobby circuit board, an Arduino UNO R4 WiFi, with a button, a touch sensor, a buzzer and a light. A phone power bank powers it.

## What is real and what is simulated

The challenge rules ask each team to write four separate lists: what the prototype really does, what is faked, what the design assumes, and what needs more testing. `DEMO_NOTES.md` has those four lists, and every hardware test with its date.

These worked on real iPhones and the band:

- with two iPhones and the band: pairing the band, answering a check with three taps on the band, the band asking, and Ping
- with two iPhones and the band: the band reaching the app while the phone was locked and the app was closed
- with one iPhone, and browser tabs on a laptop as the contacts' phones: the duress PIN, and the alert moving to the next group
- with one iPhone: alerts on a locked phone through ntfy, the check reminder, and checking in with VoiceOver (the iPhone screen reader for blind people)
- on both iPhones: every screen shows correctly, and each alert shows the right person's name
- we turned the server off and on during running nights, and no night was lost

These are built but not yet tested on real hardware:

- the duress signal on the band (it failed once, and the fix waits for a new test)
- the band's Bluetooth signal on the "Find them" screen

We have not measured the band's battery life yet.

These are faked from the demo panel: the friends getting separated, time passing, contacts who do not answer, and the final emergency step.

## The seven test cases from the challenge

The challenge asks every team to handle these seven cases. Each one has an automated test, a small program that runs the case against the server and checks the result. They are in `server/tests/test_scenarios.py`.

| Case | What happens | Test |
|---|---|---|
| 1. Safe | The person taps three times. Nobody gets an alert. | `test_1_safe` |
| 2. No response | The person stays silent. The first group of contacts gets an alert. | `test_2_no_response` |
| 3. Duress | The duress PIN or the duress signal on the button looks like a normal answer, and the duress contacts get an alert. | `test_3_duress`, `test_3_duress_pin_looks_like_a_real_cancel_but_alerts_the_duress_contacts` |
| 4. Lost connection | The phone goes offline during a check. The server still sends the alert. | `test_4_connectivity_failure` |
| 5. Nobody answers | Nobody taps "I'm on it". The alert goes to the next group. | `test_5_unacknowledged_alert` |
| 6. False alarm | The person types their PIN, or the contact who tapped "I'm on it" ends the alert. | `test_6_false_alarm_user_resolves`, `test_6_false_alarm_acknowledging_contact_resolves` |
| 7. Privacy | Contacts see the position only during an alert, and only the contacts the person allowed. | `test_7_privacy` |

## What is in this repository

Before we named the app Homebound, we used two working names. Some folders and settings still use them: "kaze" for the server and the band, and "safekeeps" for the phone app. They are all part of Homebound. The repository itself is named htvaura.

| Path | What it holds |
|---|---|
| `server/` | The server, written in Python: the check-in logic (`kaze/loop.py`), the requests the app sends, the demo panel, and the tests |
| `safekeeps/` | The phone app, built with Expo, a toolkit for phone apps |
| `Hardware/kaze_band/` | The band's program (`kaze_band.ino`) and its notes (`HARDWARE.md`) |
| `DEMO_SCRIPT.md` | The demo we give to an audience, step by step |
| `DEMO_NOTES.md` | What is real, faked and assumed, and the hardware test results |
| `VALIDATION.md` | The studies we plan, and the path to a real product |
| `API.md` | Every request the app can send to the server |
| `CODE_TOUR.md` | A walk through the code. Start here to change the code. |
| `PLAN.md` | The design decisions, the build log, and the one-time iPhone setup |

## Run it

The fastest way to try Homebound needs one laptop only. Run the server and the web app, and use two browser tabs as two phones. For this, skip step 2 and step 5.

You need:

- the code: `git clone https://github.com/Mystanile/htvaura.git`, then `cd htvaura` (the repository is private: ask its owner, Mystanile on GitHub, for access)
- Python 3 and Node.js (we use Python 3.14 and Node.js 26)
- for real phones: `cloudflared`, a free tool that makes the tunnel in step 2. On a Mac, install Homebrew from brew.sh, then run `brew install cloudflared`.
- for the iPhone app: a Mac with Xcode, and an iPhone with a cable
- for the band: an Arduino UNO R4 WiFi and the Arduino IDE

Each step below runs in its own terminal window, opened in the top folder of the repository. Each command starts and ends with round brackets ( ). Because of them, you are back in the top folder after the command.

### 1. Start the server (window 1)

Install it once:

```
(cd server && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt)
```

Choose a password for the demo panel. Put it in place of `your-key`, then start the server:

```
(cd server && KAZE_DEMO_KEY=your-key .venv/bin/uvicorn kaze.app:app --host 0.0.0.0 --port 8000)
```

The server keeps running in this window. Leave it open. To stop it, press Ctrl+C.

`KAZE_DEMO_KEY` is an environment variable, a setting you put before the command. This table lists all of them. For the demo, you need only `KAZE_DEMO_KEY`.

| Variable | What it does |
|---|---|
| `KAZE_DEMO_KEY` | The password for the demo panel. Without it, anyone with the server's address can use the panel, and the server prints a warning. |
| `KAZE_STATE` | The file where the server saves running nights, once a second. The default is `server/kaze_state.pickle`. After a restart, the server loads the nights from it. |
| `SAFEKEEPS_DB` | The file for accounts and friends. The default is `server/safekeeps.sqlite3`. |
| `KAZE_NTFY_URL` | Turns on alerts to contacts' locked phones through ntfy, for example `https://ntfy.sh`. See step 6. |
| `KAZE_NTFY_SECRET` | Needed with `KAZE_NTFY_URL`. Use a long random string. It makes each contact's topic name hard to guess. See step 6. |

### 2. Give the server a public address (window 2)

You need this step only for real phones. Many Wi-Fi networks block a phone from reaching a laptop. A tunnel solves this. It gives the server a public web address, so phones on any network can reach it.

```
cloudflared tunnel --url http://localhost:8000
```

It prints an address such as `https://some-words.trycloudflare.com`. This is your server address. You get a new address each time you start the tunnel. Leave this window open.

### 3. Run the app (window 3)

The app uses Bluetooth to talk to the band. Expo Go, Expo's ready-made test app, cannot use our Bluetooth code. So use the web version or an iPhone build.

The web version runs everything except the band and the lock-screen reminders. Put your server address in place of `<server address>`. With browser tabs on this laptop, the server address is `http://localhost:8000`.

```
(cd safekeeps && npm install && EXPO_PUBLIC_API_URL=<server address> npx expo start)
```

In this window, press `w`. The app opens in your browser. For the second person, open the same address in a new tab. Do not duplicate the tab, because a copy starts as the same account.

The iPhone build has everything, including the band. Before your first build, do the one-time setup in `PLAN.md`, section "iPhone build". Plug the iPhone into the Mac. Run `xcrun devicectl list devices` to find its device ID, which Apple calls the UDID. Then run this, with your server address and the UDID:

```
(cd safekeeps && CI=1 EXPO_PUBLIC_API_URL=<server address> npx expo run:ios --device <UDID> --configuration Release --no-bundler)
```

This puts the app on the phone. The app then runs without the laptop, so every change to the code needs a new build. If the server address changes, you do not need a new build. In the app, open Settings, Connection, and enter the new address.

To start using it:

1. On each phone or browser tab, tap "Start demo". This makes an account.
2. On phone A, find "Your friend code" on the Home screen.
3. On phone B, go to "Add a friend" on the Home screen. Type the code in "Friend code" and tap "Send friend request".
4. On phone A, tap "Accept".
5. On phone A, tap "Start a night" and pick phone B as a contact.

### 4. Open the demo panel

In a laptop browser, open your server address followed by `/panel`, for example `http://localhost:8000/panel`. Type the password you chose in step 1.

The panel shows every running night, including duress alerts that the person's own phone hides. It can start a check, mark a phone as offline, set a position, skip time, and reset. It also has a guide to the seven test cases. Reset ends every night. Accounts made with "Start demo" stay, so you do not need to add friends again.

To skip 60 seconds without the panel, run this with your server address and password:

```
curl -X POST "<server address>/demo/skip" -H 'X-Demo-Key: your-key' -H 'content-type: application/json' -d '{"seconds": 60}'
```

### 5. Set up the band

Put the band's program onto the board with the Arduino IDE:

1. Connect the board to the laptop with a USB cable.
2. In the Arduino IDE, open `Hardware/kaze_band/kaze_band.ino`.
3. Open Tools, Board, Boards Manager. Install "Arduino UNO R4 Boards". Then select the board "Arduino UNO R4 WiFi".
4. Open Tools, Manage Libraries. Install "ArduinoBLE".
5. Under Tools, Port, select the board's port.
6. In the program, make sure that `QUIET_MODE` is `false`, so the buzzer sounds. Set it to `true` only to test quietly around other people.
7. Click Upload.

Then pair it in the app. Open Settings and tap "Pair band". Home shows "Band connected". The server takes answers from the band only while a night runs. The wiring, the Bluetooth details and the gestures are in `Hardware/kaze_band/HARDWARE.md`.

### 6. Turn on notifications

The check reminders need no setup. When the app asks, allow notifications.

Alerts to contacts' locked phones are optional. ntfy sends a message to every phone that follows a channel, which ntfy calls a topic. Each contact gets their own topic, with a name that is hard to guess. To turn it on:

1. Stop the server with Ctrl+C.
2. Start it again with two more variables before the command: `KAZE_NTFY_URL=https://ntfy.sh` and `KAZE_NTFY_SECRET=` followed by a long random string.
3. In Homebound, each contact opens Settings. Their topic is under "Get alerts when the app is closed".
4. Each contact installs the ntfy app and follows that topic.

The message says only "A Homebound alert is waiting for you. Open the app.". It has no name and no position. ntfy stands in for Apple's own notification service, which needs a paid Apple developer account. We do not have one.

### Run the tests (optional)

The tests check the server and the app's logic without a phone. Run them in a new window, after step 1 and the `npm install` in step 3:

```
(cd server && .venv/bin/pytest -q)
(cd safekeeps && node --test src/services/*.test.ts)
```
