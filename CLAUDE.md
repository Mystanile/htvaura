# Project KAZE (Hack the Valley 11)

## What we're building
A group safety app for the Project KAZE challenge: getting help to people who can't ask for it themselves (incapacitated, or watched by someone and unable to ask safely).

The product is the **check-in loop**, not the hardware. A wearable band is the best way to use it, but everything must work on a phone alone.

Core rule: **every trigger becomes a check first.** The user's device asks "are you okay?". One tap means fine. Only silence or the duress signal escalates.

### Features
- Groups: per night, end at a set time, anyone can leave silently. Recent groups are saved for one-tap setup. A saved group shares nothing until a night starts.
- Two modes:
  - Night out: friends nearby are alerted first, then a sober contact who isn't at the event.
  - Everyday: goes straight to chosen contacts.
- Triggers: be home by X time, group separation, manual duress, periodic check-in for solo use.
- Duress: one pattern that looks like a normal "I'm okay" but silently alerts. Goes only to contacts the user picked privately, never the whole group.
- Responder side: graded escalation, response cards (alerts say what to do), acknowledgement (contact must tap "I'm on it" or it moves to the next contact).
- Find them: during an active alert, friends get a screen that guides them to the person. GPS arrow when far, Bluetooth hotter/colder when close, "ping" to make the person's phone ring.
- Privacy: location is shared only during an active alert and stops when it's resolved.

### Out of scope
- No detecting drugging, intoxication, or unconsciousness. No diagnosis.
- No real 911 calls or real emergency contacts during testing. Everything is simulated.

## Stack
- Backend: Python + FastAPI. Holds the countdown, the state machine, and escalation so alerts continue if a phone disconnects.
- Live updates: WebSockets between server and apps.
- App: Expo (React Native).
- Demo control panel: a simple web page that can simulate events (phone disconnects, friend separates, contact doesn't respond, etc.) so each scenario can be triggered on command.
- BLE (Bluetooth Low Energy) is phase 2 only. It needs a custom Expo dev build. Do not start it until phase 1 is fully working.

## State machine
States: armed, asking, waiting, escalating, acknowledged, resolved, duress.
All transitions live on the server. Keep this logic in one module with no UI code in it so it can be tested on its own.

## The 7 KAZE scenarios (acceptance tests)
Each must have an automated test against the server logic:
1. Safe: user confirms they're okay, nothing escalates.
2. No response: user doesn't respond in the window, escalation starts.
3. Duress: user sends the duress signal, it looks like a normal confirm but silently alerts the chosen contacts.
4. Connectivity failure: phone disconnects after a countdown is registered, server keeps the countdown going and still escalates.
5. Unacknowledged alert: first contact doesn't acknowledge, it moves to the next contact.
6. False alarm: user or an authorized contact resolves an accidental alert safely.
7. Privacy: location and personal info are only shared per the user's settings and only during an active alert.

## Workflow
1. Read `PLAN.md` at the start of every session. If it doesn't exist, plan first in plan mode and write it, then wait for approval.
2. Work in phases from `PLAN.md`: loop and server, then app, then demo panel, then find-them, then BLE.
3. Hand each independent task to the `builder` subagent, in parallel where possible.
4. After each task, run the `tester` subagent. Nothing is done until its tests pass.
5. Update `PLAN.md` as you go: mark tasks done and note anything simulated or untested. Any fresh session should be able to continue from it.
6. At the end of each phase, give a short summary: what's done, what's simulated, what's untested.

## Git
- Commit after every working step with a clear message.
- Never commit broken code. Run the tests first.
- If something breaks badly, revert to the last working commit.

## Testing
- Server logic and the 7 scenarios must have automated tests that you run yourself.
- Bluetooth, real phones, and ESP32 hardware can't be tested automatically. Say so clearly and list what needs manual testing instead of claiming it works.

## Honesty for the judges
Keep a file `DEMO_NOTES.md` with three lists, updated as you build:
- Demonstrated: works for real in the prototype
- Simulated: faked through the demo panel
- Assumed: things the design relies on that would need real-world validation

## Style
- Keep code simple and readable. This is a 36-hour hackathon, not production.
- Prefer working and demoable over complete.
- Don't add features that aren't in `PLAN.md` without asking.
