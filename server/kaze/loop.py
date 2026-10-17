"""KAZE check-in state machine. Pure Python: no I/O, no clock, no UI.

Time comes in as `now`. `step` changes the session in place and returns effects.
`view_for` is the only place that decides who may see what.
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
class Session:
    config: Config
    state: str = "armed"  # armed asking waiting escalating acknowledged resolved duress ended
    deadline: float | None = None
    tier_index: int = -1
    alerted: list[str] = field(default_factory=list)
    acknowledged_by: str | None = None
    alert_kind: str | None = None
    wrong_pins: int = 0
    connected: bool = True
    location: tuple[float, float] | None = None
    screen: str = "armed"
    left: bool = False
    user_deadline: float | None = None  # shadow check timer in a hidden alert
    faked: bool = False  # the user was shown the fake "Alert ended"


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


def new_session(config: Config, now: float) -> Session:
    return Session(config=config)


def _to_user(s: Session, screen: str) -> Effect:
    s.screen = screen
    return Effect(s.config.user_id, "screen", {"screen": screen})


SHADOW_SCREENS = ("asking", "alarm", "alert_active")
SHADOW_STATE = {"asking": "asking", "alarm": "waiting", "alert_active": "escalating"}


def hidden(s: Session) -> bool:
    """A running alert the user must not be able to tell from an ok user."""
    return s.state == "duress" or (
        s.state in ("escalating", "acknowledged") and (s.faked or s.screen == "ended_fake"))


def _left_effects(s: Session) -> list[Effect]:
    return [Effect(m, "left", {"user_id": s.config.user_id}) for m in s.config.group]


def _groups(s: Session) -> list[list[str]]:
    # In duress every duress contact is its own tier.
    if s.state == "duress":
        return [[c] for c in s.config.duress_contacts]
    return s.config.tiers


def _alert_next_tier(s: Session, now: float) -> list[Effect]:
    """Alert the next tier. After the last tier, re-alert every contact. Restart the ack timer."""
    groups = _groups(s)
    n = s.tier_index + 1
    if n < len(groups):
        s.tier_index = n
        pairs = [(c, n + 1) for c in groups[n]]
    else:
        pairs = [(c, i + 1) for i, g in enumerate(groups) for c in g]
    s.deadline = now + s.config.ack_seconds
    effects = []
    for contact, tier in pairs:
        if contact not in s.alerted:
            s.alerted.append(contact)
        data = {"user_id": s.config.user_id, "kind": s.alert_kind, "card": card_for(s.alert_kind), "tier": tier}
        effects.append(Effect(contact, "alert", data))
    return effects


def _reset_alert(s: Session) -> None:
    s.tier_index = -1
    s.alerted = []
    s.acknowledged_by = None
    s.alert_kind = None
    s.deadline = None
    s.wrong_pins = 0
    s.user_deadline = None
    s.faked = False


def _night_over(s: Session, now: float) -> bool:
    end = s.config.night_ends_at
    return end is not None and now > end


def _on_trigger(s, e, now):
    if hidden(s):  # shadow check: the user sees what an ok user sees, no contact is told
        if s.left or s.screen in SHADOW_SCREENS:
            return []
        s.screen = "asking"
        s.user_deadline = now + s.config.ask_seconds
        return [Effect(s.config.user_id, "check", {"kind": e.kind, "deadline": s.user_deadline})]
    if s.state != "armed":
        return []
    s.state = "asking"
    s.alert_kind = e.kind
    s.deadline = now + s.config.ask_seconds
    s.screen = "asking"
    return [Effect(s.config.user_id, "check", {"kind": e.kind, "deadline": s.deadline})]


def _on_confirm_ok(s, e, now):
    if hidden(s):
        if s.left or s.screen not in ("asking", "alarm"):
            return []
        s.user_deadline = None
        return [_to_user(s, "thanks")]
    if s.state not in ("asking", "waiting"):
        return []
    s.state = "armed"
    s.deadline = None
    s.alert_kind = None
    return [_to_user(s, "thanks")]


def _on_duress(s, e, now):
    if hidden(s):  # alert already running: looks like ok
        if s.left or s.screen == "alert_active":
            return []
        s.user_deadline = None
        return [_to_user(s, "thanks")]
    if s.state not in ("armed", "asking", "waiting"):
        return []
    s.state = "duress"
    s.alert_kind = "duress"
    effects = [_to_user(s, "thanks")]  # exactly what ConfirmOk shows
    return effects + _alert_next_tier(s, now)  # tier 1 = duress contact 1 only


def _tick_shadow(s, now) -> list[Effect]:
    """Move the shadow check of a hidden alert like an ok user's check. Never alerts a contact."""
    effects = []
    if s.left:
        return effects
    if s.user_deadline is not None and now >= s.user_deadline:
        if s.screen == "asking":
            s.user_deadline += s.config.grace_seconds
            s.screen = "alarm"
            effects.append(Effect(s.config.user_id, "alarm", {"deadline": s.user_deadline}))
        if s.screen == "alarm" and now >= s.user_deadline:
            s.user_deadline = None
            effects.append(_to_user(s, "alert_active"))
    elif s.screen not in SHADOW_SCREENS and _night_over(s, now):
        s.left = True  # the alert keeps running, the user view shows ended
        effects += _left_effects(s)
    return effects


def _on_tick(s, e, now):
    effects = _tick_shadow(s, now) if hidden(s) else []
    due = s.deadline is not None and now >= s.deadline
    if s.state == "asking" and due:
        s.state = "waiting"
        s.deadline += s.config.grace_seconds  # counted from the ask deadline, so one big skip still catches up
        effects.append(Effect(s.config.user_id, "alarm", {"deadline": s.deadline}))
        s.screen = "alarm"
        due = now >= s.deadline
    if s.state == "waiting" and due:
        s.state = "escalating"
        effects.append(_to_user(s, "alert_active"))
        effects += _alert_next_tier(s, now)
    elif s.state in ("escalating", "duress") and due:
        effects += _alert_next_tier(s, now)
    elif s.state == "resolved":
        _reset_alert(s)
        if s.left:
            s.state = "ended"
        elif _night_over(s, now):
            s.state = "ended"
            effects += _left_effects(s)
        else:
            s.state = "armed"
    elif s.state == "armed" and _night_over(s, now):
        s.state = "ended"
        effects += _left_effects(s)
    return effects


def _on_ack(s, e, now):
    if s.state not in ("escalating", "duress") or e.contact_id not in s.alerted or s.acknowledged_by:
        return []
    if s.state == "escalating":
        s.state = "acknowledged"
    s.acknowledged_by = e.contact_id
    s.deadline = None
    data = {"user_id": s.config.user_id, "acknowledged_by": e.contact_id}
    return [Effect(c, "owner", data) for c in s.alerted if c != e.contact_id]


def _on_resolve(s, e, now):
    if s.state not in ("escalating", "acknowledged", "duress"):
        return []
    c = s.config
    if e.by is None:
        return []
    contact = e.by != c.user_id
    if contact:
        allowed = c.duress_contacts if s.state == "duress" else [s.acknowledged_by]
        if e.by not in allowed:
            return []
    elif e.pin != c.pin:
        s.wrong_pins += 1
        if s.wrong_pins == 1:
            return [_to_user(s, "pin_retry")]
        s.faked = True
        effects = [_to_user(s, "ended_fake")]
        return effects + [Effect(a, "wrong_pin_warning", {"user_id": c.user_id}) for a in s.alerted]
    quiet = contact and hidden(s)  # the user of a hidden alert is told nothing
    s.state = "resolved"
    s.deadline = None
    s.user_deadline = None
    s.location = None
    s.wrong_pins = 0
    effects = [] if quiet else [_to_user(s, "ended_true")]
    return effects + [Effect(a, "resolved", {"user_id": c.user_id}) for a in s.alerted]


def _on_leave(s, e, now):
    if s.state == "ended" or s.left:
        return []
    if hidden(s):
        if s.screen == "alert_active":  # an ok user cannot leave a running alert either
            return []
        s.left = True  # alert keeps running, user view shows ended
        s.user_deadline = None
    elif s.state in ("escalating", "acknowledged"):
        return []
    else:
        s.state = "ended"
        s.deadline = None
    return _left_effects(s)


def _on_disconnect(s, e, now):
    s.connected = False
    return []


def _on_reconnect(s, e, now):
    s.connected = True
    return []


def _on_location(s, e, now):
    s.location = (e.lat, e.lng)
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
    if viewer_id == c.user_id:
        if hidden(s):  # same as an ok user at this screen
            state = SHADOW_STATE.get(s.screen, "armed")
            deadline = s.user_deadline if state in ("asking", "waiting") else None
        else:
            state = "armed" if s.state == "resolved" else s.state
            deadline = s.deadline if s.state in ("asking", "waiting") else None
        if s.left:
            state, deadline = "ended", None
        return {"state": state, "screen": s.screen, "deadline": deadline}
    if viewer_id not in s.alerted or s.state not in ("escalating", "acknowledged", "duress"):
        return {"user_id": c.user_id, "active": False}
    sees_location = c.share_location_with == "alerted" or viewer_id == s.acknowledged_by
    return {
        "user_id": c.user_id,
        "active": True,
        "kind": s.alert_kind,
        "card": card_for(s.alert_kind),
        "acknowledged_by": s.acknowledged_by,
        "location": s.location if sees_location else None,
    }
