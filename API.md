# KAZE server API

This file tells you how to build the Expo app against the KAZE server. You do not need to read the Python. Every JSON example below came from a real call to the server.

## 1. Run the server and connect

Start the server on the laptop:

```
cd server
.venv/bin/uvicorn kaze.app:app --host 0.0.0.0 --port 8000
```

The base URL is `http://<laptop-ip>:8000`. Expo Go on a phone cannot use `localhost`. Use the laptop's Wi-Fi IP address. If the venue Wi-Fi blocks phone-to-laptop traffic, run a `cloudflared` tunnel. Then use the `https://` tunnel URL for REST and the `wss://` form of it for WebSocket.

The WebSocket URL is `ws://<laptop-ip>:8000/ws/<id>`, where `<id>` is a user id.

Rules that apply everywhere:

- There is no login. A user id is the only identity. Anyone who knows an id can act as that user.
- All REST bodies and responses are JSON.
- All state lives in server memory. If the server restarts, every user, group, and session is gone. Handle a 400 or 404 by sending the user back to setup.
- Ids are short hex strings. A user id looks like `3f9a1c2e`. A group code looks like `A3F9`.
- Time is in seconds, as floating point numbers. A `deadline` is a Unix timestamp on the server clock. Section 9 shows how to count down with it.

## 2. The big picture

Each person who uses the check-in has one session per night. The server runs the countdowns. The alert keeps going if the user's phone dies.

The user's phone shows one of a few screens (section 7). Contacts' phones show an alert card (section 4). Everything the phone shows comes from a WebSocket message or from `GET .../view`.

Who opens a WebSocket: every person who uses the app opens `/ws/<their own user id>`. That includes the user, the friends in the group, and the contacts. The server sends each person only the messages meant for them.

## 3. REST endpoints

### POST /users

Creates a user. Call it once on first launch and save the id on the phone.

Request:

```json
{"name": "Alice"}
```

Response (200):

```json
{"user_id": "3f9a1c2e"}
```

The server keeps the name. Only `GET /groups/{code}` returns names, and only for the members of that group. Contacts outside the group have no name from the server. Keep a name map on the phone for them.

### POST /groups

Creates a group. The creator becomes the first member.

Request:

```json
{"user_id": "3f9a1c2e"}
```

Response (200):

```json
{"code": "A3F9"}
```

Errors: 400 if the user id is unknown.

### POST /groups/{code}/join

Joins a group by its code. Joining twice does nothing.

Request:

```json
{"user_id": "7b21d0a4"}
```

Response (200):

```json
{"code": "A3F9", "members": ["3f9a1c2e", "7b21d0a4"]}
```

The `members` list holds ids only, in join order.

Errors: 404 if the group code is unknown. 400 if the user id is unknown.

### GET /groups/{code}

Returns the members of a group with their names. Use it to show the group list.

```
GET /groups/6060
```

```json
{"code": "6060", "members": [{"user_id": "eaee84e6", "name": "Alice"}, {"user_id": "092ca050", "name": "Ben"}]}
```

Errors: 404 if the group code is unknown. Example: `{"detail": "unknown group ZZZZ"}`.

### POST /sessions

Starts a night for one user. The group's members become the people who see "left" messages. Every contact in `tiers` and `duress_contacts` needs to be a user already.

Request:

```json
{
  "user_id": "3f9a1c2e",
  "pin": "4821",
  "group_code": "A3F9",
  "tiers": [["7b21d0a4"], ["c40e88b1", "e2a07b33"], ["19dd5f67"]],
  "duress_contacts": ["50c6a9d8", "8d14f2ce"],
  "share_location_with": "alerted",
  "ask_seconds": 30,
  "grace_seconds": 15,
  "ack_seconds": 20
}
```

Fields:

| Field | Required | Meaning |
|---|---|---|
| `user_id` | yes | The person who is out. |
| `pin` | yes | The cancel PIN, as a string. The server compares it exactly. |
| `tiers` | yes | Ranked list of lists of contact ids. Tier 1 is alerted first. |
| `duress_contacts` | yes, at least one | Private ranked list. Each contact is its own tier. They are never shown to the group. |
| `group_code` | no | Leave it out for solo use. |
| `share_location_with` | no, default `"alerted"` | `"alerted"` means every alerted contact sees the location. `"acknowledger"` means only the contact who tapped "I'm on it". |
| `ask_seconds` | no, default 30 | How long the user has to tap "I'm okay". |
| `grace_seconds` | no, default 15 | How long the loud alarm runs before contacts are alerted. |
| `ack_seconds` | no, default 20 | How long a tier has to tap "I'm on it" before the next tier is alerted. |
| `night_ends_at` | no | Server Unix time when the night ends. See section 9. |

Response (200). The `view` is the user's own view (section 5):

```json
{"user_id": "3f9a1c2e", "view": {"state": "armed", "screen": "armed", "deadline": null}}
```

Errors:

- 404 if `group_code` is unknown.
- 400 if `share_location_with` is not `"alerted"` or `"acknowledger"`.
- 400 if the user or any contact id is unknown. Example: `{"detail": "unknown user ffffffff"}`.
- 400 if `duress_contacts` is empty. The response is `{"detail": "duress_contacts must not be empty"}`. Always ask the user to pick at least one duress contact.
- 409 if this user already has a live alert. The response is `{"detail": "session busy"}`. The old session stays as it was, and nothing is replaced. A live alert means the state is `escalating`, `acknowledged`, or duress. The user's own view cannot tell you this. A duress alert looks like `armed`. So always be ready for a 409 when you start a night, and show a neutral message such as "Could not start right now". Do not retry in a loop. The alert must end first.
- 422 if a required field is missing. Example: `{"detail": [{"type": "missing", "loc": ["body", "pin"], "msg": "Field required", "input": {...}}]}`.

Starting a session for a user whose old session is not in a live alert replaces the old session. This is how a new night starts.

### POST /sessions/{user_id}/events

Sends one event to a session. Section 6 lists the event types. The path id is always the session owner's id. This is also true for events from a contact, such as "I'm on it".

Request:

```json
{"type": "Trigger", "kind": "manual"}
```

Response (200):

```json
{"ok": true}
```

The response is always `{"ok": true}` when the event is well formed. That includes events the server ignores, such as a tap on "I'm okay" when nothing is being asked. Look at the WebSocket messages or the view to see what happened.

Errors:

- 404 if the user has no session. Example: `{"detail": "no session for ffffffff"}`.
- 400 if `type` is missing or unknown. Example: `{"detail": "unknown event type Nope"}`.
- 400 if `pin` is present and is not a string. Example: `{"detail": "pin must be a string"}`. The PIN must be a JSON string, like `"0042"`. The server does not turn a number into a string, because a number loses its leading zeros. A `pin` of `null` is allowed, and counts as no PIN.
- 400 if the fields do not fit the event. Example: `{"detail": "bad fields for Ack: Ack.__init__() missing 1 required positional argument: 'contact_id'"}`.
- 400 if a Trigger `kind` is not one of the four allowed kinds. Example: `{"detail": "kind must be one of ('home_by', 'separation', 'periodic', 'manual')"}`.

### GET /sessions/{user_id}/view?viewer={id}

Returns what `viewer` is allowed to see about this session. Call it when the app opens, returns to the foreground, or reconnects its WebSocket. Messages sent while no socket was open are lost, and this call catches you up.

Example, the owner viewing their own session:

```
GET /sessions/3f9a1c2e/view?viewer=3f9a1c2e
```

```json
{"state": "asking", "screen": "asking", "deadline": 1792204403.849629}
```

Errors: 404 if the user has no session. The `viewer` parameter is required. A missing one gives 422.

### GET /time

Returns the server clock. It includes the demo offset from `/demo/skip`. Section 9 explains how to use it for countdowns.

```json
{"now": 1792204796.2023091}
```

### GET /alerts?viewer={id}

Returns every active alert that this viewer may see. A contact calls it when the app opens, returns to the foreground, or reconnects its WebSocket. It replaces the need to know the owner's id in advance. Each item is the same object as the "active" view in section 5. It includes `user_id`, so you know whose alert it is.

```
GET /alerts?viewer=092ca050
```

```json
{"alerts": [{"user_id": "eaee84e6", "active": true, "kind": "manual", "card": {"title": "Asked for a check and did not answer", "do": ["Call or text them now", "Go to their location if you can"], "dont": ["Do not ignore this alert"]}, "acknowledged_by": null, "location": [43.6532, -79.3832]}]}
```

When nothing is active for this viewer:

```json
{"alerts": []}
```

The list holds only alerts where the server alerted this viewer, and only while the alert is live. It never shows a tier that has not been alerted yet. It never shows a duress alert to someone who is not a duress contact. Errors: a missing `viewer` gives 422.

### Demo endpoints

These are for the demo panel and for testing. The app does not need them.

`POST /demo/skip` moves the server clock forward and ticks every session at once. Use it to skip the waiting.

```json
{"seconds": 31}
```

```json
{"offset": 31.0}
```

`POST /demo/reset` wipes all users, groups, and sessions, and sets the clock offset to zero. It takes no body.

```json
{"ok": true}
```

## 4. WebSocket

Connect to `ws://<laptop-ip>:8000/ws/<id>` with your own user id. The app sends nothing. Keep the socket open and read what arrives.

Every message has the same shape:

```json
{"kind": "screen", "data": {"screen": "thanks"}}
```

Things that happen on connect and close:

- If you connect and the id has a session, the server marks that user as reconnected. It sends no message.
- If the last socket for an id closes, the server marks that user as disconnected. The countdowns keep running. The alert still goes out.
- The server drops any message for an id that has no open socket. It does not queue them. Call the view endpoint after you reconnect.
- You can open several sockets for one id. Each one gets every message.

### Message kinds

| Kind | Who gets it | When |
|---|---|---|
| `check` | The user | A trigger fired. Ask "Are you okay?". |
| `alarm` | The user | The ask time ran out. Play the loud alarm. |
| `screen` | The user | Change the screen to `data.screen`. |
| `alert` | A contact | The contact is being alerted. Show the response card. |
| `owner` | The other alerted contacts | Someone else tapped "I'm on it". |
| `resolved` | Every alerted contact | The alert is over. |
| `wrong_pin_warning` | Every alerted contact | The user entered a wrong PIN twice or more. |
| `left` | Every group member | The user left the group. |

#### check (to the user)

Arrives when a trigger fires while the session is armed. Start the "Are you okay?" screen. `kind` is the trigger kind. `deadline` is when the ask time runs out.

```json
{"kind": "check", "data": {"kind": "manual", "deadline": 1792204403.849629}}
```

#### alarm (to the user)

Arrives when the user did not answer in time. Play the loud alarm. `deadline` is when contacts get alerted.

```json
{"kind": "alarm", "data": {"deadline": 1792204418.85213}}
```

#### screen (to the user)

Tells the user's phone which screen to show. Section 7 lists the screens. The screen name is in `data.screen`.

```json
{"kind": "screen", "data": {"screen": "alert_active"}}
```

#### alert (to a contact)

Arrives when this contact must act. Show the card and an "I'm on it" button. `tier` is the contact's position in the user's ranking. `kind` is `home_by`, `separation`, `periodic`, `manual`, or `duress`.

```json
{
  "kind": "alert",
  "data": {
    "user_id": "3f9a1c2e",
    "kind": "home_by",
    "card": {
      "title": "Did not get home on time",
      "do": ["Call or text them now", "If no answer, go to their last known spot", "Call emergency services if you cannot reach them"],
      "dont": ["Do not assume they are just late"]
    },
    "tier": 1
  }
}
```

A contact can get `alert` more than once. After the last tier, the server alerts everyone again and restarts the ack timer. Show the same card, do not stack screens.

A duress alert looks the same, with `"kind": "duress"` and this card:

```json
{
  "kind": "alert",
  "data": {
    "user_id": "3f9a1c2e",
    "kind": "duress",
    "card": {
      "title": "Silent alert: they may be in danger",
      "do": ["Tap 'I'm on it' so others know you have this", "Go there with another person", "Call emergency services if you think they are in danger"],
      "dont": ["Do not call their phone", "Do not text to ask if they are okay", "Do not go there alone"]
    },
    "tier": 1
  }
}
```

#### owner (to the other alerted contacts)

Arrives when a contact taps "I'm on it". The contact who tapped does not get this message. Show "Cara is on it" and stop asking for action.

```json
{"kind": "owner", "data": {"user_id": "3f9a1c2e", "acknowledged_by": "c40e88b1"}}
```

#### resolved (to every alerted contact)

The alert is over. Close the alert screen and stop any location display.

```json
{"kind": "resolved", "data": {"user_id": "3f9a1c2e"}}
```

#### wrong_pin_warning (to every alerted contact)

Arrives each time the user enters a wrong PIN from the second attempt on. Show "Someone tried to cancel with a wrong PIN." The alert is still running.

```json
{"kind": "wrong_pin_warning", "data": {"user_id": "3f9a1c2e"}}
```

#### left (to every group member)

The user left the group. Remove them from the group list.

```json
{"kind": "left", "data": {"user_id": "3f9a1c2e"}}
```

## 5. The view object

`GET /sessions/{user_id}/view?viewer=ID` returns one of two shapes. The server decides the shape. The app does not decide.

### For the user (viewer equals user_id)

```json
{"state": "asking", "screen": "asking", "deadline": 1792204403.849629}
```

| Field | Meaning |
|---|---|
| `state` | `armed`, `asking`, `waiting`, `escalating`, `acknowledged`, or `ended`. |
| `screen` | What to show. See section 7. |
| `deadline` | A server Unix time in `asking` and `waiting`. Otherwise `null`. |

The user's view always looks like the view of a user with no hidden trouble. The server does this on purpose, so a person who watches the screen learns nothing. The app does not need to know about it. Just render `state` and `screen` as the view says. The same is true for the WebSocket messages. See section 7 for what the screens look like.

What this means in practice:

- After the duress gesture, the view is the same as after a normal tap on "I'm okay". The word "duress" never appears.

```json
{"state": "armed", "screen": "thanks", "deadline": null}
```

- After a fake end (second wrong PIN), `state` is `armed` and `screen` is `ended_fake`, while the alert still runs.

```json
{"state": "armed", "screen": "ended_fake", "deadline": null}
```

- After a real resolve by the user with the PIN, `state` is `armed` and `screen` is `ended_true`.

```json
{"state": "armed", "screen": "ended_true", "deadline": null}
```

- If a user whose alert is hidden gets another trigger, the check runs the normal way. The user sees the same `asking`, `alarm`, and `alert_active` screens as any user. The view follows the screen. The check on the user's phone does not alert anyone new. The contacts were already alerted. Here is the view during such a check:

```json
{"state": "asking", "screen": "asking", "deadline": 1792204873.217752}
```

```json
{"state": "waiting", "screen": "alarm", "deadline": 1792204888.217752}
```

```json
{"state": "escalating", "screen": "alert_active", "deadline": null}
```

- After a user leaves, `state` is `ended`. This is also true when the user leaves during duress. The alert keeps running in the background.

```json
{"state": "ended", "screen": "thanks", "deadline": null}
```

- If a contact resolves an alert that was hidden, the user's phone gets no message and the view does not change. The user keeps the screen they had. Only the user's own correct PIN gives `ended_true`.

Other examples:

```json
{"state": "waiting", "screen": "alarm", "deadline": 1792204418.85213}
```

```json
{"state": "escalating", "screen": "alert_active", "deadline": null}
```

```json
{"state": "acknowledged", "screen": "alert_active", "deadline": null}
```

### For anyone else (a contact or a group member)

When nothing is going on for this viewer:

```json
{"user_id": "3f9a1c2e", "active": false}
```

This is also what a group member gets during a duress alert. They cannot tell that it exists. It is also what a contact gets before their tier is alerted, and after the alert is resolved.

When the server alerted the viewer and the alert is live:

```json
{
  "user_id": "3f9a1c2e",
  "active": true,
  "kind": "home_by",
  "card": {
    "title": "Did not get home on time",
    "do": ["Call or text them now", "If no answer, go to their last known spot", "Call emergency services if you cannot reach them"],
    "dont": ["Do not assume they are just late"]
  },
  "acknowledged_by": "c40e88b1",
  "location": [43.6532, -79.3832]
}
```

- `acknowledged_by` is `null` until a contact taps "I'm on it".
- `location` is `[lat, lng]` or `null`. It is `null` when nobody has sent a location yet. It is also `null` when the user chose `"acknowledger"` and this viewer is not the one who tapped "I'm on it".
- Location exists only during an active alert. After a resolve, the server clears it.

## 6. Events the app sends

Send these with `POST /sessions/{user_id}/events`. Put the event name in `type`.

| Type | Fields | Who sends it | Meaning |
|---|---|---|---|
| `Trigger` | `kind`: `home_by`, `separation`, `periodic`, or `manual` | The user's app (the demo panel sends `separation`) | Start the check. Send it to start a check. The server ignores it if a check or an alert the user can see is already running. |
| `ConfirmOk` | none | The user | One tap on "I'm okay". Works in `asking` and `waiting`. |
| `Duress` | none | The user | The hidden gesture (hold 3 s, then two taps). Send it at any time. Where it has no effect, the server ignores it. |
| `Ack` | `contact_id` | A contact | "I'm on it". Send your own id as `contact_id`. |
| `Resolve` | `by`, `pin` (user only) | The user or a contact | End the alert. |
| `LocationUpdate` | `lat`, `lng` | The user | Store the user's location. Send it often during a night. |
| `Leave` | none | The user | Leave the group silently. |
| `Disconnect` | none | Not needed | The server sends it for you when the last socket closes. |
| `Reconnect` | none | Not needed | The server sends it for you when a socket opens. |
| `Tick` | none | Never | The server ticks every second. Do not send it. |

Examples. Every one of them returns `{"ok": true}`.

```json
{"type": "Trigger", "kind": "manual"}
```

```json
{"type": "ConfirmOk"}
```

```json
{"type": "Duress"}
```

```json
{"type": "Ack", "contact_id": "c40e88b1"}
```

A user cancels with a PIN:

```json
{"type": "Resolve", "by": "3f9a1c2e", "pin": "4821"}
```

A contact resolves. Leave out `pin`:

```json
{"type": "Resolve", "by": "c40e88b1"}
```

```json
{"type": "LocationUpdate", "lat": 43.6532, "lng": -79.3832}
```

```json
{"type": "Leave"}
```

Who can do what:

- `Ack` works only for a contact the server alerted. In `duress`, only the first tap counts. Any later `Ack` is ignored.
- `Resolve` by the user needs the right PIN. A missing PIN counts as a wrong PIN. The PIN must be a JSON string. A `by` of `null` is ignored.
- `Resolve` by a contact works only if that contact tapped "I'm on it" first. In duress, any duress contact can resolve it.
- `Leave` is ignored while the user sees `alert_active`. It is also ignored during a normal alert, even at `pin_retry`. The user must cancel with the PIN first. At other times it works. In duress, or after `ended_fake`, it works too, and the alert keeps running. Group members get `left` either way.

## 7. User screens

The user's phone shows one screen at a time. The `screen` field in the view and in `screen` messages tells you which. The `check` and `alarm` messages also tell you to move to `asking` and `alarm`.

| Screen | Show this | How you get there |
|---|---|---|
| `armed` | The calm home screen. Nothing is wrong. | Start of the night. Also after an alert ends. |
| `asking` | "Are you okay?" with a big "I'm okay" button and a countdown. Buzz the phone. | `check` message. |
| `alarm` | A louder alarm and a countdown. The same "I'm okay" button. | `alarm` message. |
| `alert_active` | "Your contacts are alerted." A way to cancel with the PIN. | `screen` message after the alarm runs out. |
| `thanks` | "Thanks!" for a moment, then the armed screen. | `screen` message after a tap on "I'm okay". Also after the duress gesture. |
| `pin_retry` | "Incorrect PIN, try again." A new PIN entry. | The first wrong PIN. Nothing else changed. |
| `ended_true` | "Alert ended" with a filled check mark. | The correct PIN, or a contact resolved. The alert is really over. |
| `ended_fake` | "Alert ended" with an outlined check mark. | The second and later wrong PIN. The alert is still running. |

Important points for the screens:

- `thanks` is the same after a tap and after the duress gesture. Do not show any difference.
- Draw the check mark in `ended_true` filled and in `ended_fake` outlined. The difference must be small. Only the user should know what it means. Make everything else on the two screens identical.
- After `ended_fake`, keep showing it. Do not let the user see that the alert continues. The user can try the PIN again. A correct PIN later gives `ended_true`.
- The flow is the same during any alert, whether it is a duress alert or a fake end. A new check shows `asking`, then `alarm`, then `alert_active`. A tap on "I'm okay" shows `thanks`. The app never needs a special case.
- `pin_retry` and `ended_fake` can happen during a duress alert too.
- The server sends no message to end `thanks` or `ended_true`. Show `thanks` for about 2 seconds, then show `armed` on the app's own timer. Show `ended_true` for a few seconds, then do the same. After a resolve, the view already says `state` is `armed`, but `screen` stays `ended_true` until the next event. So the app's own timer is the thing that returns to `armed`.
- A `screen` of `armed` is not sent as a message. Start in `armed` after `POST /sessions`.

What contacts show:

- On `alert`: the card title, the "do" and "don't" lists, and an "I'm on it" button.
- On `owner`: "Someone else is on it", and hide the button.
- On `resolved`: close the alert.
- On `wrong_pin_warning`: a banner "Someone tried to cancel with a wrong PIN."

## 8. Typical flows

Names: Alice is the user (`3f9a1c2e`). Ben is tier 1 (`7b21d0a4`). Cara is tier 2 (`c40e88b1`). Fia is a private duress contact (`50c6a9d8`). Everyone has a socket open on `/ws/<their id>`.

### Safe check-in

1. The app sends `{"type": "Trigger", "kind": "manual"}`.
2. Alice's socket gets `check`.
3. Alice taps "I'm okay". The app sends `{"type": "ConfirmOk"}`.
4. Alice's socket gets `{"kind": "screen", "data": {"screen": "thanks"}}`.
5. No contact gets anything.

### No response and escalation

1. Trigger as above. Alice's socket gets `check`.
2. Alice does nothing. After `ask_seconds`, her socket gets `alarm`.
3. After `grace_seconds` more, her socket gets `screen` with `alert_active`. Ben's socket gets `alert` with `tier` 1.
4. If Ben does nothing for `ack_seconds`, Cara's socket gets `alert` with `tier` 2. Everyone in tier 2 gets it at once.
5. Cara taps "I'm on it". Her app sends `{"type": "Ack", "contact_id": "c40e88b1"}` to `/sessions/3f9a1c2e/events`.
6. Ben's socket gets `owner`. Alice's view changes to `acknowledged`.
7. Cara finds Alice and resolves. Her app sends `{"type": "Resolve", "by": "c40e88b1"}`.
8. Alice's socket gets `screen` with `ended_true`. Ben and Cara get `resolved`.

### Duress

1. Alice is in `asking` (or `armed`). She does the hidden gesture. The app sends `{"type": "Duress"}`.
2. Alice's socket gets `screen` with `thanks`. This is the exact message she gets after a normal tap.
3. Fia's socket gets `alert` with `kind` set to `duress`. Nobody else gets anything. Ben, Cara, and the group see nothing.
4. If Fia does not tap "I'm on it" within `ack_seconds`, the next duress contact gets the alert.
5. A duress contact taps "I'm on it". The other duress contacts get `owner`. Alice's view does not change.
6. Alice cancels with the correct PIN. Her socket gets `ended_true`. The duress contacts get `resolved`.
7. Or a duress contact sends `Resolve`. The duress contacts get `resolved`. Alice's socket gets nothing and her screen stays as it was. This is on purpose.

### Wrong PIN

1. An alert is running. Alice sends `{"type": "Resolve", "by": "3f9a1c2e", "pin": "0000"}`.
2. Her socket gets `screen` with `pin_retry`. Nobody else gets anything.
3. She sends a wrong PIN again. Her socket gets `screen` with `ended_fake`. Every alerted contact gets `wrong_pin_warning`. The alert keeps running.
4. She sends the right PIN. Her socket gets `ended_true`. Contacts get `resolved`.

### Leaving

Alice sends `{"type": "Leave"}` while armed, asking, or waiting. Every group member gets `{"kind": "left", "data": {"user_id": "3f9a1c2e"}}`. Her view shows `state` of `ended`.

### Reconnecting

1. Open the socket first.
2. Call `GET /sessions/<owner>/view?viewer=<me>`.
3. Show what the view says. Then listen to the socket.

## 9. Things to know before you build

- **Countdowns.** Do not use `deadline - Date.now()`. The phone clock can be off, and `/demo/skip` shifts the server clock. Use `GET /time` instead. When a `check` or `alarm` message arrives, or when you read a view with a `deadline`, call `GET /time` and keep the `now` it returns. Save the phone's own elapsed-time clock at the same moment, for example `performance.now()`. Then the seconds left are:

  ```
  left = deadline - serverNow - (localNow - localAtFetch) / 1000
  ```

  `serverNow` is the `now` from `GET /time`. `localAtFetch` is the phone's elapsed-time clock when you got it. `localNow` is the same clock now. This stays right even if the phone clock is wrong. Call `GET /time` again after a reconnect or after `/demo/skip`, because the server clock jumps. The example `/time` answer is `{"now": 1792204796.2023091}`.
- **Setting `night_ends_at`.** It uses the server clock. Call `GET /time` and add the length of the night: `now + hours * 3600`. Do not use the phone clock. The `/demo/skip` button shifts the server clock past it.
- **Names.** No WebSocket message carries a name. `GET /groups/{code}` returns names for group members. Contacts outside the group need their ids and names shared by some other route, for example a QR code or a typed code. Keep an id-to-name map on the phone.
- **Missed messages.** The server does not queue messages. A contact whose socket dropped should call `GET /alerts?viewer=<me>` when the app opens and after every reconnect. It lists every alert for this contact. For the user, call `GET /sessions/<me>/view?viewer=<me>`.
- **Screen after leave.** After `Leave` in `asking`, the view can show `state` of `ended` with `screen` of `asking`. Check `state` first. If it is `ended`, show the ended state.
- **Do not special-case the user's alerts.** The user's view follows the normal flow in every alert, so render `state` and `screen` and nothing else. Do not try to work out from the view whether an alert is real or hidden. It cannot be done, and that is the point.
- **A resolved hidden alert is silent.** If a duress contact resolves the alert, the user's phone gets no message. This is on purpose.
- **Errors for ignored events.** Ignored events (like a stray `ConfirmOk`) still return 200 `{"ok": true}`. The server does not tell you it ignored them.
- **Server restart.** Everything disappears. See section 1.
