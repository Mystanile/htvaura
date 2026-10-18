## Inspiration
We both use Life360 with our friends and family. It is good at showing where everyone is, but it does not help much when someone actually needs help. A dot on a map does not tell anyone that something is wrong. Somebody has to be looking at the map, and the person in trouble has to be able to press SOS.

The project brief was intriguing to us because it asked us to solve this exact gap. We thought this problem was something a lot of people suffer from, and a solution to it could benefit many.

## What it does
You start a night and assign tiers to friends based on the priority of who should receive alerts first. From then on, every trigger becomes the same question on your phone and your band: "Are you okay?" A trigger can be a check every few hours, a "be home by" time, or a friend asking for a check.

One tap on the phone, or three taps on the band, means you are fine, and nobody hears about it. If you do not answer, the phone asks again louder. Then your first group gets an alert with a card that says what to do and what not to do. One of them taps "I'm on it". If nobody does, the alert moves to the next group, and it keeps going until someone takes it.

The friend who takes it gets a "Find Them" screen. It shows a GPS arrow from far away, and the band's Bluetooth signal up close. A Ping button makes your phone ring and the band beep.

If someone is watching you, you can ask for help without them knowing. Typing a second "duress" PIN shows the same "Alert ended" screen as your real PIN. On the band, you hold for one second and tap twice, and it flashes and beeps exactly like an okay. Either way, only the contacts you picked in private get a silent alert. No PIN can cancel it, so nobody can force you to call it off.

Friends see your location only while an alert is running, and only the ones it reached. When the alert ends, the server deletes it.

## How we built it
The server is Python and FastAPI. All the safety rules live in one state machine with no web code and no clock in it. The server feeds it the time, so our demos can skip delays to save time. Every countdown lives on the server, not on the phone. If your phone dies or loses signal mid-check, the server still sends the alert on time. It saves every running night to a file once a second, so a server restart loses almost nothing.

The app is React Native with Expo and runs on iPhone and in a web browser. The phone asks the server for news every 2.5 seconds. Friends get alerts on a locked phone through the free ntfy app, and the push says only "A Homebound alert is waiting for you. Open the app.", with no name and no location.

The band is an Arduino UNO R4 WiFi with a Grove button, a touch sensor, a buzzer and an LED, running off a power bank. It uses Bluetooth Low Energy. It sends the phone one byte per answer, and the phone writes to it to make it buzz or beep. 

## Challenges we ran into
The "Find Them" screen was initially supposed to say "hotter" and "colder" from the band's signal strength. Measuring the bluetooth signal strength right next to the band read -41 dBm, but from about 1 meter away up to where the signal is lost, the strength stays between -75 dBm to -85 dBm. A body or a wall changed the value more than distance in testing. Additionally,  walking away sometimes showed "closer" during tests. To fix this problem, we changed the outputs to "Right next to them" and "In Range" with a button to ping the friend's phone and band so it can be heard. 


## Accomplishments that we're proud of
Everything in the demo runs on two real iPhones, our band and our server. During testing we turned on airplane mode on the user's phone, and the friend's locked phone still got the alert. We restarted the live server in the middle of running nights and no night was lost. The band's duress gesture passed 4 out of 4 tries on the touch sensor, and a check-in works with VoiceOver in one double-tap. 

## What we learned
Testing on real phones found problems our pytests could not. Our first “Find Them” design looked fine in the code, then fell apart the first time one of us walked away from the band. We also learned how little an iPhone lets an app do in the background, which is why the band has a heartbeat. And we learned that the hard part of a duress feature is making sure nothing on the screen changes.

## What's next for Homebound
Test it with real people. The accuracy observed during our testing should be maintained in a larger population of testers. After that, a real wearable with a vibration motor instead of a buzzer, real push notifications through Apple's Developer Program, contacts who agree to their role first, an encrypted Bluetooth link, and ultra-wideband radio so the "Find Them" screen can point an arrow when you are a few meters away.


