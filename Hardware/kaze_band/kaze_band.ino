// KAZE band prototype: Arduino UNO R4 WiFi + Grove shield
// Button D2, touch sensor D3, buzzer D4, LED D5
//
// BLE:
//   Advertises as "KAZE-Band"
//   "event" characteristic (notify only, no read): 1 = I'm okay, 2 = duress, 3 = heartbeat
//     After each answer the band writes 0, so the last answer never stays readable.
//     An answer made with no phone connected is kept (only the newest one) and sent
//     about 1 s after a phone connects, so the phone has time to subscribe.
//     The heartbeat goes out every 20 s while a phone is connected. It wakes the
//     phone's app in the background so it can check the server for a pending ask.
//   "ping" characteristic (write): any value makes the band beep and flash
//   "ask" characteristic (write): any value starts a gentle "are you okay?" signal
//     (slow LED blink, soft buzz) until the user answers or 30 s pass
//
// Gestures (button or touch, they work the same):
//   3 short taps within 1.5 s        -> I'm okay
//   Hold 1 s, then two short taps     -> duress
//   Both give the same short beep so nobody watching can tell them apart.

#include <ArduinoBLE.h>

const int BUTTON = 2, TOUCH = 3, BUZZER = 4, LED = 5;

const unsigned long HOLD_MS = 1000;           // hold length that arms duress
const unsigned long DURESS_WINDOW_MS = 2500;  // time allowed for the two duress taps
const unsigned long OK_WINDOW_MS = 1500;      // max gap between okay taps before the count resets
const unsigned long DEBOUNCE_MS = 60;
const unsigned long ASK_MS = 30000;  // how long the band keeps asking
const bool QUIET_MODE = false;       // false for the demo. true = no buzzer, LED only, for testing around people

const uint8_t EVENT_OK = 1;
const uint8_t EVENT_DURESS = 2;
const uint8_t EVENT_HEARTBEAT = 3;
const unsigned long HEARTBEAT_MS = 20000;  // how often a connected phone is woken
const unsigned long SUBSCRIBE_MS = 1000;   // wait after connect so the phone can subscribe before a pending answer is sent

BLEService kazeService("7f1a0001-6b4e-4c2a-9a7e-2d3c4b5a6f70");
BLEByteCharacteristic eventChar("7f1a0002-6b4e-4c2a-9a7e-2d3c4b5a6f70", BLENotify);
BLEByteCharacteristic pingChar("7f1a0003-6b4e-4c2a-9a7e-2d3c4b5a6f70", BLEWrite);
BLEByteCharacteristic askChar("7f1a0004-6b4e-4c2a-9a7e-2d3c4b5a6f70", BLEWrite);

bool asking = false;
unsigned long askUntil = 0;
unsigned long lastAskBlink = 0;

bool wasPressed = false;
unsigned long pressStart = 0;
unsigned long lastChange = 0;

bool duressArmed = false;
int duressTaps = 0;
unsigned long duressDeadline = 0;

int okTaps = 0;
unsigned long lastOkTap = 0;

bool rawPressed = false;
unsigned long rawSince = 0;

bool wasConnected = false;
unsigned long lastHeartbeat = 0;
unsigned long connectedAt = 0;

uint8_t pendingEvent = 0;  // answer not yet sent to a phone (0 = none). A newer answer replaces it.
unsigned long pendingAt = 0;
const unsigned long PENDING_MS = 60000;  // a stored answer older than this is dropped, the same for ok and duress, so it can never answer a later check

bool isPressed() {
  return digitalRead(BUTTON) == HIGH || digitalRead(TOUCH) == HIGH;
}

void buzz(bool on) {
  digitalWrite(BUZZER, (on && !QUIET_MODE) ? HIGH : LOW);
}

void confirmBeep() {
  // Same feedback for okay and duress
  buzz(true);
  digitalWrite(LED, HIGH);
  delay(80);
  buzz(false);
  digitalWrite(LED, LOW);
}

void pingAlarm() {
  // Loud, obvious pattern so a friend can find the band
  for (int i = 0; i < 10; i++) {
    buzz(true);
    digitalWrite(LED, HIGH);
    delay(150);
    buzz(false);
    digitalWrite(LED, LOW);
    delay(100);
  }
}

void sendEvent(uint8_t ev) {
  asking = false;
  okTaps = 0;
  duressArmed = false;
  duressTaps = 0;
  digitalWrite(LED, LOW);
  // Always queue, sent from loop(). Feedback is the same whether a phone is connected or not.
  pendingEvent = ev;
  pendingAt = millis();
  Serial.println(ev == EVENT_OK ? "event: OK" : "event: DURESS");
  confirmBeep();
}

void flushPending(bool connected) {
  if (pendingEvent != 0 && millis() - pendingAt > PENDING_MS) {
    pendingEvent = 0;  // too old: the server timer handles this check
    Serial.println("stored answer expired");
  }
  if (pendingEvent == 0 || !connected || millis() - connectedAt < SUBSCRIBE_MS) return;
  // writeValue reports success even with no subscriber, so wait until the phone subscribed.
  if (!eventChar.subscribed()) return;
  eventChar.writeValue(pendingEvent);
  eventChar.writeValue(0);  // clear it so the answer never lingers on the band
  pendingEvent = 0;
  Serial.println("event sent to phone");
}

void onRelease(unsigned long heldFor, unsigned long now) {
  Serial.print("released after ");
  Serial.print(heldFor);
  Serial.print(" ms");
  Serial.println(duressArmed ? " (counting duress taps)" : "");

  if (heldFor >= HOLD_MS) {
    // Long hold: wait for two quick taps
    duressArmed = true;
    duressTaps = 0;
    okTaps = 0;
    duressDeadline = now + DURESS_WINDOW_MS;
    Serial.println("long hold: waiting for 2 taps");
    return;
  }

  if (duressArmed) {
    duressTaps++;
    if (duressTaps >= 2) {
      sendEvent(EVENT_DURESS);
    }
    return;
  }

  // Short taps: 3 within the window means okay
  lastOkTap = now;
  okTaps++;
  Serial.print("OK tap count: ");
  Serial.println(okTaps);

  if (okTaps >= 3) {
    sendEvent(EVENT_OK);
  }
}

void setup() {
  pinMode(BUTTON, INPUT);
  pinMode(TOUCH, INPUT);
  pinMode(BUZZER, OUTPUT);
  pinMode(LED, OUTPUT);
  Serial.begin(9600);

  if (!BLE.begin()) {
    Serial.println("BLE failed to start. Try Tools > Firmware Updater.");
    while (true) {
      digitalWrite(LED, !digitalRead(LED));
      delay(200);
    }
  }

  BLE.setLocalName("KAZE-Band");
  BLE.setAdvertisedService(kazeService);
  kazeService.addCharacteristic(eventChar);
  kazeService.addCharacteristic(pingChar);
  kazeService.addCharacteristic(askChar);
  BLE.addService(kazeService);
  eventChar.writeValue(0);
  BLE.advertise();

  Serial.println("Advertising as KAZE-Band");
}

void loop() {
  BLE.poll();

  bool connected = BLE.connected();
  if (connected && !wasConnected) {
    // The radio stops advertising when a phone connects. Start it again so a
    // friend's phone can still see the band's signal strength during find-them.
    BLE.advertise();
    lastHeartbeat = millis();
    connectedAt = millis();
    Serial.println("phone connected, advertising again");
  }
  wasConnected = connected;

  flushPending(connected);

  if (connected && millis() - lastHeartbeat > HEARTBEAT_MS) {
    lastHeartbeat = millis();
    eventChar.writeValue(EVENT_HEARTBEAT);
  }

  if (pingChar.written()) {
    Serial.println("ping received");
    pingAlarm();
  }

  if (askChar.written()) {
    Serial.println("ask received: are you okay?");
    asking = true;
    askUntil = millis() + ASK_MS;
    buzz(true);
    delay(40);
    buzz(false);  // one soft nudge
  }

  if (asking) {
    if (millis() > askUntil) {
      asking = false;  // phone/server decides what silence means
      digitalWrite(LED, LOW);
      Serial.println("ask timed out (no answer)");
    } else if (millis() - lastAskBlink > 500) {
      lastAskBlink = millis();
      digitalWrite(LED, !digitalRead(LED));
    }
  }

  unsigned long now = millis();
  bool raw = isPressed();
  if (raw != rawPressed) {
    rawPressed = raw;
    rawSince = now;
  }

  if (rawPressed != wasPressed && now - rawSince >= DEBOUNCE_MS) {
    if (rawPressed) {
      pressStart = rawSince;
    } else {
      onRelease(rawSince - pressStart, now);
    }
    wasPressed = rawPressed;
  }

  // Long hold with no follow-up taps: treat as okay so it never looks odd
  if (duressArmed && now > duressDeadline) {
    duressArmed = false;
    duressTaps = 0;
    sendEvent(EVENT_OK);
  }

  // Okay taps that never reached 3: forget them so a later bump can't complete them
  if (okTaps > 0 && now - lastOkTap > OK_WINDOW_MS) {
    Serial.println("OK taps reset");
    okTaps = 0;
  }
}
