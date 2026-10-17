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
    share_location_with: str = "alerted"  # "alerted" or "acknowledger"
    ask_seconds: float = 30
    grace_seconds: float = 15
    ack_seconds: float = 20
    night_ends_at: float | None = None


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
    pin: str = ""  # the PIN of the night that raised it: only this PIN ends it later


@dataclass
class Session:
    config: Config
    # the front
    state: str = "armed"  # armed asking waiting escalating acknowledged resolved ended
    deadline: float | None = None  # ask and grace timers
    screen: str = "armed"
    wrong_pins: int = 0
    check_kind: str | None = None  # why the current check started
    front_alert: Alert | None = None  # the user's own alert, while escalating or acknowledged
    # the alerts
    alerts: list[Alert] = field(default_factory=list)
    connected: bool = True
    location: tuple[float, float] | None = None  # the front's last position, cleared when the front ends


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
    if carry:
        s.alerts = [a for a in _active(carry) if a.hidden]  # each keeps its own location
    return s


def _active(s: Session) -> list[Alert]:
    return [a for a in s.alerts if a.state != "resolved"]


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


def _alert_next_tier(s: Session, a: Alert, now: float) -> list[Effect]:
    """Alert the next tier. After the last tier, re-alert every contact. Restart the ack timer."""
    n = a.tier_index + 1
    if n < len(a.tiers):
        a.tier_index = n
        pairs = [(c, n + 1) for c in a.tiers[n]]
    else:
        pairs = [(c, i + 1) for i, g in enumerate(a.tiers) for c in g]
    a.deadline = now + s.config.ack_seconds
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


def _viewed(s: Session, contact: str) -> Alert | None:
    """The alert this contact sees. One that someone else took comes last.

    View, Ack and Resolve all use this, so a contact only ever acts on the alert on their screen.
    """
    mine = [a for a in _active(s) if contact in a.alerted]
    return _pick([a for a in mine if a.acknowledged_by in (None, contact)] or mine)


def _resolve(s: Session, alerts: list[Alert]) -> list[Effect]:
    """End these alerts and tell their contacts. Their location stops."""
    effects = _told(s, alerts, "resolved")
    for a in alerts:
        a.state = "resolved"
        a.deadline = None
        a.location = None
    return effects


def _end_front(s: Session) -> None:
    """The front acts as if its alert is over. The alert itself is not touched."""
    s.wrong_pins = 0
    s.location = None
    if s.front_alert:
        s.front_alert = None
        s.state = "resolved"


# ---------- front events: these read only front fields ----------

def _on_trigger(s, e, now):
    if s.state != "armed":
        return []
    s.state = "asking"
    s.check_kind = e.kind
    s.deadline = now + s.config.ask_seconds
    s.screen = "asking"
    return [Effect(s.config.user_id, "check", {"kind": e.kind, "deadline": s.deadline})]


def _front_ok(s: Session) -> list[Effect] | None:
    """The user says they are okay. None if the front does not take it."""
    if s.state not in ("armed", "asking", "waiting"):
        return None
    s.state = "armed"
    s.deadline = None
    s.check_kind = None
    return [_to_user(s, "thanks")]


def _on_confirm_ok(s, e, now):
    return _front_ok(s) or []


def _on_duress(s, e, now):
    effects = _front_ok(s)  # the front does exactly what ConfirmOk does
    if effects is None:
        return []
    tiers = [[c] for c in s.config.duress_contacts]
    # one open duress alert at a time. One that someone already took does not count.
    if not any(a.state == "duress" and not a.acknowledged_by and a.tiers == tiers for a in _active(s)):
        a = Alert(kind="duress", tiers=tiers, state="duress", hidden=True, location=s.location, pin=s.config.pin)
        s.alerts.append(a)
        effects += _alert_next_tier(s, a, now)  # tier 1 = duress contact 1 only
    return effects


def _on_user_resolve(s, e):
    if s.state == "ended":
        return []
    # A PIN ends the alerts raised under it. An older night's PIN still ends the alerts carried from that night.
    # The front looks only at the PIN of this night.
    mine = [a for a in _active(s) if a.pin == e.pin]
    if e.pin == s.config.pin:
        effects = [_to_user(s, "ended_true")]
        _end_front(s)
        return effects + _resolve(s, mine)
    s.wrong_pins += 1
    if s.wrong_pins == 1:
        return [_to_user(s, "pin_retry")] + _resolve(s, mine)
    effects = [_to_user(s, "ended_fake")]
    if s.front_alert:
        s.front_alert.hidden = True  # it keeps escalating, but the front acts as if it ended
    _end_front(s)
    return effects + _resolve(s, mine) + _told(s, _active(s), "wrong_pin_warning")


def _on_leave(s, e, now):
    if s.state not in ("armed", "asking", "waiting", "resolved"):
        return []  # in an alert the user must cancel with the PIN first
    s.state = "ended"
    s.deadline = None
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
        s.front_alert = Alert(kind=s.check_kind, tiers=s.config.tiers, location=s.location, pin=s.config.pin)
        s.alerts.append(s.front_alert)
        s.check_kind = None
        effects.append(_to_user(s, "alert_active"))
        effects += _alert_next_tier(s, s.front_alert, now)
    elif s.state in ("armed", "resolved") and _night_over(s, now):
        s.state = "ended"
        effects += _left_effects(s)
    elif s.state == "resolved":
        s.state = "armed"
    return effects


# ---------- alert events ----------

def _on_tick(s, e, now):
    effects = _tick_front(s, now)
    for a in _active(s):
        if a.deadline is not None and now >= a.deadline:
            effects += _alert_next_tier(s, a, now)
    return effects


def _on_ack(s, e, now):
    """A contact takes the alert on their screen that nobody has taken yet."""
    a = _pick([a for a in _active(s) if e.contact_id in a.alerted and not a.acknowledged_by])
    if a is None:
        return []
    a.acknowledged_by = e.contact_id
    a.deadline = None
    if a.state == "escalating":
        a.state = "acknowledged"
    if a is s.front_alert:
        s.state = "acknowledged"
    data = {"user_id": s.config.user_id, "acknowledged_by": e.contact_id}
    return [Effect(c, "owner", data) for c in a.alerted if c != e.contact_id]


def _may_resolve(a: Alert, contact: str) -> bool:
    if a.state == "duress":
        return any(contact in tier for tier in a.tiers)
    return contact == a.acknowledged_by


def _on_contact_resolve(s, e):
    """A contact ends the one alert on their screen. A duress contact not yet alerted may end a duress alert."""
    a = _viewed(s, e.by) or _pick([a for a in _active(s) if a.state == "duress"])
    if a is None or not _may_resolve(a, e.by):
        return []
    effects = []
    if a is s.front_alert:
        _end_front(s)
        effects.append(_to_user(s, "ended_true"))
    return effects + _resolve(s, [a])  # a hidden alert sends nothing to the user


def _on_resolve(s, e, now):
    if e.by is None:
        return []
    if e.by == s.config.user_id:
        return _on_user_resolve(s, e)
    return _on_contact_resolve(s, e)


def _on_disconnect(s, e, now):
    s.connected = False
    return []


def _on_reconnect(s, e, now):
    s.connected = True
    return []


def _on_location(s, e, now):
    s.location = (e.lat, e.lng)
    for a in _active(s):
        a.location = s.location
    return []


_HANDLERS = {
    Trigger: _on_trigger,
    ConfirmOk: _on_confirm_ok,
    Duress: _on_duress,
    Tick: _on_tick,
    Ack: _on_ack,
    Resolve: _on_resolve,
    Disconnect: _on_disconnect,
    Reconnect: _on_reconnect,
    LocationUpdate: _on_location,
    Leave: _on_leave,
}


def step(session: Session, event, now: float) -> tuple[Session, list[Effect]]:
    """Apply one event. Changes the session in place."""
    return session, _HANDLERS[type(event)](session, event, now)


def view_for(session: Session, viewer_id: str) -> dict:
    s, c = session, session.config
    if viewer_id == c.user_id:  # the front only
        state = "armed" if s.state == "resolved" else s.state
        deadline = s.deadline if s.state in ("asking", "waiting") else None
        return {"state": state, "screen": s.screen, "deadline": deadline}
    a = _viewed(s, viewer_id)
    if a is None:
        return {"user_id": c.user_id, "active": False}
    sees_location = c.share_location_with == "alerted" or viewer_id == a.acknowledged_by
    return {
        "user_id": c.user_id,
        "active": True,
        "kind": a.kind,
        "card": card_for(a.kind),
        "acknowledged_by": a.acknowledged_by,
        "location": a.location if sees_location else None,
    }
