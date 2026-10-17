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
- The phase 1 users, groups, and sessions live in server memory. If the server restarts, they are gone. Handle a 400 or 404 by sending the user back to setup. The Safekeeps profiles and friends (section 10) are different. They persist in SQLite. The environment variable `SAFEKEEPS_DB` sets the path of the database file.
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
  "ack_seconds": 20,
  "ack_hold_seconds": 120
}
```

Fields:

| Field | Required | Meaning |
|---|---|---|
| `user_id` | yes | The person who is out. |
| `pin` | yes | The cancel PIN, as a string. The server compares it exactly. |
| `duress_pin` | no | A second PIN, as a string. It must differ from `pin`. On the phone it works exactly like `pin`, but it silently alerts the duress contacts and does not end the user's alert. See "The duress PIN" in section 6. The server never sends it back. |
| `tiers` | yes | Ranked list of lists of contact ids. Tier 1 is alerted first. |
| `duress_contacts` | yes, at least one | Private ranked list. Each contact is its own tier. They are never shown to the group. |
| `group_code` | no | Leave it out for solo use. |
| `share_location_with` | no, default `"alerted"` | `"alerted"` means every alerted contact sees the location. `"acknowledger"` means only the contact who tapped "I'm on it". |
| `ask_seconds` | no, default 30 | How long the user has to tap "I'm okay". |
| `grace_seconds` | no, default 15 | How long the loud alarm runs before contacts are alerted. |
| `ack_seconds` | no, default 20 | How long a tier has to tap "I'm on it" before the next tier is alerted. |
| `ack_hold_seconds` | no, default 120 | How long a contact who tapped "I'm on it" has to resolve the alert. If they do not, the alert goes back out (section 8, "Taken but not resolved"). 120 is a demo value. A real product would use about 10 minutes. A number of 0 or more. NaN and infinity give 422. |
| `night_ends_at` | no | Server Unix time when the night ends. See section 9. |
| `home_by` | no | Server Unix time. A "be home by" check starts then, once per night. It is a normal check: silence escalates it with kind `home_by`. If another check is running at that time, it starts when the phone is armed again. It never starts after the night ended. Example: `"home_by": 1792236000`. |

Response (200). The `view` is the user's own view (section 5):

```json
{"user_id": "3f9a1c2e", "view": {"state": "armed", "screen": "armed", "deadline": null, "ping_at": null}}
```

Errors:

- 404 if `group_code` is unknown.
- 400 if `share_location_with` is not `"alerted"` or `"acknowledger"`.
- 400 if the user or any contact id is unknown. Example: `{"detail": "unknown user ffffffff"}`.
- 400 if `tiers` is empty or any tier is empty. The response is `{"detail": "tiers must not be empty and every tier needs a contact"}`.
- 400 if `user_id` is in `tiers` or `duress_contacts`. The response is `{"detail": "the user cannot be their own contact"}`. Leave the user out when you build the lists from the group members.
- 400 if `tiers` and `duress_contacts` hold more than 50 entries in all. Both `POST /sessions` and `POST /safekeeps/night` check this.
- 400 if `duress_contacts` is empty. The response is `{"detail": "duress_contacts must not be empty"}`. Always ask the user to pick at least one duress contact.
- 400 if `duress_pin` is the same as `pin`. The response is `{"detail": "duress_pin must be different from pin"}`. A `duress_pin` that is not a string (a number, for example) gives 422.
- 409 if the user's own view shows `escalating` or `acknowledged`. The response is `{"detail": "session busy"}`. The old session stays as it was, and nothing is replaced. Be ready for a 409 when you start a night, and show a neutral message such as "Could not start right now". Do not retry in a loop. The alert must end first. A user with a hidden alert (duress, or a fake end) gets the same answer as any other user in the same view.
- 422 if a required field is missing. Example: `{"detail": [{"type": "missing", "loc": ["body", "pin"], "msg": "Field required", "input": {...}}]}`. A 422 also comes if a timer is negative, NaN, or infinite.

Starting a session for a user whose view is not `escalating` or `acknowledged` replaces the old session. This is how a new night starts. A hidden alert that still runs moves to the new session and keeps escalating. The new night shows nothing about it.

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
- 400 if a `LocationUpdate` has a `lat` or `lng` that is not a real number, or is off the map (`lat` beyond 90, `lng` beyond 180). Example: `{"detail": "lat and lng must be numbers on the map"}`.

### GET /sessions/{user_id}/view?viewer={id}

Returns what `viewer` is allowed to see about this session. Call it when the app opens, returns to the foreground, or reconnects its WebSocket. Messages sent while no socket was open are lost, and this call catches you up.

Example, the owner viewing their own session:

```
GET /sessions/3f9a1c2e/view?viewer=3f9a1c2e
```

```json
{"state": "asking", "screen": "asking", "deadline": 1792204403.849629, "ping_at": null}
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
{"alerts": [{"user_id": "eaee84e6", "active": true, "kind": "manual", "card": {"title": "Asked for a check and did not answer", "do": ["Call or text them now", "Go to their location if you can", "Stay with them once you find them", "If they are drowsy, lay them on their side", "Call emergency services if you cannot wake them or their breathing seems off"], "dont": ["Do not ignore this alert", "Do not leave them alone", "Do not let them leave with someone they just met"]}, "acknowledged_by": null, "location": [43.6532, -79.3832], "location_at": 1792204790.5, "stale_ack_by": null, "final_step": false}]}
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
| `ping` | The user | A contact pinged the visible alert. Play a loud sound and flash. `data.at` is the server time. |
| `owner` | The other alerted contacts | Someone else tapped "I'm on it". |
| `resolved` | Every alerted contact | The alert is over. |
| `wrong_pin_warning` | Every alerted contact | The user entered a second wrong PIN in a row (the fake end). Later wrong PINs send nothing. |
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
      "do": ["Call or text them now", "If no answer, go to their last known spot", "Stay with them once you find them", "If they are drowsy, lay them on their side", "Call emergency services if you cannot wake them or their breathing seems off"],
      "dont": ["Do not assume they are just late", "Do not leave them alone", "Do not let them leave with someone they just met"]
    },
    "tier": 1
  }
}
```

A contact can get `alert` more than once. After the last tier, the server alerts everyone again. The first of these rounds comes `ack_seconds` after the last tier. The gaps after that grow: 60, 120, then 300 seconds for every later round. After 3 rounds in a row that nobody took, the alert's `final_step` turns `true` (section 5). An "I'm on it" starts that count again. Show the same card, do not stack screens.

Every card has the same help for when the contact finds the person: "Stay with them once you find them", "If they are drowsy, lay them on their side", and "Call emergency services if you cannot wake them or their breathing seems off". The "don't" list adds "Do not leave them alone" and "Do not let them leave with someone they just met". The cards never say what is wrong with the person. They say only what to do.

A duress alert looks the same, with `"kind": "duress"` and this card:

```json
{
  "kind": "alert",
  "data": {
    "user_id": "3f9a1c2e",
    "kind": "duress",
    "card": {
      "title": "Silent alert: they may be in danger",
      "do": ["Tap 'I'm on it' so others know you have this", "Go there with another person", "Call emergency services if you think they are in danger", "Stay with them once you find them", "If they are drowsy, lay them on their side", "Call emergency services if you cannot wake them or their breathing seems off"],
      "dont": ["Do not call their phone", "Do not text to ask if they are okay", "Do not go there alone", "Do not leave them alone", "Do not let them leave with someone they just met"]
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

Arrives when the user enters the second wrong PIN in an alert (the one that gives `ended_fake`). Show "Someone tried to cancel with a wrong PIN." The alert is still running. Later wrong PINs send nothing more (section 6).

```json
{"kind": "wrong_pin_warning", "data": {"user_id": "3f9a1c2e"}}
```

#### ack_stale (to the contact who tapped "I'm on it")

Arrives when this contact tapped "I'm on it" but did not resolve the alert within `ack_hold_seconds`. The alert went back out to the next tier, or to everyone after the last tier. Show "You said you were on it. The alert went to others too. Tap I'm on it again if you are still helping."

```json
{"kind": "ack_stale", "data": {"user_id": "3f9a1c2e"}}
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
{"state": "asking", "screen": "asking", "deadline": 1792204403.849629, "ping_at": null}
```

| Field | Meaning |
|---|---|
| `state` | `armed`, `asking`, `waiting`, `escalating`, `acknowledged`, or `ended`. |
| `screen` | What to show. See section 7. |
| `deadline` | A server Unix time in `asking` and `waiting`. Otherwise `null`. |
| `home_by` | Only when the night has a `home_by` check that has not started yet. The server time it will start. The key is left out otherwise, and never appears in a contact's view. |

The user's view always looks like the view of a user with no hidden trouble. The server does this on purpose, so a person who watches the screen learns nothing. The app does not need to know about it. Just render `state` and `screen` as the view says. The same is true for the WebSocket messages. See section 7 for what the screens look like.

What this means in practice:

- `ping_at` is the server time of the last ping that counted, or `null`. A contact can ping only the visible alert (decision 11). Hidden alerts never set it, so it cannot show that one exists. It goes back to `null` when the front alert ends.
- After the duress gesture, the view is the same as after a normal tap on "I'm okay". The word "duress" never appears.

```json
{"state": "armed", "screen": "thanks", "deadline": null, "ping_at": null}
```

- After a fake end (second wrong PIN), `state` is `armed` and `screen` is `ended_fake`, while the alert still runs.

```json
{"state": "armed", "screen": "ended_fake", "deadline": null, "ping_at": null}
```

- After a real resolve by the user with the PIN, `state` is `armed` and `screen` is `ended_true`.

```json
{"state": "armed", "screen": "ended_true", "deadline": null, "ping_at": null}
```

- A trigger works the same way whether or not a hidden alert runs. The user sees the normal `asking`, `alarm`, and `alert_active` screens. If the user does not answer, the normal contacts are alerted too. Here is the view during a check:

```json
{"state": "asking", "screen": "asking", "deadline": 1792204873.217752, "ping_at": null}
```

```json
{"state": "waiting", "screen": "alarm", "deadline": 1792204888.217752, "ping_at": null}
```

```json
{"state": "escalating", "screen": "alert_active", "deadline": null, "ping_at": null}
```

- After a user leaves, `state` is `ended`. This is also true when the user leaves during duress. The alert keeps running in the background. `screen` stays whatever the last screen was, for example `armed` or `thanks`. The next example shows `thanks`.

```json
{"state": "ended", "screen": "thanks", "deadline": null, "ping_at": null}
```

- If a contact resolves an alert that was hidden, the user's phone gets no message and the view does not change. The user keeps the screen they had. Only the user's own correct PIN gives `ended_true`. That PIN also ends every hidden alert.

Other examples:

```json
{"state": "waiting", "screen": "alarm", "deadline": 1792204418.85213, "ping_at": null}
```

```json
{"state": "escalating", "screen": "alert_active", "deadline": null, "ping_at": null}
```

```json
{"state": "acknowledged", "screen": "alert_active", "deadline": null, "ping_at": null}
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
    "do": ["Call or text them now", "If no answer, go to their last known spot", "Stay with them once you find them", "If they are drowsy, lay them on their side", "Call emergency services if you cannot wake them or their breathing seems off"],
    "dont": ["Do not assume they are just late", "Do not leave them alone", "Do not let them leave with someone they just met"]
  },
  "acknowledged_by": "c40e88b1",
  "location": [43.6532, -79.3832],
  "location_at": 1792204790.5,
  "stale_ack_by": null,
  "final_step": false
}
```

- `acknowledged_by` is `null` until a contact taps "I'm on it". It goes back to `null` if that contact does not resolve the alert within `ack_hold_seconds`.
- `location_at` is the server time of the last location update, or `null` when `location` is `null`. Show the age: "updated 3 min ago" is `now - location_at` with `now` from the server.
- `stale_ack_by` is the id of the contact who tapped "I'm on it" but did not resolve in time, or `null`. Show "Cara said she was on it but has not resolved it." A new "I'm on it" from anyone sets it back to `null`.
- `final_step` is `true` once every tier was alerted and 3 more rounds in a row went by with nobody tapping "I'm on it". An "I'm on it" that goes stale does not count toward it. It is SIMULATED: show "Emergency services would be contacted now (SIMULATED)". Nothing is called. It never goes back to `false` for this alert.
- `location` is `[lat, lng]` or `null`. It is `null` when nobody has sent a location yet. It is also `null` when the user chose `"acknowledger"` and this viewer is not the one who tapped "I'm on it".
- The user's phone sends its location about every 30 seconds all night (decision 10). The server keeps it but shows it to contacts only during an active alert. After a resolve, the server clears it.

## 6. Events the app sends

Send these with `POST /sessions/{user_id}/events`. Put the event name in `type`.

| Type | Fields | Who sends it | Meaning |
|---|---|---|---|
| `Trigger` | `kind`: `home_by`, `separation`, `periodic`, or `manual` | The user's app (the demo panel sends `separation`) | Start the check. Send it to start a check. The server ignores it if a check or an alert the user can see is already running. |
| `ConfirmOk` | none | The user | One tap on "I'm okay". Works in `asking` and `waiting`. In `armed` it only shows `thanks`. |
| `Duress` | none | The user | The hidden gesture (hold 1 s, then 2 quick taps). Send it at any time. The phone gets what `ConfirmOk` gives in the same state. The duress alert starts in every state, also during the user's own alert. |
| `Ack` | `contact_id` | A contact | "I'm on it". Send your own id as `contact_id`. |
| `Resolve` | `by`, `pin` (user only) | The user or a contact | End the alert. |
| `Ping` | `contact_id` | A contact | Make the user's phone ring and flash. Counts only on the visible alert, see section 10. |
| `LocationUpdate` | `lat`, `lng` | The user | Store the user's location. Send it about every 30 seconds during a night. |
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

- A contact who is alerted by more than one alert acts on the one on their screen. That is the duress alert first, else the newest. An alert that another contact already took comes last. `Ack` and `Resolve` change only that alert.
- `Ack` works only for a contact the server alerted. In `duress`, only the first tap counts while that contact holds it. After the hold runs out (`ack_hold_seconds`), any duress contact can tap again.
- `Resolve` by the user needs the right PIN. A missing PIN counts as a wrong PIN. The PIN must be a JSON string. A `by` of `null` is ignored. The user can send the PIN in every state except `ended`, where it is ignored. When no alert runs, it only changes `screen` to `pin_retry`, `ended_fake`, or `ended_true`.
- After any end screen from a PIN (`ended_true` or `ended_fake`), there is no more `pin_retry` until the next check starts. Every wrong PIN shows `ended_fake` again and tells nobody. The right PIN shows `ended_true`. So a person who forces more guesses learns nothing from the screen. The right PIN, or a contact, still ends a hidden alert. Example: in an alert, `0000` gives `pin_retry`, `9999` gives `ended_fake`, then `1111` gives `ended_fake` again, not `pin_retry`.
- `Resolve` by a contact works only if that contact tapped "I'm on it" first. In duress, any duress contact can resolve it, even one who was not alerted yet.
- `Leave` is ignored while the view says `asking`, `waiting`, `escalating` or `acknowledged`, even at `pin_retry`. A check must be answered first, and an alert must be cancelled with the PIN first. So a person who takes the phone cannot stop a check by leaving. At other times (`armed`) it works. If a hidden alert runs (duress, or after `ended_fake`), it works too, and the alert keeps running. Group members get `left`. After `Leave` the PIN is ignored until the next night.
- The duress PIN (see below) is never a wrong PIN.
- `ConfirmOk` and `Duress` while `armed` show `thanks` but do not move the next periodic check later. Only an answer to a running check (`asking` or `waiting`) plans the next periodic check from now. 

### The duress PIN

A night can have a `duress_pin` (set it in `POST /sessions` or `POST /safekeeps/night`). The user types it in the same PIN box as the cancel PIN, for example when someone makes them cancel an alert. Send it the same way:

```json
{"type": "Resolve", "by": "3f9a1c2e", "pin": "9876"}
```

The rule:

- The phone gets exactly what the right PIN gives in the same state: the same `screen` (`ended_true`, the filled check), the same view, and the same `{"ok": true}`. This is also true after an end screen, where a wrong PIN shows `ended_fake`. In `ended` (after `Leave` or the night end) the phone gets nothing, as with the right PIN.
- Silently, a duress alert starts, exactly as after the `Duress` gesture. If an open duress alert is already running, no second one starts.
- Nothing is resolved. If the user's own alert was running (`escalating` or `acknowledged`), it keeps going, hidden, like after a fake end. Its contacts keep seeing it. Nobody gets `resolved` or `wrong_pin_warning`.
- It does not count as a wrong PIN and does not change what friends see (`lastCheckIn`).
- Later, the right PIN ends every alert of the night, as usual.

Example. Alice's night has `"pin": "4821"` and `"duress_pin": "9876"`. Her alert is `escalating` and Ben was alerted. She types `9876`. Her view is `{"state": "armed", "screen": "ended_true", "deadline": null, "ping_at": null}`, the same as after `4821`. Ben still sees the alert. Fia, her duress contact, gets an `alert` with kind `duress`.

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
| `ended_true` | "Alert ended" with a filled check mark. | The correct PIN (also when no alert runs), or a contact resolved the user's own alert. |
| `ended_fake` | "Alert ended" with an outlined check mark. | The second wrong PIN in a row, and every wrong PIN after any end screen until the next check. The alert, if there is one, is still running. |

Important points for the screens:

- `thanks` is the same after a tap and after the duress gesture. Do not show any difference.
- Draw the check mark in `ended_true` filled and in `ended_fake` outlined. The difference must be small. Only the user should know what it means. Make everything else on the two screens identical.
- After `ended_fake`, keep showing it. Do not let the user see that the alert continues. The user can try the PIN again. A wrong PIN gives `ended_fake` again (never `pin_retry`, see section 6). A correct PIN later gives `ended_true`.
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

1. Alice does the hidden gesture. The app sends `{"type": "Duress"}`.
2. In `armed`, `asking`, or `waiting`, Alice's socket gets `screen` with `thanks`. This is the exact message she gets after a normal tap. In any other state (for example her own alert is `escalating`) she gets nothing, the same as after a normal tap there.
3. Fia's socket gets `alert` with `kind` set to `duress`. Nobody else gets anything. Ben, Cara, and the group see nothing.
4. If Fia does not tap "I'm on it" within `ack_seconds`, the next duress contact gets the alert.
5. A duress contact taps "I'm on it". The other duress contacts get `owner`. Alice's view does not change.
6. Alice cancels with the correct PIN. Her socket gets `ended_true`. The duress contacts get `resolved`.
7. Or a duress contact sends `Resolve`. The duress contacts get `resolved`. Alice's socket gets nothing and her screen stays as it was. This is on purpose.

### Wrong PIN

1. An alert is running. Alice sends `{"type": "Resolve", "by": "3f9a1c2e", "pin": "0000"}`.
2. Her socket gets `screen` with `pin_retry`. Nobody else gets anything.
3. She sends a wrong PIN again. Her socket gets `screen` with `ended_fake`. Every alerted contact gets `wrong_pin_warning`. The alert keeps running. Every later wrong PIN shows `ended_fake` again and nobody is told. `pin_retry` comes back only in the next check.
4. She sends the right PIN. Her socket gets `ended_true`. Contacts get `resolved`.

### Taken but not resolved

1. Cara taps "I'm on it" at time T. Her alert gets a hold of `ack_hold_seconds` (default 120).
2. Cara does not resolve it by T + 120. Cara's socket gets `{"kind": "ack_stale", "data": {"user_id": "3f9a1c2e"}}`.
3. The alert goes back to escalating. The next tier gets `alert` (after the last tier, everyone does). Every alerted contact's view shows `"acknowledged_by": null, "stale_ack_by": "c40e88b1"`.
4. Alice's own view does not change. It still says `acknowledged`. A duress alert does the same for its duress contacts only.
5. Anyone alerted, Cara too, can tap "I'm on it" again. That sets `stale_ack_by` back to `null` and starts a new hold.

### Nobody answers at all

1. Every tier was alerted and nobody tapped "I'm on it".
2. Everyone is alerted again after `ack_seconds`, then after 60, 120 and 300 seconds, then every 300 seconds.
3. When the round after the third one is due, `final_step` turns `true` in every contact's view. The demo panel shows "Final step reached: emergency services would be contacted now (SIMULATED)". Nothing real is called.

### Leaving

Alice sends `{"type": "Leave"}` while armed. Every group member gets `{"kind": "left", "data": {"user_id": "3f9a1c2e"}}`. Her view shows `state` of `ended`.

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
- **Screen after leave.** After `Leave`, the view can show `state` of `ended` with an old `screen` such as `thanks`. Check `state` first. If it is `ended`, show the ended state. `Leave` during a check is ignored, so hide the Leave button on the check screen.
- **Do not special-case the user's alerts.** The user's view follows the normal flow in every alert, so render `state` and `screen` and nothing else. Do not try to work out from the view whether an alert is real or hidden. It cannot be done, and that is the point.
- **A resolved hidden alert is silent.** If a duress contact resolves the alert, the user's phone gets no message. This is on purpose.
- **Errors for ignored events.** Ignored events (like a stray `ConfirmOk`) still return 200 `{"ok": true}`. The server does not tell you it ignored them.
- **Server restart.** Everything disappears. See section 1.

## 10. Safekeeps bridge

This section is for the Safekeeps app in `safekeeps/`. The bridge links her profiles and friends (SQLite, Bearer token) to the check-in loop. It adds six endpoints under `/safekeeps`. The app does not use a WebSocket. It polls.

The examples below come from real calls to the server. The ids here are shortened to 8 characters. Real ids have 32 characters. In all examples Alice is the user (`3f9a1c2e`). Ben is her tier 1 contact (`7b21d0a4`). Fia is her private duress contact (`50c6a9d8`). All three are accepted friends.

### Rules for every bridge endpoint

- Send the header `Authorization: Bearer <token>`. The token is the one from `POST /safekeeps/profiles`.
- Without a token, or with a bad token, the answer is `401` with `{"detail": "Please create or reconnect your profile."}`.
- Your id is your SQLite profile id. You never send your own id. The server reads it from the token.
- The server forgets all nights when it restarts. Profiles and friends stay. After a restart `view` is `null`, so show the setup screen again. The token still works.
- Errors look like `{"detail": "..."}`. Validation errors from the body (code `422`) have a list in `detail`.

### POST /safekeeps/night

Start a night for me. The group is all my accepted friends. Every contact must be an accepted friend. The contacts are fixed when the night starts. If I remove a friend during the night, the removal applies from the next night. For the rest of this night that friend sees, acks and resolves alerts exactly as before. One exception: a hidden alert (duress, or after `ended_fake`) moves into the next night with its contacts. A friend who was removed keeps seeing it, keeps getting the user's live location from the new night, and can still ack or resolve it, until someone resolves it. This is on purpose: if it ended with the night, "remove the contact, Leave, start a new night" would cancel a hidden alert.

```json
{
  "pin": "4821",
  "tiers": [["7b21d0a4"]],
  "duress_contacts": ["50c6a9d8"],
  "check_every_minutes": 30
}
```

| Field | Meaning |
|---|---|
| `pin` | A string. The user needs it to cancel. Required. |
| `duress_pin` | Optional. A string that differs from `pin`. It looks like `pin` on the phone, but it silently alerts the duress contacts. See "The duress PIN" in section 6. |
| `tiers` | A list of lists of friend ids. The first list is alerted first. Required. Must not be empty. No tier may be empty. |
| `duress_contacts` | Friend ids for the silent alert. Required. Must not be empty. Only the user knows this list. |
| `check_every_minutes` | Optional. The server starts a check by itself this long after the phone is armed. A number above 0. |
| `ask_seconds` | Optional. Time to answer a check. Default 30. |
| `grace_seconds` | Optional. Time of the louder `alarm` screen. Default 15. |
| `ack_seconds` | Optional. Time a contact has to tap "I'm on it" before the next tier. Default 20. |
| `ack_hold_seconds` | Optional. Time a contact who tapped "I'm on it" has to resolve before the alert goes back out. Default 120 (demo value, about 10 minutes in a real product). NaN, infinity and negative numbers give 422. |
| `night_ends_at` | Optional. A server Unix time. Get it from the `now` of `GET /safekeeps/night`. Add the length of the night. |
| `home_by` | Optional. A server Unix time for a "be home by" check. The check starts then, once per night, and silence escalates it with kind `home_by`. Example: `{"pin": "4821", "tiers": [["7b21d0a4"]], "duress_contacts": ["50c6a9d8"], "home_by": 1792236000}`. The user's own view has a `home_by` key until the check starts. |

Answer, `200`:

```json
{"user_id": "3f9a1c2e", "view": {"state": "armed", "screen": "armed", "deadline": null, "ping_at": null}}
```

Errors:

| Code | When |
|---|---|
| `400` | A contact is not an accepted friend. This includes yourself. The text is `every contact must be an accepted friend`. |
| `400` | `duress_contacts` is empty. |
| `400` | `tiers` is empty or has an empty tier. |
| `400` | `duress_pin` is the same as `pin`. Text: `duress_pin must be different from pin`. |
| `409` | `session busy`. An alert is running for you now. Cancel it with the PIN first. |
| `422` | A bad field. For example `pin` or `duress_pin` is a number and not a string, or `check_every_minutes` is 0. |

Starting a new night while the old one is quiet replaces it.

### GET /safekeeps/night

Poll this. It returns my own state and the alerts I should act on.

```json
{
  "now": 1792229956.162278,
  "view": {"state": "armed", "screen": "armed", "deadline": null, "ping_at": null},
  "alerts": []
}
```

| Field | Meaning |
|---|---|
| `now` | The server clock. Use it for countdowns. |
| `view` | My own view. Same shape as section 5. It is `null` when I have no night. |
| `alerts` | The alerts where a friend needs me. It is a list. It is empty most of the time. |

My own night is never in my `alerts`. A friend of mine only appears when the server alerted me for that friend, by the contacts the night had when it started. Removing a friend changes nothing for the running night. The removal applies from the next night, except for a hidden alert that carries over (see `POST /safekeeps/night`). A person who is not alerted sees nothing, not even that a night exists. During a duress alert only the chosen duress contacts see it.

An alert from `alerts`:

```json
{
  "user_id": "3f9a1c2e",
  "active": true,
  "kind": "manual",
  "card": {
    "title": "Asked for a check and did not answer",
    "do": ["Call or text them now", "Go to their location if you can", "Stay with them once you find them", "If they are drowsy, lay them on their side", "Call emergency services if you cannot wake them or their breathing seems off"],
    "dont": ["Do not ignore this alert", "Do not leave them alone", "Do not let them leave with someone they just met"]
  },
  "acknowledged_by": null,
  "location": [43.6532, -79.3832],
  "location_at": 1792229950.0,
  "stale_ack_by": null,
  "final_step": false
}
```

`user_id` is the person in trouble. `kind` is `manual`, `periodic`, `home_by`, `separation`, or `duress`. The other fields are the same as in section 5.

### POST /safekeeps/night/events

Send one of my own events to my night. The body is the event. Put the name in `type`. Answer: `{"ok": true}`.

| Type | Fields | Meaning |
|---|---|---|
| `ConfirmOk` | none | One tap on "I'm okay". |
| `Duress` | none | The hidden gesture. |
| `Resolve` | `pin` (a string) | Cancel the alert with my PIN. |
| `LocationUpdate` | `lat`, `lng` | My place. The app sends it about every 30 seconds during a night (decision 10), while it is open. |
| `Leave` | none | Leave the night silently. |

```json
{"type": "ConfirmOk"}
```

```json
{"type": "Duress"}
```

```json
{"type": "Resolve", "pin": "4821"}
```

```json
{"type": "LocationUpdate", "lat": 43.6532, "lng": -79.3832}
```

Errors:

| Code | When |
|---|---|
| `400` | `type` is not in the list above. `Trigger`, `Ack`, `Tick`, `Disconnect`, and `Reconnect` are not allowed here. |
| `400` | `Resolve` without a string `pin`. Text: `pin must be a string`. |
| `400` | `lat` or `lng` is not a real number on the map. |
| `404` | I have no night. Text: `no session for <my id>`. |

Ignored events still give `200`. A stray `ConfirmOk` is one example. The next `GET` shows what happened. Read the `view` and do not guess.

`Resolve` here always means me. A `by` field in the body is ignored. A wrong PIN does not give an error. It changes `view.screen` to `pin_retry` and then to `ended_fake`. See section 7.

### POST /safekeeps/alerts/{owner_id}/ack

I am a contact. Tap "I'm on it" for the alert about `owner_id`. No body. Answer: `{"ok": true}`.

```
POST /safekeeps/alerts/3f9a1c2e/ack
```

Next poll, `acknowledged_by` in that alert is my id. The owner's other contacts stop seeing the button (see the table below).

### POST /safekeeps/alerts/{owner_id}/ping

I am a contact. Make the phone of `owner_id` ring loudly and flash, so I can find them. No body. Answer: `{"ok": true}`.

```
POST /safekeeps/alerts/3f9a1c2e/ping
```

It counts only if I am allowed on the owner's visible alert. That means the alert is the one their own screen shows (state `escalating` or `acknowledged`), I was alerted by it, and no other contact took it. A hidden alert can never be pinged (decision 11), so a duress alert or an alert after `ended_fake` ignores it. A duress-only contact cannot ping. Ping is ignored in every other case. The answer is always `200` with `{"ok": true}`, like ack and resolve, so it tells nothing about any night. The same two rules apply: `400` for my own id, and `401` for a bad token.

When it counts, the owner's view gets `ping_at`, the server time of the last counted ping. The owner's app compares it with the last value it saw. When it is new, the app plays the sound and the flash. `ping_at` is `null` until a ping counts, and it goes back to `null` when the alert ends. It is part of the owner's own view in section 5, so it is in `GET /safekeeps/night` too. It depends only on the visible alert, so a user with a hidden alert gets the same `ping_at` as a user with none.

### POST /safekeeps/alerts/{owner_id}/resolve

I am a contact. End the alert about `owner_id`. No body. Answer: `{"ok": true}`.

The loop decides if this counts. It counts only if I tapped "I'm on it" first. In a duress alert any duress contact can resolve it. If it does not count, the answer is still `200` and nothing changes. The next poll shows the truth.

All three alert endpoints give the same answer, `200` with `{"ok": true}`, whether or not `owner_id` exists, has a night, or lists me as a contact. So the answer tells nothing about any night. Only a missing or bad token gives `401`. They give `400` if `owner_id` is my own id: use `/safekeeps/night/events` for my own night. If I am not a contact of that night, the action is ignored.

### The polling loop

1. Call `GET /safekeeps/night` every 2.5 seconds while the app is open.
2. Keep the `now` from the answer and the phone's own elapsed-time clock (for example `performance.now()`) from the same moment.
3. Render `view` (my screen) and `alerts` (the responder screen). Both can show at the same time. A person on a night can also be a responder for a friend. Show the responder screen on top.
4. For a countdown use this and not the phone clock:

```
left = view.deadline - now - (localNow - localAtFetch) / 1000
```

   `now` and `view.deadline` are from the same answer. This stays right when the phone clock is wrong and when `/demo/skip` moves the server clock.
5. Do not stop polling during an alert. The server keeps all timers. If the phone loses signal or the app closes, the alert still goes on and the next tier is still alerted. The app only needs polling to show things.
6. Poll `GET /safekeeps/state` as before for the friends list and old check-in times. It is a separate call.

### What to render for my own view

`view` is `null` when I have no night. Show the night setup screen (PIN, ranked friends, duress friends, check interval). Then call `POST /safekeeps/night`.

Otherwise render by `state` and `screen`. Decide by `state` first. If `state` is `ended`, the night is over. See section 7 for the look of every screen.

| `view.state` | `view.screen` | Show |
|---|---|---|
| `armed` | `armed` | The calm home screen. |
| `asking` | `asking` | "Are you okay?" with the check-in button and a countdown from `deadline`. Buzz the phone once. |
| `waiting` | `alarm` | A louder alarm with the same button and a countdown from `deadline`. |
| `escalating` | `alert_active` | "Your contacts are alerted." A way to cancel with the PIN. |
| `acknowledged` | `alert_active` | The same screen as above. Do not show who is on it. |
| `armed` | `thanks` | "Thanks!" for about 2 seconds, then the app shows `armed` on its own timer. |
| `armed` | `pin_retry` | "Incorrect PIN, try again." A new PIN entry. |
| `armed` | `ended_true` | "Alert ended" with a filled check mark. Show it for a few seconds, then the app shows `armed` on its own timer. |
| `armed` | `ended_fake` | "Alert ended" with an outlined check mark. Everything else is the same as `ended_true`. Keep showing it. The user can still try the PIN. A wrong PIN shows `ended_fake` again, never `pin_retry`, until the next check. |
| `ended` | any | The night is over. Show the setup screen after a moment. |

Keep these rules:

- `ended_true` has a filled check mark. `ended_fake` has an outlined check mark. The difference must be small. Only the user should know what it means.
- `thanks` is the same after a tap and after the duress gesture. Do not add any difference, not even on the phone.
- The `screen` value stays at `thanks` or `ended_true` until the next event, so the app must go back to `armed` on its own timer. Start the timer when `screen` changes to `thanks` or `ended_true`.
- Do not try to work out if an alert is real or hidden. Do not special-case anything. Render `state` and `screen` and nothing else.
- A `view.state` of `armed` with `screen` `ended_true` is also what the user sees after a contact resolved their alert.

### The check-in button

During a check (`asking` or `waiting`), the button does two things. Use `POST /safekeeps/night/events` for both.

The gestures match the band (`Hardware/kaze_band/HARDWARE.md`):

- 3 quick taps within 1.5 s send `{"type": "ConfirmOk"}`.
- Hold 1 s, then 2 quick taps within 2.5 s, send `{"type": "Duress"}`.
- Hold 1 s and then nothing sends `{"type": "ConfirmOk"}` after 2.5 s.
- 1 or 2 taps and then nothing send nothing. The count resets after 1.5 s.

Give ok and duress the exact same feedback.

The next poll shows `thanks` in both cases. It is the same word. The bridge also records a check-in in SQLite for both, so `lastCheckIn` and the friends' `incoming` list look identical in both cases. A friend cannot tell them apart. Because of this, the app must not send the duress gesture through `POST /safekeeps/check-ins`. That endpoint is for an ok only.

When a night is running, send the tap through `/night/events`. Her old `POST /safekeeps/check-ins` also works as an ok during a night. It records the check-in and sends `ConfirmOk` to the loop. When no night is running, it only records the check-in.

The duress gesture works at any time, not only during a check. Use it on the `armed` screen too. If it has no effect the server ignores it.

### "Ask a friend to check in" is a real check now

`POST /safekeeps/friends/{friend_id}/requests` still records the request as before. If the friend has a night running, it now also starts a real check on their phone. Their `view` becomes `asking` on the next poll. If they stay silent, the check escalates like any other: `alarm`, then `alert_active`, then their contacts are alerted. The kind of the alert is `manual`.

If the friend has no night, nothing else happens. Only the request is recorded. If a check or an alert is already running for that friend, the new trigger is ignored. The trigger is also ignored when the person who asks is not named by the night (not a contact, and not a friend from when the night started).

So the friend's phone should show the check screen when `view.state` is `asking`. The old `incoming` list from `/state` is not enough.

### What to render for each alert in `alerts`

Show a responder screen for each item. Use the first item if there are several.

- Title: `card.title`. The "do" list: `card.do`. The "don't" list: `card.dont`. Show all three.
- If `acknowledged_by` is `null`, show a button "I'm on it". It calls `POST /safekeeps/alerts/{user_id}/ack`.
- If `acknowledged_by` is my id, hide that button and show a "Resolve" button. It calls `POST /safekeeps/alerts/{user_id}/resolve`. In a `duress` alert show "Resolve" from the start, because any duress contact can resolve it.
- If `acknowledged_by` is another id, show "Someone else is on it" and hide the button.
- If `location` is not `null`, show it. Use a GPS arrow, a map link, or both. If it is `null`, show "No location yet". It is `null` until the user's phone has sent a `LocationUpdate`. Show its age from `location_at`: "updated N min ago", with `now` from the same poll.
- If `stale_ack_by` is not `null`, show "<name> said they were on it but has not resolved it" and show "I'm on it" again.
- If `final_step` is `true`, show "Emergency services would be contacted now (SIMULATED)".
- When the alert is gone from `alerts` at the next poll, close the screen. That means someone resolved it.
- In a `duress` alert show the card text as it is. The card tells the contact not to call or text the person.

Location exists only during an active alert. After a resolve it is gone.

### Example flow

Alice starts a night. Ben asks her to check in. She does not answer.

1. Alice: `POST /safekeeps/night`. Answer: view `armed`.
2. Ben: `POST /safekeeps/friends/3f9a1c2e/requests`. The `friends` entry for Alice gets a `requestedAt`.
3. Alice: `GET /safekeeps/night`. Answer: `{"now": 1792229956.16, "view": {"state": "asking", "screen": "asking", "deadline": 1792229986.16, "ping_at": null}, "alerts": []}`.
4. Alice does nothing. After 30 seconds the view is `waiting` and `alarm`. After 15 more seconds it is `escalating` and `alert_active`.
5. Ben: `GET /safekeeps/night`. Answer: `view` is `null` and `alerts` has the alert about Alice.
6. Ben: `POST /safekeeps/alerts/3f9a1c2e/ack`. Alice's view becomes `acknowledged`. Ben's alert has `acknowledged_by` set to Ben.
7. Ben finds Alice: `POST /safekeeps/alerts/3f9a1c2e/resolve`. Alice's view is `armed` with `screen` `ended_true`. Ben's `alerts` is empty.

A duress flow:

1. Alice: `POST /safekeeps/night/events` with `{"type": "Duress"}`. Her view is `{"state": "armed", "screen": "thanks", "deadline": null, "ping_at": null}`, the same as after an ok.
2. Fia: `GET /safekeeps/night`. `alerts` has an item with `kind` set to `duress` and `card.title` of `Silent alert: they may be in danger`.
3. Ben: `GET /safekeeps/night`. `alerts` is `[]`. He is not a duress contact, so he sees nothing.
4. If Fia does not tap "I'm on it" within `ack_seconds`, the next duress contact is alerted.

### Test it by hand

Call `POST /demo/skip` with `{"seconds": 50}`. It moves the server clock for every night. Your app sees this at the next poll. Use it to jump to `alarm` and `alert_active` without waiting. Call it only in a demo. It answers 400 if the total skip would pass 1e9 seconds. `POST /demo/reset` clears all nights and the old demo users, but not the Safekeeps profiles.

The old phase 1 endpoints have no token (`POST /sessions`, `POST /sessions/{id}/events`, `GET /alerts`, `GET /sessions/{id}/view`, `/ws/{id}`, groups). They refuse the id of any Safekeeps phone that took part in a night: the answer is `403` (a closed socket for `/ws`). Phones use the endpoints in this section only.

Not tested by the server tests: the app on real phones, push or background polling, and the hold gesture. These need a manual test.
