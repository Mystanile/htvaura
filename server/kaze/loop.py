"""KAZE check-in state machine. Pure Python: no I/O, no clock, no UI.

Time comes in as `now`. `step` changes the session in place and returns effects.
`view_for` is the only place that decides who may see what.

A session has two parts.
- The front is the loop the user sees. It runs the same way for every user.
  Its states are armed, asking, waiting, escalating, acknowledged, resolved, ended.
  Front code reads only front fields and whether a PIN is right. It never looks at hidden alerts.
- The alerts are what the contacts see. An alert is hidden when the user's phone shows no sign of it.
  Contacts act on alerts. They never act on the front directly.
- Each alert keeps its own location. The front location (`Session.location`) follows the rules of an honest
  user: it is set by a location update and cleared when the front ends. A hidden alert never changes it.
"""
from dataclasses import dataclass, field

from .cards import card_for


@dataclass
class Config:
    user_id: str
    pin: str
    tiers: list[list[str]]
    duress_contacts: list[str]
    group: list[str]
    duress_pin: str | None = None  # looks like the right PIN to the user, but silently alerts the duress contacts
    share_location_with: str = "alerted"  # "alerted" or "acknowledger"
    ask_seconds: float = 30
    grace_seconds: float = 15
    ack_seconds: float = 20
    ack_hold_seconds: float = 120  # a taken alert goes back out if nobody ends it in this time (demo value)
    night_ends_at: float | None = None
    home_by: float | None = None  # server clock time: one check starts then, once per night
    check_every_seconds: float | None = None  # a periodic check starts this long after the front is armed


@dataclass
class Alert:
    kind: str  # trigger kind, or "duress"
    tiers: list[list[str]]  # for duress every duress contact is its own tier
    tier_index: int = -1  # last tier alerted
    alerted: list[str] = field(default_factory=list)  # in order, no duplicates
    acknowledged_by: str | None = None
    deadline: float | None = None  # ack timer
    state: str = "escalating"  # escalating acknowledged resolved duress
    hidden: bool = False
    location: tuple[float, float] | None = None  # the last position while this alert runs
    location_at: float | None = None  # when `location` was last updated
    pin: str = ""  # the PIN of the night that raised it: only this PIN ends it later
    stale_ack_by: str | None = None  # took the alert but did not end it in ack_hold_seconds
    rounds: int = 0  # re-alert rounds sent after the last tier
    final_step: bool = False  # SIMULATED: emergency services would be contacted now


@dataclass
class Session:
    config: Config
    # the front
    state: str = "armed"  # armed asking waiting escalating acknowledged resolved ended
    deadline: float | None = None  # ask and grace timers
    screen: str = "armed"
    wrong_pins: int = 0
    check_kind: str | None = None  # why the current check started
    next_check: float | None = None  # when the front is armed: the time of the next periodic check
    home_by_done: bool = False  # the home_by check has started
    pin_ended: bool = False  # a PIN showed an end screen. Until the next check every PIN shows it again
    front_alert: Alert | None = None  # the user's own alert, while escalating or acknowledged
    # the alerts
    alerts: list[Alert] = field(default_factory=list)
    connected: bool = True
    location: tuple[float, float] | None = None  # the front's last position, cleared when the front ends
    location_at: float | None = None  # when `location` was last updated
    ping_at: float | None = None  # when a contact last pinged the front alert, cleared when the front ends


@dataclass
class Effect:
    to: str
    kind: str
    data: dict


# Events
@dataclass
class Trigger:
    kind: str  # home_by, separation, periodic, manual

@dataclass
class ConfirmOk: pass

@dataclass
class Duress: pass

@dataclass
class Tick: pass

@dataclass
class Ack:
    contact_id: str

@dataclass
class Ping:
    contact_id: str

@dataclass
class Resolve:
    by: str
    pin: str | None = None

@dataclass
class Disconnect: pass

@dataclass
class Reconnect: pass

@dataclass
class LocationUpdate:
    lat: float
    lng: float

@dataclass
class Leave: pass


def new_session(config: Config, now: float, carry: Session | None = None) -> Session:
    """A new night. `carry` is the previous session: its hidden alerts that still run move over."""
    s = Session(config=config)
    _arm(s, now)
    if carry:
        s.alerts = [a for a in _active(carry) if a.hidden]  # each keeps its own location
    return s


def _active(s: Session) -> list[Alert]:
    return [a for a in s.alerts if a.state != "resolved"]


def _arm(s: Session, now: float) -> None:
    """The front is armed. Plan the next periodic check."""
    every = s.config.check_every_seconds
    s.state = "armed"
    s.next_check = None if every is None else now + every


def _to_user(s: Session, screen: str) -> Effect:
    s.screen = screen
    return Effect(s.config.user_id, "screen", {"screen": screen})


def _told(s: Session, alerts: list[Alert], kind: str) -> list[Effect]:
    """One effect for each contact alerted in any of these alerts."""
    contacts = dict.fromkeys(c for a in alerts for c in a.alerted)
    return [Effect(c, kind, {"user_id": s.config.user_id}) for c in contacts]


def _left_effects(s: Session) -> list[Effect]:
    return [Effect(m, "left", {"user_id": s.config.user_id}) for m in s.config.group]


def _night_over(s: Session, now: float) -> bool:
    end = s.config.night_ends_at
    return end is not None and now > end


REALERT_GAPS = (60, 120, 300)  # seconds between re-alert rounds after the last tier, then 300 for good
FINAL_STEP_ROUNDS = 3  # re-alert rounds in a row nobody took before the simulated final step


def _alert_next_tier(s: Session, a: Alert, now: float) -> list[Effect]:
    """Alert the next tier. After the last tier, re-alert every contact, with longer gaps each round."""
    n = a.tier_index + 1
    if n < len(a.tiers):
        a.tier_index = n
        pairs = [(c, n + 1) for c in a.tiers[n]]
        a.deadline = now + s.config.ack_seconds
    else:
        pairs = [(c, i + 1) for i, g in enumerate(a.tiers) for c in g]
        if a.rounds >= FINAL_STEP_ROUNDS:
            a.final_step = True  # ponytail: a flag only, a real product would call a dispatcher here
        a.deadline = now + REALERT_GAPS[min(a.rounds, len(REALERT_GAPS) - 1)]
        a.rounds += 1
    effects = []
    for contact, tier in pairs:
        if contact not in a.alerted:
            a.alerted.append(contact)
        data = {"user_id": s.config.user_id, "kind": a.kind, "card": card_for(a.kind), "tier": tier}
        effects.append(Effect(contact, "alert", data))
    return effects


def _pick(alerts: list[Alert]) -> Alert | None:
    """The alert on top of a contact's screen: a duress alert first, else the newest."""
    return next((a for a in reversed(alerts) if a.state == "duress"), alerts[-1] if alerts else None)


def _viewed(s: Session, contact: str, plain_only: bool = False) -> Alert | None:
    """The alert this contact sees. One that someone else took comes last.

    View, Ack and Resolve all use this, so a contact only ever acts on the alert on their screen.
    `plain_only` leaves out duress alerts: the alert this contact would see in a night with no duress.
    """
    mine = [a for a in _active(s) if contact in a.alerted and not (plain_only and a.state == "duress")]
    return _pick([a for a in mine if a.acknowledged_by in (None, contact)] or mine)


def _resolve(s: Session, alerts: list[Alert]) -> list[Effect]:
    """End these alerts and tell their contacts. Their location stops."""
    effects = _told(s, alerts, "resolved")
    for a in alerts:
        a.state = "resolved"
        a.deadline = None
        a.location = a.location_at = None
    return effects


def _end_front(s: Session) -> None:
    """The front acts as if its alert is over. The alert itself is not touched."""
    s.wrong_pins = 0
    s.location = s.location_at = None
    s.ping_at = None
    if s.front_alert:
        s.front_alert = None
        s.state = "resolved"


# ---------- front events: these read only front fields ----------

def _on_trigger(s, e, now):
    if s.state != "armed":
        return []
    s.state = "asking"
    s.pin_ended = False
    s.check_kind = e.kind
    s.deadline = now + s.config.ask_seconds
    s.screen = "asking"
    return [Effect(s.config.user_id, "check", {"kind": e.kind, "deadline": s.deadline})]


def _front_ok(s: Session, now: float) -> list[Effect] | None:
    """The user says they are okay. None if the front does not take it."""
    if s.state not in ("armed", "asking", "waiting"):
        return None
    if s.state != "armed":  # an ok while armed must not push the next periodic check back
        _arm(s, now)
    s.deadline = None
    s.check_kind = None
    return [_to_user(s, "thanks")]


def _on_confirm_ok(s, e, now):
    return _front_ok(s, now) or []


def _raise_duress(s: Session, now: float) -> list[Effect]:
    """Start a hidden duress alert. Takes the front location, so call it before the front ends."""
    tiers = [[c] for c in s.config.duress_contacts]
    # one open duress alert at a time. One that someone already took does not count.
    if any(a.state == "duress" and not a.acknowledged_by and a.tiers == tiers for a in _active(s)):
        return []
    a = Alert(kind="duress", tiers=tiers, state="duress", hidden=True, location=s.location,
              location_at=s.location_at, pin=s.config.pin)
    s.alerts.append(a)
    return _alert_next_tier(s, a, now)  # tier 1 = duress contact 1 only


def _on_duress(s, e, now):
    # The front does exactly what ConfirmOk does, which is nothing in an alert or after the end.
    # The duress alert starts in every front state, as for the duress PIN. ConfirmOk changes nothing
    # in the other states either, so a watcher still cannot tell the two apart.
    return (_front_ok(s, now) or []) + _raise_duress(s, now)


def _on_user_resolve(s, e, now):
    if s.config.duress_pin is not None and e.pin == s.config.duress_pin:
        return _on_duress_pin(s, now)
    if s.state == "ended":
        return []
    # A PIN ends the alerts raised under it. An older night's PIN still ends the alerts carried from that night.
    # The front looks only at the PIN of this night.
    mine = [a for a in _active(s) if a.pin == e.pin]
    if e.pin == s.config.pin:
        effects = [_to_user(s, "ended_true")]
        _end_front(s)
        s.pin_ended = True
        return effects + _resolve(s, mine)
    if s.pin_ended and s.front_alert is None:  # no more guesses: a wrong PIN looks like the right one
        return [_to_user(s, "ended_fake")] + _resolve(s, mine)
    s.wrong_pins += 1
    if s.wrong_pins == 1:
        return [_to_user(s, "pin_retry")] + _resolve(s, mine)
    effects = [_to_user(s, "ended_fake")]
    if s.front_alert:
        s.front_alert.hidden = True  # it keeps escalating, but the front acts as if it ended
    _end_front(s)
    s.pin_ended = True
    return effects + _resolve(s, mine) + _told(s, _active(s), "wrong_pin_warning")


def _on_duress_pin(s, now):
    """The front does exactly what the right PIN does. Nothing is resolved: the user's own alert goes on
    hidden, as after a fake end but with no warning, and a duress alert starts."""
    help_ = _raise_duress(s, now)  # first: it takes the front location, which the end clears
    if s.state == "ended":
        return help_
    effects = [_to_user(s, "ended_true")]
    if s.front_alert:
        s.front_alert.hidden = True
    _end_front(s)
    s.pin_ended = True
    return effects + help_


def _on_leave(s, e, now):
    if s.state not in ("armed", "resolved"):
        return []  # a check must be answered, and an alert cancelled with the PIN, before leaving
    s.state = "ended"
    s.deadline = None
    s.location = s.location_at = None  # the ended front keeps no position
    return _left_effects(s)


def _tick_front(s, now) -> list[Effect]:
    effects = []
    due = s.deadline is not None and now >= s.deadline
    if s.state == "asking" and due:
        s.state = "waiting"
        s.deadline += s.config.grace_seconds  # counted from the ask deadline, so one big skip still catches up
        effects.append(Effect(s.config.user_id, "alarm", {"deadline": s.deadline}))
        s.screen = "alarm"
        due = now >= s.deadline
    if s.state == "waiting" and due:
        s.state = "escalating"
        s.deadline = None
        s.front_alert = Alert(kind=s.check_kind, tiers=s.config.tiers, location=s.location,
                              location_at=s.location_at, pin=s.config.pin)
        s.alerts.append(s.front_alert)
        s.check_kind = None
        effects.append(_to_user(s, "alert_active"))
        effects += _alert_next_tier(s, s.front_alert, now)
    elif s.state in ("armed", "resolved") and _night_over(s, now):
        s.state = "ended"
        s.location = s.location_at = None
        effects += _left_effects(s)
    elif s.state == "armed" and s.config.home_by is not None and not s.home_by_done and now >= s.config.home_by:
        s.home_by_done = True  # a check that runs now delays this one: the front is not armed
        effects += _on_trigger(s, Trigger("home_by"), now)
    elif s.state == "armed" and s.next_check is not None and now >= s.next_check:
        effects += _on_trigger(s, Trigger("periodic"), now)
    elif s.state == "resolved":
        _arm(s, now)
    return effects


# ---------- alert events ----------

def _on_tick(s, e, now):
    effects = _tick_front(s, now)
    for a in _active(s):
        if a.deadline is not None and now >= a.deadline:
            if a.acknowledged_by:  # taken but not ended in time: it goes back out. Alert fields only.
                a.stale_ack_by, a.acknowledged_by = a.acknowledged_by, None
                if a.state == "acknowledged":
                    a.state = "escalating"
                effects.append(Effect(a.stale_ack_by, "ack_stale", {"user_id": s.config.user_id}))
            effects += _alert_next_tier(s, a, now)
    return effects


def _on_ack(s, e, now):
    """A contact takes the alert on their screen that nobody has taken yet."""
    free = [a for a in _active(s) if e.contact_id in a.alerted and not a.acknowledged_by]
    a = _pick(free)
    if a is None:
        return []
    f = s.front_alert
    # The duress alert is on top for a shared contact, but the plain alert must be taken too: a contact who
    # is only in the tiers must not see an alert that nobody took just because a duress alert exists.
    wanted = [a, _pick([x for x in free if x.state != "duress"]), f if any(f is x for x in free) else None]
    targets = list({id(t): t for t in wanted if t is not None}.values())
    data = {"user_id": s.config.user_id, "acknowledged_by": e.contact_id}
    effects = []
    for t in targets:  # the front alert is taken whenever this contact may take it
        t.acknowledged_by = e.contact_id
        t.stale_ack_by = None
        t.rounds = 0  # the final step counts only rounds nobody took, so a take starts the count again
        t.deadline = now + s.config.ack_hold_seconds
        if t.state == "escalating":
            t.state = "acknowledged"
        if t is f:
            s.state = "acknowledged"
        effects += [Effect(c, "owner", data) for c in t.alerted if c != e.contact_id]
    return effects


def _on_ping(s, e, now):
    """A contact makes the user's phone ring. Only the visible front alert counts, never a hidden one:
    a ringing phone would show a duress alert to a watcher. Reads front fields only."""
    f = s.front_alert
    if f is None or f.hidden or s.state not in ("escalating", "acknowledged"):
        return []
    if e.contact_id not in f.alerted or f.acknowledged_by not in (None, e.contact_id):
        return []
    s.ping_at = now
    return [Effect(s.config.user_id, "ping", {"at": now})]


def _may_resolve(a: Alert, contact: str) -> bool:
    if a.state == "duress":
        return any(contact in tier for tier in a.tiers)
    return contact == a.acknowledged_by


def _on_contact_resolve(s, e):
    """A contact ends the one alert on their screen. A duress contact not yet alerted may end a duress alert.

    The front alert also ends when this contact may end it, so the front depends only on front rules.
    """
    a = _viewed(s, e.by) or _pick([a for a in _active(s) if a.state == "duress"])
    # As in _on_ack: a shared contact who sees the duress alert also ends the plain alert they would see.
    wanted = [a, _viewed(s, e.by, plain_only=True), s.front_alert]
    targets = list({id(t): t for t in wanted if t is not None and _may_resolve(t, e.by)}.values())
    f = s.front_alert
    effects = []
    if any(t is f for t in targets):
        _end_front(s)
        effects.append(_to_user(s, "ended_true"))
    return effects + _resolve(s, targets)  # a hidden alert sends nothing to the user


def _on_resolve(s, e, now):
    if e.by is None:
        return []
    if e.by == s.config.user_id:
        return _on_user_resolve(s, e, now)
    return _on_contact_resolve(s, e)


def _on_disconnect(s, e, now):
    s.connected = False
    return []


def _on_reconnect(s, e, now):
    s.connected = True
    return []


def _on_location(s, e, now):
    here = (e.lat, e.lng)
    if s.state != "ended":
        s.location, s.location_at = here, now  # an ended front keeps no position
    for a in _active(s):
        a.location, a.location_at = here, now
    return []


_HANDLERS = {
    Trigger: _on_trigger,
    ConfirmOk: _on_confirm_ok,
    Duress: _on_duress,
    Tick: _on_tick,
    Ack: _on_ack,
    Ping: _on_ping,
    Resolve: _on_resolve,
    Disconnect: _on_disconnect,
    Reconnect: _on_reconnect,
    LocationUpdate: _on_location,
    Leave: _on_leave,
}


def step(session: Session, event, now: float) -> tuple[Session, list[Effect]]:
    """Apply one event. Changes the session in place."""
    if session.state == "resolved" and type(event) in (Trigger, ConfirmOk, Duress):
        _arm(session, now)  # the user view already shows armed, so these must work now
    return session, _HANDLERS[type(event)](session, event, now)


def view_for(session: Session, viewer_id: str) -> dict:
    s, c = session, session.config
    if viewer_id == c.user_id:  # the front only
        state = "armed" if s.state == "resolved" else s.state
        deadline = s.deadline if s.state in ("asking", "waiting") else None
        view = {"state": state, "screen": s.screen, "deadline": deadline, "ping_at": s.ping_at}
        if c.home_by is not None and not s.home_by_done:
            view["home_by"] = c.home_by  # only in the user's own view, and only while the check waits
        return view
    a = _viewed(s, viewer_id)
    if a is None:
        return {"user_id": c.user_id, "active": False}
    sees_location = (c.share_location_with == "alerted" or viewer_id == a.acknowledged_by) and a.location is not None
    return {
        "user_id": c.user_id,
        "active": True,
        "kind": a.kind,
        "card": card_for(a.kind),
        "acknowledged_by": a.acknowledged_by,
        "location": a.location if sees_location else None,
        "location_at": a.location_at if sees_location else None,
        "stale_ack_by": a.stale_ack_by,
        "final_step": a.final_step,
    }
