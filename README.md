# KAZE (htvaura)

A group safety app for the Hack the Valley 11 Project KAZE challenge. Every trigger becomes a check first: the app asks "are you okay?". One tap means fine. Only silence or a hidden duress signal alerts your contacts.

See `PLAN.md` for the design and progress, and `DEMO_NOTES.md` for what is real, simulated, and assumed.

## Run the server

You need Python 3.

```
cd server
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

The server and tests come in phase 1. This section gets the run commands then.
