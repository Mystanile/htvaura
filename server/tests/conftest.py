import pytest


@pytest.fixture(autouse=True)
def state_file(tmp_path, monkeypatch):
    """Every test saves the server state to its own temp file, never to server/kaze_state.pickle."""
    path = tmp_path / "kaze_state.pickle"
    monkeypatch.setenv("KAZE_STATE", str(path))
    return path
