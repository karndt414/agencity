from __future__ import annotations

import asyncio

from fastapi.testclient import TestClient
from agents import WebSearchTool

import backend.creature_manager as creature_manager
from backend.alert_pipeline import CreatureAlert, parse_alert
from backend.creatures import CREATURES
from backend.creature_manager import select_quest_coordinator
from backend.main import app


def test_health_and_agent_registry() -> None:
    client = TestClient(app)
    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"
    assert health.json()["agents_sdk"] is True
    assert {"pyre", "fetch", "sight", "lode"}.issubset(CREATURES)
    assert all(
        any(isinstance(tool, WebSearchTool) for tool in CREATURES[name].tools)
        for name in ("pyre", "fetch", "sight", "lode")
    )


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


def test_quest_dispatches_to_existing_creature(monkeypatch) -> None:
    captured: dict[str, object] = {}

    async def fake_direct_creatures(names, quest, data_by_creature, sink):
        captured.update(
            names=names,
            quest=quest,
            data_by_creature=data_by_creature,
            sink=sink,
        )
        return {
            names[0]: CreatureAlert(
                headline="Quest complete",
                details="Used the existing creature",
                impact="Action identified",
                recommendation="Proceed",
            )
        }

    monkeypatch.setattr("backend.main.direct_creatures", fake_direct_creatures)
    response = TestClient(app).post(
        "/api/quests",
        json={"quest": "Find our largest avoidable expense", "target": "pyre"},
    )

    assert response.status_code == 200
    assert response.json()["results"]["pyre"]["status"] == "found"
    assert captured["names"] == ["pyre"]
    assert captured["quest"] == "Find our largest avoidable expense"
    assert "transactions" in captured["data_by_creature"]["pyre"]


def test_quest_rejects_unknown_target() -> None:
    response = TestClient(app).post(
        "/api/quests",
        json={"quest": "Do something", "target": "missing-agent"},
    )
    assert response.status_code == 404


def test_party_coordinator_matches_quest_specialty() -> None:
    names = ["pyre", "fetch", "sight", "lode"]
    assert select_quest_coordinator("Find our biggest runway expense", names) == "pyre"
    assert select_quest_coordinator("Research competitor product news", names) == "sight"
    assert select_quest_coordinator("Prioritize engineering candidates", names) == "lode"
    assert select_quest_coordinator("Draft investor follow-ups", names) == "fetch"


def test_party_quest_routes_peer_reports_to_coordinator(monkeypatch) -> None:
    events: list[dict[str, object]] = []
    synthesis_calls: list[tuple[str, str]] = []

    async def fake_direct_creatures(names, quest, data_by_creature, sink):
        return {
            name: CreatureAlert(
                headline=f"{name} finding",
                details="Specialist evidence",
                impact="Material",
                recommendation="Coordinate",
            )
            for name in names
        }

    async def fake_run(name, input_text, sink, phase):
        synthesis_calls.append((name, phase))
        assert "PEER REPORTS" in input_text
        return CreatureAlert(
            headline="Party synthesis",
            details="Combined specialist evidence",
            impact="Prioritized",
            recommendation="Act together",
        )

    async def sink(event):
        events.append(event)

    monkeypatch.setattr(creature_manager, "direct_creatures", fake_direct_creatures)
    monkeypatch.setattr(creature_manager, "_run", fake_run)
    names = ["pyre", "fetch", "sight", "lode"]
    results = asyncio.run(
        creature_manager.collaborate_on_quest(
            names,
            "Find our biggest runway risk",
            {name: {} for name in names},
            sink,
        )
    )

    assert synthesis_calls == [("pyre", "synthesis")]
    assert results["pyre"].headline == "Party synthesis"
    assert len([event for event in events if event["type"] == "collaboration"]) == 3
