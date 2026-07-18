from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

from fastapi.testclient import TestClient
from agents import WebSearchTool

import backend.creature_manager as creature_manager
import backend.spawn as spawn_module
from backend.alert_pipeline import CreatureAlert, parse_alert
from backend.creatures import CREATURES
from backend.creature_manager import _internal_context, _usage_message, select_quest_coordinator
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
    assert all(
        CREATURES[name].model_settings.tool_choice == "web_search"
        for name in ("pyre", "fetch", "sight", "lode")
    )
    assert all(
        next(tool for tool in CREATURES[name].tools if isinstance(tool, WebSearchTool)).search_context_size
        == "high"
        for name in ("pyre", "fetch", "sight", "lode")
    )
    assert health.json()["evidence_policy"] == "web-first"


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
    assert captured["data_by_creature"]["pyre"] == {}


def test_spawned_creature_persists_and_restores(monkeypatch, tmp_path) -> None:
    registry_file = tmp_path / "spawned_creatures.json"
    monkeypatch.setattr(spawn_module, "SPAWN_REGISTRY_FILE", registry_file)
    key = "persistent-researcher"
    CREATURES.pop(key, None)

    try:
        spawn_module.spawn_creature(
            "Persistent Researcher",
            "Research current public information and cite the sources.",
        )

        definitions = json.loads(registry_file.read_text(encoding="utf-8"))
        assert definitions[0]["key"] == key
        assert key in CREATURES

        # Simulate the in-memory registry being cleared by a backend restart.
        CREATURES.pop(key)
        assert spawn_module.restore_spawned_creatures() == [key]
        assert key in CREATURES
        assert CREATURES[key].model_settings.tool_choice == "web_search"
    finally:
        CREATURES.pop(key, None)


def test_ensure_repairs_stale_room_agent_before_quest(monkeypatch, tmp_path) -> None:
    registry_file = tmp_path / "spawned_creatures.json"
    monkeypatch.setattr(spawn_module, "SPAWN_REGISTRY_FILE", registry_file)
    key = "restored-room-agent"
    CREATURES.pop(key, None)
    captured: dict[str, object] = {}

    async def fake_direct_creatures(names, quest, data_by_creature, sink):
        captured["names"] = names
        return {
            names[0]: CreatureAlert(
                headline="Quest complete",
                details="The restored room agent completed its assignment.",
                impact="Room is operational",
                recommendation="Continue",
            )
        }

    monkeypatch.setattr("backend.main.direct_creatures", fake_direct_creatures)
    client = TestClient(app)

    try:
        ensured = client.post(
            "/api/creatures/ensure",
            json={
                "name": "Restored Room Agent",
                "instructions": "Research the assigned topic on the public web.",
            },
        )
        quest = client.post(
            "/api/quests",
            json={"quest": "Investigate the market", "target": key},
        )

        assert ensured.status_code == 200
        assert ensured.json()["status"] == "restored"
        assert quest.status_code == 200
        assert captured["names"] == [key]
        assert registry_file.exists()
    finally:
        CREATURES.pop(key, None)


def test_quest_preserves_explicit_internal_context_without_loading_fixtures(monkeypatch) -> None:
    captured: dict[str, object] = {}

    async def fake_direct_creatures(names, quest, data_by_creature, sink):
        captured["data"] = data_by_creature[names[0]]
        return {
            names[0]: CreatureAlert(
                headline="Context received",
                details="Explicit context remained supplemental",
                impact="Scoped",
                recommendation="Verify publicly",
            )
        }

    monkeypatch.setattr("backend.main.direct_creatures", fake_direct_creatures)
    supplied = {"source": "founder export", "records": [{"vendor": "Example"}]}
    response = TestClient(app).post(
        "/api/quests",
        json={"quest": "Benchmark this expense", "target": "pyre", "data": supplied},
    )

    assert response.status_code == 200
    assert captured["data"] == supplied


def test_internal_context_is_explicitly_unverified() -> None:
    empty = _internal_context({})
    supplied = _internal_context({"private_metric": 42})

    assert "None supplied" in empty
    assert "Do not infer private company facts" in empty
    assert "UNVERIFIED" in supplied
    assert "supplemental private context" in supplied


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
    assert [event for event in events if event["type"] == "collaboration_end"] == [
        {
            "type": "collaboration_end",
            "coordinator": "pyre",
            "participants": names,
            "status": "found",
        }
    ]


def test_usage_message_prices_cached_and_uncached_tokens() -> None:
    message = _usage_message(
        "pyre",
        "gpt-5.4",
        SimpleNamespace(
            input_tokens=1_000,
            output_tokens=200,
            input_tokens_details=SimpleNamespace(cached_tokens=400),
        ),
    )

    assert message["total_tokens"] == 1_200
    assert message["cached_input_tokens"] == 400
    assert message["estimated_cost_usd"] == 0.0046
    assert message["pricing_available"] is True
