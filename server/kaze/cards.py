"""Response card text per alert kind. Plain data, no logic."""

_CARDS = {
    "home_by": {
        "title": "Did not get home on time",
        "do": ["Call or text them now", "If no answer, go to their last known spot", "Call emergency services if you cannot reach them"],
        "dont": ["Do not assume they are just late"],
    },
    "separation": {
        "title": "Separated from the group",
        "do": ["Call or text them now", "Check where they were last seen", "Meet up with another friend before you go looking"],
        "dont": ["Do not go looking alone at night"],
    },
    "periodic": {
        "title": "Missed a check-in",
        "do": ["Call or text them now", "If no answer, go to their last known spot"],
        "dont": ["Do not wait for the next check-in"],
    },
    "manual": {
        "title": "Asked for a check and did not answer",
        "do": ["Call or text them now", "Go to their location if you can"],
        "dont": ["Do not ignore this alert"],
    },
    "duress": {
        "title": "Silent alert: they may be in danger",
        "do": ["Tap 'I'm on it' so others know you have this", "Go there with another person", "Call emergency services if you think they are in danger"],
        "dont": ["Do not call their phone", "Do not text to ask if they are okay", "Do not go there alone"],
    },
}


def card_for(kind: str) -> dict:
    card = _CARDS[kind]
    return {"title": card["title"], "do": list(card["do"]), "dont": list(card["dont"])}
