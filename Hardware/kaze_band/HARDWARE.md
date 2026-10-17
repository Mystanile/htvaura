# KAZE Band: Hardware Spec

The band is the physical way to answer check-ins. It does not decide anything. It sends taps and receives commands. The server owns all timing and escalation.

Sketch: `Hardware/kaze_band/kaze_band.ino`

## Parts

- Arduino UNO R4 WiFi (built-in BLE) with a Grove shield
- Grove button on **D2**
- Grove touch sensor on **D3** (works exactly like the button, can be hidden under fabric)
- Grove buzzer on **D4**
- LED (Grove LED socket) on **D5**
- Powered by USB from a power bank. Runs with no laptop attached.

## Bluetooth (BLE)

Device name: **`KAZE-Band`**

| Name | UUID | Properties | Meaning |
|---|---|---|---|
| Service | `7f1a0001-6b4e-4c2a-9a7e-2d3c4b5a6f70` | | KAZE service, advertised |
| event | `7f1a0002-6b4e-4c2a-9a7e-2d3c4b5a6f70` | Read, Notify | Band → phone. One byte per answer |
| ping | `7f1a0003-6b4e-4c2a-9a7e-2d3c4b5a6f70` | Write | Phone → band. Any byte makes it beep and flash so a friend can find it |
| ask | `7f1a0004-6b4e-4c2a-9a7e-2d3c4b5a6f70` | Write | Phone → band. Any byte starts the "are you okay?" signal |

### Event values

| Value | Meaning |
|---|---|
| `0x00` | Nothing yet (value at startup) |
| `0x01` | I'm okay |
| `0x02` | Duress |
| `0x03` | Heartbeat. Not an answer. Sent every 20 s while a phone is connected |

The app must **subscribe to notifications** on `event` to receive taps.

## Gestures

Button and touch sensor work the same way.

| Gesture | Result |
|---|---|
| 3 short taps within 1.5 s | `0x01` I'm okay |
| Hold 1 s, then 2 short taps within 2.5 s | `0x02` Duress |
| Hold 1 s, then nothing | `0x01` I'm okay (after 2.5 s, so a stray hold never looks odd) |
| 1 or 2 taps, then nothing | Nothing sent. Count resets after 1.5 s |

Okay and duress give **the exact same single short flash/beep**. A person watching cannot tell them apart. This is on purpose.

## Band behaviour

**Ask** (write to `ask`): one soft buzz, then the LED blinks slowly for 30 s.
- Any answer (`0x01` or `0x02`) stops the blinking.
- If 30 s pass with no answer, the blinking stops and **nothing is sent**.

**The band never reports silence.** The server started its own timer when it sent the ask, and it escalates if no answer arrives. This also covers the band dying or disconnecting mid-ask.

Timeout must never be treated as `0x02`. Duress goes only to private duress contacts. Silence goes through normal escalation (friend nearby, then group, then sober contact).

**Heartbeat** (`0x03` on `event`, every 20 s while a phone is connected): iOS wakes a backgrounded app for each notification from a connected band. On each wake the app asks the server for its state and writes `ask` if a check is waiting, or `ping` if a friend pinged. Without it, a phone in a pocket would never learn about a new check, because the free Apple signing cannot use push notifications. Cost: an ask or ping can reach the band up to 20 s late. The server timer still covers silence.

**Advertising while connected:** the radio stops advertising when a phone connects (ArduinoBLE re-enables it only after a disconnect). The sketch calls `BLE.advertise()` again on connect, so a friend's phone can still read the band's signal strength during find-them.

**Ping** (write to `ping`): 10 loud beeps and flashes over about 2.5 s.

**Quiet mode:** `QUIET_MODE = true` in the sketch turns the buzzer off (LED only) for testing around people. **Set it to `false` for the demo.**

## How the band connects to the server

The band only speaks BLE. Something in the middle passes messages both ways:

- Server says "ask this user" → write any byte to `ask`
- Band notifies `0x01` → send "I'm okay" for that user
- Band notifies `0x02` → send duress for that user
- Friend taps "Ping" during find-them → write any byte to `ping`

## Signal strength (RSSI), measured at the venue

Measured with nRF Connect at HTV.

| Distance | RSSI |
|---|---|
| Right beside | -41 dBm |
| 1 m | -75 dBm |
| 2 m | -79 dBm |
| 5 m | -77 to -83 dBm |
| 8 m | -88 dBm |
| Across the room (about 20 m) | -82 dBm |

Big jump between right beside and 1 m. Past 1 m it's mostly noise (bodies, walls, which way the board faces).

### Hotter and colder (find them)

| Zone | RSSI | Show |
|---|---|---|
| Right here | stronger than -55 | "You're right next to them" + Ping button |
| Close | -55 to -80 | "Getting close" |
| In range | weaker than -80 | "They're somewhere nearby" |

- Smooth with the **median of the last 3 to 5 seconds**, never a single reading.
- Show **warmer / colder** from whether the smoothed value is rising or falling.

### Group separation

Do **not** use an RSSI cutoff. 2 m and 20 m look the same indoors. Treat someone as separated when their band's signal is **lost entirely for 30+ seconds**.

## Tested

- `0x01` and `0x02` received over notify in nRF Connect
- Ping and ask writes work
- Disconnect and reconnect works without resetting the board
- Runs from a power bank with no laptop

Not tested on the board yet (it compiles): the heartbeat, and advertising again while connected. To test the second: connect with nRF Connect on one phone, then scan with a second phone. KAZE-Band must still show.

## Not built (future work)

- Vibration motor (no motor available, buzzer + LED used instead)
- Real wearable housing and battery
- UWB for a real indoor direction arrow