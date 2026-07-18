from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import agents
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .alert_pipeline import CreatureAlert
from .config import has_openai_api_key
from .creature_manager import (
    DATA_FILES,
    direct_creatures,
    load_data,
    refine_hunt,
    release_all,
    hunt_creature as run_hunt,
)
from .creatures import CREATURES, get_creature, normalize_name
from .spawn import spawn_creature


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
    data: dict[str, Any] | None = None


manager = ConnectionManager()
app = FastAPI(title="Agencity Backend", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "agencity-backend",
        "agents_sdk": True,
        "agents_sdk_version": getattr(agents, "__version__", "unknown"),
        "api_key_configured": has_openai_api_key(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/creatures")
async def list_creatures() -> dict[str, list[str]]:
    return {"creatures": sorted(CREATURES)}


@app.post("/api/creatures/release-all")
async def release_all_endpoint(request: ReleaseAllRequest | None = None) -> dict[str, Any]:
    supplied = request.data if request and request.data else {}
    data = {
        name: supplied.get(name, load_data(name))
        for name in CREATURES
        if name in DATA_FILES
    }
    results = await release_all(data, manager.broadcast)
    return {
        "results": {
            name: (
                {"status": "found", "alert": value.model_dump()}
                if isinstance(value, CreatureAlert)
                else {"status": "error", "error": str(value)}
            )
            for name, value in results.items()
        }
    }


@app.post("/api/creatures/{name}/hunt")
async def hunt_endpoint(name: str, request: HuntRequest | None = None) -> dict[str, Any]:
    key = normalize_name(name)
    get_creature(key)
    data = request.data if request and request.data is not None else load_data(key)
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
    creature = spawn_creature(request.name, request.instructions, request.model)
    key = normalize_name(request.name)
    await manager.broadcast(
        {"type": "spawned", "creature": key, "name": creature.name}
    )
    return {"creature": key, "name": creature.name}


@app.post("/api/quests")
async def quest_endpoint(request: QuestRequest) -> dict[str, Any]:
    quest = request.quest.strip()
    if not quest:
        raise HTTPException(status_code=422, detail="Quest is required")

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
    results = await direct_creatures(names, quest, data_by_creature, manager.broadcast)
    return {
        "quest": quest,
        "target": target,
        "results": {
            name: (
                {"status": "found", "alert": value.model_dump()}
                if isinstance(value, CreatureAlert)
                else {"status": "error", "error": str(value)}
            )
            for name, value in results.items()
        },
    }


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
