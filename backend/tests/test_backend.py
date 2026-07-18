from __future__ import annotations

import asyncio
import json
import stat
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from agents import WebSearchTool

import backend.creature_manager as creature_manager
import backend.spawn as spawn_module
from backend.alert_pipeline import CreatureAlert, parse_alert
from backend.config import ORCHESTRATOR_MODEL, WORKER_MODEL
from backend.creatures import CREATURES, ORCHESTRATOR
from backend.creature_manager import _internal_context, _usage_message, select_quest_coordinator
from backend.main import app
from backend.reporting import ReportFinding, TaskReport, enforce_citations
from backend.terminal_tools import execute_terminal_command
from backend.workspace_tools import read_workspace_file_impl, write_workspace_file_impl


def test_health_and_agent_registry() -> None:
    client = TestClient(app)
    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"
    assert health.json()["agents_sdk"] is True
    assert health.json()["worker_model"] == WORKER_MODEL
    assert health.json()["orchestrator_model"] == ORCHESTRATOR_MODEL
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


def test_tool_catalog_and_safe_terminal_endpoint() -> None:
    client = TestClient(app)
    catalog = client.get("/api/tools")
    assert catalog.status_code == 200
    assert {tool["name"] for tool in catalog.json()["tools"]} >= {
        "web_search",
        "run_terminal_command",
        "run_python_check",
        "read_workspace_file",
        "write_workspace_file",
    }

    response = client.post(
        "/api/tools/terminal",
        json={"command": "python -m compileall -q backend", "cwd": "."},
    )
    assert response.status_code == 200
    assert response.json()["ok"] is True

    python_response = client.post(
        "/api/tools/python",
        json={"target": "compileall"},
    )
    assert python_response.status_code == 200
    assert python_response.json()["ok"] is True


def test_terminal_policy_blocks_shell_operators_and_secret_paths() -> None:
    with pytest.raises(ValueError, match="shell operators"):
        asyncio.run(execute_terminal_command("pwd && ls"))
    with pytest.raises(ValueError, match="protected"):
        asyncio.run(execute_terminal_command("ls backend/.env"))
    with pytest.raises(ValueError, match="application execution"):
        asyncio.run(execute_terminal_command("python -c print('nope')"))
    with pytest.raises(ValueError, match="not allowlisted"):
        asyncio.run(execute_terminal_command("npm run build", "frontend"))


def test_worker_and_orchestrator_models_are_separate() -> None:
    assert CREATURES["pyre"].model == WORKER_MODEL
    assert ORCHESTRATOR.model == ORCHESTRATOR_MODEL


def test_workspace_writer_creates_non_executable_text_file() -> None:
    path = "backend/data/.codex-tool-test.md"
    try:
        created = write_workspace_file_impl(path, "# generated\n")
        assert created["created"] is True
        assert created["executable"] is False
        mode = stat.S_IMODE(Path(path).stat().st_mode)
        assert mode & (stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH) == 0
        assert read_workspace_file_impl(path)["content"] == "# generated\n"
        with pytest.raises(ValueError, match="protected"):
            write_workspace_file_impl("backend/.env", "OPENAI_API_KEY=bad")
    finally:
        Path(path).unlink(missing_ok=True)


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


def test_task_endpoint_returns_and_writes_compiled_report(monkeypatch) -> None:
    report = TaskReport(
        task="Draft an implementation plan",
        summary="A safe plan was compiled.",
        recommendations=["Write the artifact, then review it."],
    )

    async def fake_orchestrate(names, task, data_by_creature, sink):
        return {
            names[0]: CreatureAlert(
                headline="Worker finding",
                details="Evidence",
                impact="Useful",
                recommendation="Review",
            )
        }, report

    monkeypatch.setattr("backend.main.orchestrate_quest", fake_orchestrate)
    path = "backend/data/.codex-task-report.md"
    try:
        response = TestClient(app).post(
            "/api/tasks",
            json={"task": report.task, "target": "pyre", "report_path": path},
        )
        assert response.status_code == 200
        assert response.json()["report"]["summary"] == report.summary
        assert "# Task report" in read_workspace_file_impl(path)["content"]
    finally:
        Path(path).unlink(missing_ok=True)


def test_report_citation_gate_omits_uncited_findings() -> None:
    report = TaskReport(
        task="Research a topic",
        summary="Evidence was compiled.",
        findings=[
            ReportFinding(
                worker="sight",
                headline="Sourced finding",
                details="Public evidence.",
                impact="Useful",
                recommendation="Review it.",
                sources=["https://example.com/source", "https://example.com/source"],
            ),
            ReportFinding(
                worker="pyre",
                headline="Unsupported finding",
                details="No traceable source.",
                impact="Unknown",
                recommendation="Do not act.",
            ),
        ],
    )

    gated = enforce_citations(report)

    assert [finding.headline for finding in gated.findings] == ["Sourced finding"]
    assert gated.sources == ["https://example.com/source"]
    assert any("Omitted uncited findings" in risk for risk in gated.risks)
def test_room_pm_delegates_to_supporters_and_owns_final_answer(monkeypatch) -> None:
    events: list[dict[str, object]] = []
    support_calls: list[tuple[str, str]] = []
    synthesis_calls: list[tuple[str, str]] = []

    async def fake_support(name, coordinator, quest, data, sink):
        support_calls.append((name, coordinator))
        return CreatureAlert(
            headline=f"{name} support report",
            details="Specialist evidence for the PM",
            impact="Informs the final decision",
            recommendation="Report to the PM",
        )

    async def fake_run(name, input_text, sink, phase, **kwargs):
        synthesis_calls.append((name, phase))
        assert "ROOM PM FINAL SYNTHESIS" in input_text
        assert "SUPPORTING REPORTS" in input_text
        return CreatureAlert(
            headline="PM final answer",
            details="The PM evaluated the supporting reports.",
            impact="One accountable room decision",
            recommendation="Execute the PM's plan",
        )

    async def sink(event):
        events.append(event)

    monkeypatch.setattr(creature_manager, "support_room_quest", fake_support)
    monkeypatch.setattr(creature_manager, "_run", fake_run)
    results = asyncio.run(
        creature_manager.coordinate_room_quest(
            "room-pm",
            ["research-helper", "finance-helper"],
            "Assess a new market",
            {
                "room-pm": {},
                "research-helper": {},
                "finance-helper": {},
            },
            sink,
        )
    )

    assert support_calls == [
        ("research-helper", "room-pm"),
        ("finance-helper", "room-pm"),
    ]
    assert synthesis_calls == [("room-pm", "synthesis")]
    assert results["room-pm"].headline == "PM final answer"
    assert events[0] == {
        "type": "collaboration_start",
        "workflow": "room_hierarchy",
        "quest": "Assess a new market",
        "coordinator": "room-pm",
        "participants": ["room-pm", "research-helper", "finance-helper"],
    }
    assert len([event for event in events if event["type"] == "collaboration"]) == 4
    assert events[-1]["type"] == "collaboration_end"


def test_supporting_run_is_not_published_as_room_answer(monkeypatch) -> None:
    captured: dict[str, object] = {}

    async def fake_run(name, input_text, sink, phase, *, publish_alert=True):
        captured.update(
            name=name,
            input_text=input_text,
            phase=phase,
            publish_alert=publish_alert,
        )
        return CreatureAlert(
            headline="Internal support report",
            details="Evidence for the PM only",
            impact="Supports synthesis",
            recommendation="Return to PM",
        )

    monkeypatch.setattr(creature_manager, "_run", fake_run)
    asyncio.run(
        creature_manager.support_room_quest(
            "research-helper",
            "room-pm",
            "Assess a new market",
            {},
        )
    )

    assert captured["phase"] == "support"
    assert captured["publish_alert"] is False
    assert "supporting specialist, not the room decision-maker" in captured["input_text"]


def test_room_quest_api_passes_supporters_to_fixed_pm(monkeypatch) -> None:
    captured: dict[str, object] = {}

    async def fake_coordinate(coordinator, supporters, quest, data_by_creature, sink):
        captured.update(
            coordinator=coordinator,
            supporters=supporters,
            quest=quest,
        )
        return {
            coordinator: CreatureAlert(
                headline="PM final answer",
                details="Synthesized support",
                impact="Accountable",
                recommendation="Proceed",
            )
        }

    monkeypatch.setattr("backend.main.coordinate_room_quest", fake_coordinate)
    response = TestClient(app).post(
        "/api/quests",
        json={
            "quest": "Assess a new market",
            "target": "pyre",
            "supporters": ["sight", "fetch", "sight"],
        },
    )

    assert response.status_code == 200
    assert captured == {
        "coordinator": "pyre",
        "supporters": ["sight", "fetch"],
        "quest": "Assess a new market",
    }
    assert response.json()["results"]["pyre"]["alert"]["headline"] == "PM final answer"


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
