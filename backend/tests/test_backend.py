from __future__ import annotations

from fastapi.testclient import TestClient

from backend.alert_pipeline import CreatureAlert, parse_alert
from backend.creatures import CREATURES
from backend.main import app


def test_health_and_agent_registry() -> None:
    client = TestClient(app)
    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"
    assert health.json()["agents_sdk"] is True
    assert {"pyre", "fetch", "sight", "lode"}.issubset(CREATURES)


def test_websocket_connect_and_ping() -> None:
    client = TestClient(app)
    with client.websocket_connect("/ws") as websocket:
        connected = websocket.receive_json()
        assert connected["type"] == "connected"
        websocket.send_json({"type": "ping"})
        assert websocket.receive_json() == {"type": "pong"}


def test_alert_pipeline_accepts_structured_json() -> None:
    alert = parse_alert(
        '{"headline":"Unused SaaS","details":"Mixpanel unused","impact":"$350/mo","recommendation":"Cancel it"}'
    )
    assert isinstance(alert, CreatureAlert)
    assert alert.headline == "Unused SaaS"
