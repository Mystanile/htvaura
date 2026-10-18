# Validation and path to product

The KAZE prototype shows the check-in loop with simulated alerts. This file lists the studies we plan before real use, and the work to turn the prototype into a product. We have not run any of these studies. Each target is a goal, not a result. What the prototype shows today is in `DEMO_NOTES.md`.

## What we would validate, and how

Every study uses simulated alerts only. No study uses alcohol, drugs, real incapacitation, or real emergency calls.

### 1. Gesture study under safe impairment proxies

- Question: if people are not at their best, can they still answer a check correctly?
- Method:
  - Volunteers answer prompted checks on the band and on the phone.
  - Each volunteer does each answer in three safe conditions that stand in for impairment: with the non-dominant hand, through a jacket, and while walking.
  - The prompt asks for "I'm okay" most of the time and for duress sometimes, in random order.
  - We log each gesture, the answer the band or app read, and the time to answer.
- Targets:
  - At least 95 percent of "I'm okay" answers are read as okay.
  - Under 1 percent of "I'm okay" answers are read as duress by accident.
  - We also report the time to answer and the share of correct duress answers.
- If the targets fail, we change the gesture timing in the app and the band sketch together, and run the study again.

### 2. Field pilot with volunteer friend groups

- Question: does the loop work on real nights out, without too many false alarms?
- Method:
  - Volunteer friend groups use the app on real nights out.
  - Contacts know it is a pilot. Every alert is marked as a test. Nobody calls emergency services from the app.
  - The server logs every check, every alert, every "I'm on it" and every resolve, with times.
- Targets:
  - False alarms: under 0.5 alerts per person per night that the person then marks as a mistake.
  - Time from silence to acknowledgement: with production timers, a median under 5 minutes from the end of the ask to the first "I'm on it".
  - At least 95 percent of alerts get an "I'm on it" before the final step.

### 3. Eight-hour pocket test of iOS background reliability

- Question: if the phone stays locked in a pocket all night, does the check still reach the band?
- Method:
  - An iPhone runs a night for 8 hours, locked, in a pocket, with the band connected.
  - A check comes every 15 minutes, so about 32 checks.
  - We log the time the server starts each check and the time the band buzzes. We also log the phone and band battery level each hour.
  - We repeat it on at least three different iPhones.
- Targets:
  - At least 95 percent of checks reach the band within 30 s.
  - No check is lost. A missed check still escalates through the server timer.
  - The phone uses under 15 percent of its battery for the app over the 8 hours.

### 4. Observer study on whether duress can be spotted

- Question: can a person who watches the user tell an okay from a duress?
- Method:
  - Volunteers answer checks with an okay or a duress while observers watch from close by.
  - The observers see the phone screen, the band, and hear any sound.
  - After each answer, the observer guesses okay or duress.
- Target:
  - Observers guess right no more often than chance. With at least 200 guesses, the 95 percent confidence interval of their accuracy includes 50 percent.

### 5. Privacy and retention review

- Question: does the system share and keep only what the user agreed to?
- Method:
  - A person outside the team reviews every data field: who can see it, when, and for how long.
  - An automated test checks every API response for each role (tier contact, duress contact, group member, stranger) before, during and after an alert.
  - The review checks the plan against Canadian privacy law (PIPEDA) and the app store rules.
- Targets:
  - The automated check finds zero fields shared outside the user's settings.
  - Location and night data are deleted within 24 hours after a night ends.
  - Each user can see and delete their own data.

## Path to product

- Push notifications: APNs on iOS and FCM on Android for the check on the user's phone and for alerts on the contacts' phones. If a push is late, the band heartbeat stays as a fallback.
- SMS fallback for contacts who do not have the app.
- A durable database instead of the state file on the laptop.
- Real auth on every route, and TLS everywhere, not only through the demo tunnel.
- Cost per night: count the server time, the pushes and the SMS for one night, and set a price or a sponsor model from that number.
- An Android app.
- A real wearable: an nRF52 board on a coin cell instead of the Arduino. Each band gets a rotating id, so many bands can be near each other without confusion and without being tracked.
- Contacts accept their role before a night. The notice they get does not reveal the duress feature.
- A venue or campus security tier: an optional last tier that reaches staff on site before the final step.
