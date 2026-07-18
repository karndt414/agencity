from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import agents
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .alert_pipeline import CreatureAlert
from .artifacts import (
    artifact_directory_for_task,
    artifact_entrypoint_for_task,
    list_artifact_files,
    prepare_artifact_directory,
)
from .config import ORCHESTRATOR_MODEL, WORKER_MODEL, has_openai_api_key
from .creature_manager import (
    DATA_FILES,
    collaborate_on_quest,
    coordinate_room_quest,
    direct_creatures,
    load_data,
    orchestrate_quest,
    refine_hunt,
    release_all,
    hunt_creature as run_hunt,
)
from .creatures import CREATURES, get_creature, normalize_name
from .reporting import render_task_report
from .spawn import ensure_spawned_creature, restore_spawned_creatures, spawn_creature
from .terminal_tools import TOOL_CATALOG, execute_python_check, execute_terminal_command
from .workspace_tools import write_workspace_file_impl

restore_spawned_creatures()


class ConnectionManager:
    def __init__(self) -> None:
        self.connections: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.connections.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self.connections.discard(websocket)

    async def broadcast(self, message: dict[str, Any]) -> None:
        for websocket in tuple(self.connections):
            try:
                await websocket.send_json(message)
            except Exception:
                self.disconnect(websocket)


class HuntRequest(BaseModel):
    data: dict[str, Any] | None = None


class ReleaseAllRequest(BaseModel):
    data: dict[str, dict[str, Any]] | None = None


class RefineRequest(BaseModel):
    follow_up: str


class SpawnRequest(BaseModel):
    name: str
    instructions: str
    model: str | None = None


class QuestRequest(BaseModel):
    quest: str
    target: str = "all"
    supporters: list[str] = Field(default_factory=list)
    data: dict[str, Any] | None = None


class TaskRequest(BaseModel):
    task: str
    target: str = "all"
    data: dict[str, Any] | None = None
    report_path: str | None = None


class TerminalRequest(BaseModel):
    command: str
    cwd: str = "."


class PythonCheckRequest(BaseModel):
    target: str = "backend"


manager = ConnectionManager()
app = FastAPI(title="Agencity Backend", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _artifact_payload(task: str) -> dict[str, Any]:
    directory = artifact_directory_for_task(task)
    return {
        "artifact_directory": directory,
        "artifact_entrypoint": artifact_entrypoint_for_task(task),
        "artifact_files": list_artifact_files(directory),
    }


async def _publish_artifact_location(task: str) -> None:
    payload = _artifact_payload(task)
    if payload["artifact_directory"]:
        await manager.broadcast({"type": "artifacts", **payload})


@app.get("/api/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "agencity-backend",
        "agents_sdk": True,
        "agents_sdk_version": getattr(agents, "__version__", "unknown"),
        "api_key_configured": has_openai_api_key(),
        "orchestrator_model": ORCHESTRATOR_MODEL,
        "worker_model": WORKER_MODEL,
        "evidence_policy": "web-first",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/creatures")
async def list_creatures() -> dict[str, list[str]]:
    return {"creatures": sorted(CREATURES)}


@app.get("/api/tools")
async def list_tools() -> dict[str, list[dict[str, str]]]:
    return {"tools": TOOL_CATALOG}


@app.post("/api/tools/terminal")
async def terminal_endpoint(request: TerminalRequest) -> dict[str, Any]:
    try:
        return await execute_terminal_command(request.command, request.cwd)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/tools/python")
async def python_check_endpoint(request: PythonCheckRequest) -> dict[str, Any]:
    try:
        return await execute_python_check(request.target)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _result_payload(results: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        name: (
            {"status": "found", "alert": value.model_dump()}
            if isinstance(value, CreatureAlert)
            else {"status": "error", "error": str(value)}
        )
        for name, value in results.items()
    }


@app.post("/api/tasks")
async def task_endpoint(request: TaskRequest) -> dict[str, Any]:
    task = request.task.strip()
    if not task:
        raise HTTPException(status_code=422, detail="Task is required")
    artifact_directory = prepare_artifact_directory(artifact_directory_for_task(task))

    target = normalize_name(request.target)
    if target == "all":
        names = list(CREATURES)
    else:
        try:
            get_creature(target)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        names = [target]

    data_by_creature = {
        name: (
            request.data
            if request.data is not None
            else load_data(name) if name in DATA_FILES else {}
        )
        for name in names
    }
    results, report = await orchestrate_quest(
        names,
        task,
        data_by_creature,
        manager.broadcast,
    )
    response: dict[str, Any] = {
        "task": task,
        "target": target,
        "results": _result_payload(results),
        "report": report.model_dump() if report else None,
        **_artifact_payload(task),
    }
    report_path = request.report_path
    if report_path is None and report is not None and artifact_directory:
        report_path = f"{artifact_directory}/REPORT.md"
    if report_path and report is not None:
        if Path(report_path).suffix.lower() != ".md":
            raise HTTPException(status_code=400, detail="report_path must end in .md")
        try:
            response["artifact"] = write_workspace_file_impl(
                report_path,
                render_task_report(report),
                overwrite=True,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    response.update(_artifact_payload(task))
    await _publish_artifact_location(task)
    return response


@app.post("/api/creatures/release-all")
async def release_all_endpoint(request: ReleaseAllRequest | None = None) -> dict[str, Any]:
    supplied = request.data if request and request.data else {}
    data = {
        name: supplied.get(name, {})
        for name in CREATURES
    }
    results = await release_all(data, manager.broadcast)
    return {
        "results": _result_payload(results),
    }


@app.post("/api/creatures/{name}/hunt")
async def hunt_endpoint(name: str, request: HuntRequest | None = None) -> dict[str, Any]:
    key = normalize_name(name)
    get_creature(key)
    data = request.data if request and request.data is not None else {}
    alert = await run_hunt(key, data, manager.broadcast)
    return {"creature": key, "status": "found", "alert": alert.model_dump()}


@app.post("/api/creatures/{name}/refine")
async def refine_endpoint(name: str, request: RefineRequest) -> dict[str, Any]:
    key = normalize_name(name)
    get_creature(key)
    alert = await refine_hunt(key, request.follow_up, manager.broadcast)
    return {"creature": key, "status": "found", "alert": alert.model_dump()}


@app.post("/api/creatures/spawn")
async def spawn_endpoint(request: SpawnRequest) -> dict[str, str]:
    try:
        creature = spawn_creature(request.name, request.instructions, request.model)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    key = normalize_name(request.name)
    await manager.broadcast(
        {"type": "spawned", "creature": key, "name": creature.name}
    )
    return {"creature": key, "name": creature.name}


@app.post("/api/creatures/ensure")
async def ensure_creature_endpoint(request: SpawnRequest) -> dict[str, str]:
    creature, created = ensure_spawned_creature(
        request.name,
        request.instructions,
        request.model,
    )
    key = normalize_name(request.name)
    if created:
        await manager.broadcast(
            {"type": "spawned", "creature": key, "name": creature.name}
        )
    return {
        "creature": key,
        "name": creature.name,
        "status": "restored" if created else "existing",
    }


@app.post("/api/quests")
async def quest_endpoint(request: QuestRequest) -> dict[str, Any]:
    quest = request.quest.strip()
    if not quest:
        raise HTTPException(status_code=422, detail="Quest is required")
    prepare_artifact_directory(artifact_directory_for_task(quest))

    target = normalize_name(request.target)
    if target == "all":
        names = list(CREATURES)
    else:
        try:
            get_creature(target)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        names = [target]

    supporters = list(dict.fromkeys(
        normalize_name(name)
        for name in request.supporters
        if normalize_name(name) != target
    ))
    for supporter in supporters:
        try:
            get_creature(supporter)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    data_by_creature = {
        name: (
            request.data
            if request.data is not None
            else {}
        )
        for name in names
    }
    for supporter in supporters:
        data_by_creature[supporter] = request.data if request.data is not None else {}
    results = (
        await collaborate_on_quest(names, quest, data_by_creature, manager.broadcast)
        if target == "all"
        else (
            await coordinate_room_quest(
                target,
                supporters,
                quest,
                data_by_creature,
                manager.broadcast,
            )
            if supporters
            else await direct_creatures(names, quest, data_by_creature, manager.broadcast)
        )
    )
    response = {
        "quest": quest,
        "target": target,
        "results": _result_payload(results),
        **_artifact_payload(quest),
    }
    await _publish_artifact_location(quest)
    return response


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await manager.connect(websocket)
    await websocket.send_json(
        {
            "type": "connected",
            "service": "agencity-backend",
            "agents_sdk": True,
            "creatures": sorted(CREATURES),
        }
    )
    try:
        while True:
            message = await websocket.receive_json()
            if message.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        manager.disconnect(websocket)
