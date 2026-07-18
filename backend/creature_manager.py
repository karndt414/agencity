from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any, Awaitable, Callable

from agents import Runner

from .alert_pipeline import CreatureAlert, parse_alert
from .creatures import CREATURES, get_creature, get_session, normalize_name

DATA_DIR = Path(__file__).resolve().parent / "data"
DATA_FILES = {
    "pyre": "bank.json",
    "fetch": "inbox.json",
    "sight": "competitors.json",
    "lode": "candidates.json",
}
EventSink = Callable[[dict[str, Any]], Awaitable[None]]
_locks: dict[str, asyncio.Lock] = {}


def load_data(name: str) -> dict[str, Any]:
    key = normalize_name(name)
    filename = DATA_FILES.get(key)
    if filename is None:
        raise KeyError(f"No seeded data source for creature: {name}")
    return json.loads((DATA_DIR / filename).read_text(encoding="utf-8"))


def _lock_for(name: str) -> asyncio.Lock:
    key = normalize_name(name)
    if key not in _locks:
        _locks[key] = asyncio.Lock()
    return _locks[key]


async def _emit(sink: EventSink | None, message: dict[str, Any]) -> None:
    if sink is not None:
        await sink(message)


def _raw_value(item: Any, field: str) -> Any:
    raw_item = getattr(item, "raw_item", None)
    if raw_item is None:
        return None
    if isinstance(raw_item, dict):
        return raw_item.get(field)
    return getattr(raw_item, field, None)


def _handoff_target(item: Any) -> str | None:
    target_agent = getattr(item, "target_agent", None)
    if target_agent is not None:
        return normalize_name(getattr(target_agent, "name", ""))
    name = _raw_value(item, "name")
    if not isinstance(name, str):
        return None
    for prefix in ("handoff_to_", "transfer_to_"):
        if name.startswith(prefix):
            return name.removeprefix(prefix)
    return name


def event_to_message(creature: str, event: Any) -> dict[str, Any] | None:
    """Convert SDK stream events into small, frontend-safe city events."""

    if event.type == "raw_response_event":
        delta = getattr(event.data, "delta", None)
        if delta:
            return {"type": "thought", "creature": creature, "token": delta}
        return None

    if event.type == "agent_updated_stream_event":
        return {
            "type": "agent_update",
            "creature": creature,
            "agent": getattr(event.new_agent, "name", creature),
        }

    if event.type != "run_item_stream_event":
        return None

    if event.name in {"handoff_requested", "handoff_occured"}:
        return {
            "type": "handoff",
            "creature": creature,
            "from": creature,
            "to": _handoff_target(event.item),
            "event": event.name,
        }

    if event.name == "tool_called":
        return {
            "type": "tool_call",
            "creature": creature,
            "tool": getattr(event.item, "tool_name", None) or _raw_value(event.item, "name"),
        }

    return None


async def _run(
    name: str,
    input_text: str,
    sink: EventSink | None,
    phase: str,
) -> CreatureAlert:
    key = normalize_name(name)
    agent = get_creature(key)
    session = get_session(key)
    await _emit(sink, {"type": "state", "creature": key, "state": "hunting", "phase": phase})

    async with _lock_for(key):
        try:
            result = Runner.run_streamed(
                agent,
                input=input_text,
                session=session,
                max_turns=12,
            )
            async for event in result.stream_events():
                message = event_to_message(key, event)
                if message is not None:
                    await _emit(sink, message)

            alert = parse_alert(result.final_output)
        except Exception as exc:
            await _emit(sink, {"type": "error", "creature": key, "error": str(exc)})
            raise

    payload = alert.model_dump()
    await _emit(sink, {"type": "alert", "creature": key, "alert": payload})
    await _emit(sink, {"type": "state", "creature": key, "state": "found", "phase": phase})
    return alert


async def hunt_creature(
    name: str,
    data: dict[str, Any],
    sink: EventSink | None = None,
) -> CreatureAlert:
    return await _run(
        name,
        json.dumps(data, ensure_ascii=False, indent=2),
        sink,
        phase="hunt",
    )


async def refine_hunt(
    name: str,
    follow_up: str,
    sink: EventSink | None = None,
) -> CreatureAlert:
    if not follow_up.strip():
        raise ValueError("Follow-up prompt is required")
    return await _run(name, follow_up.strip(), sink, phase="refine")


async def release_all(
    data_by_creature: dict[str, dict[str, Any]],
    sink: EventSink | None = None,
) -> dict[str, CreatureAlert | Exception]:
    names = list(CREATURES.keys())
    results = await asyncio.gather(
        *(hunt_creature(name, data_by_creature[name], sink) for name in names if name in data_by_creature),
        return_exceptions=True,
    )
    selected_names = [name for name in names if name in data_by_creature]
    return dict(zip(selected_names, results))
