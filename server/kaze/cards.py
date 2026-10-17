"""Response card text per alert kind. Plain data, no logic."""

# What to do once you reach someone who may not be able to look after themselves. No diagnosis.
_WITH_THEM = [
    "Stay with them once you find them",
    "If they are drowsy, lay them on their side",
    "Call emergency services if you cannot wake them or their breathing seems off",
]
_NOT = ["Do not leave them alone", "Do not let them leave with someone they just met"]

_CARDS = {
    "home_by": {
        "title": "Did not get home on time",
        "do": ["Call or text them now", "If no answer, go to their last known spot", *_WITH_THEM],
        "dont": ["Do not assume they are just late", *_NOT],
    },
    "separation": {
        "title": "Separated from the group",
        "do": ["Call or text them now", "Check where they were last seen", "Meet up with another friend before you go looking", *_WITH_THEM],
        "dont": ["Do not go looking alone at night", *_NOT],
    },
    "periodic": {
        "title": "Missed a check-in",
        "do": ["Call or text them now", "If no answer, go to their last known spot", *_WITH_THEM],
        "dont": ["Do not wait for the next check-in", *_NOT],
    },
    "manual": {
        "title": "Asked for a check and did not answer",
        "do": ["Call or text them now", "Go to their location if you can", *_WITH_THEM],
        "dont": ["Do not ignore this alert", *_NOT],
    },
    "duress": {
        "title": "Silent alert: they may be in danger",
        "do": ["Tap 'I'm on it' so others know you have this", "Go there with another person",
               "Call emergency services if you think they are in danger", *_WITH_THEM],
        "dont": ["Do not call their phone", "Do not text to ask if they are okay", "Do not go there alone", *_NOT],
    },
}


def card_for(kind: str) -> dict:
    card = _CARDS[kind]
    return {"title": card["title"], "do": list(card["do"]), "dont": list(card["dont"])}
