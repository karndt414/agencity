from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from agents import Agent

from .alert_pipeline import CreatureAlert
from .creatures import (
    COMMON_INSTRUCTIONS,
    MODEL,
    build_agent_tools,
    register_creature,
    normalize_name,
    web_first_model_settings,
)

LOGGER = logging.getLogger(__name__)
SPAWN_REGISTRY_FILE = Path(__file__).resolve().parent / "data" / "spawned_creatures.json"


def _read_registry() -> list[dict[str, Any]]:
    if not SPAWN_REGISTRY_FILE.exists():
        return []
    try:
        payload = json.loads(SPAWN_REGISTRY_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        LOGGER.warning("Could not read spawned creature registry: %s", exc)
        return []
    if not isinstance(payload, list):
        LOGGER.warning("Ignoring malformed spawned creature registry")
        return []
    return [record for record in payload if isinstance(record, dict)]


def _write_registry(records: list[dict[str, Any]]) -> None:
    SPAWN_REGISTRY_FILE.parent.mkdir(parents=True, exist_ok=True)
    temporary_file = SPAWN_REGISTRY_FILE.with_suffix(".tmp")
    temporary_file.write_text(
        json.dumps(records, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    temporary_file.replace(SPAWN_REGISTRY_FILE)


def _persist_definition(key: str, name: str, instructions: str, model: str) -> None:
    records = _read_registry()
    definition = {
        "key": key,
        "name": name,
        "instructions": instructions,
        "model": model,
    }
    updated = [record for record in records if record.get("key") != key]
    updated.append(definition)
    _write_registry(updated)


def spawn_creature(
    name: str,
    instructions: str,
    model: str | None = None,
    *,
    persist: bool = True,
) -> Agent[object]:
    """Create and register a new creature without restarting the backend."""

    clean_name = name.strip()
    clean_instructions = instructions.strip()
    if not clean_name:
        raise ValueError("Creature name is required")
    if not clean_instructions:
        raise ValueError("Creature instructions are required")

    selected_model = model or MODEL
    creature = Agent(
        name=clean_name,
        instructions=f"{COMMON_INSTRUCTIONS}\n\n{clean_instructions}",
        model=selected_model,
        output_type=CreatureAlert,
        tools=build_agent_tools(),
        model_settings=web_first_model_settings(),
    )
    key = normalize_name(clean_name)
    register_creature(key, creature)
    if persist:
        try:
            _persist_definition(key, clean_name, clean_instructions, selected_model)
        except Exception:
            # Keep a failed disk write from creating a memory-only registration.
            from .creatures import CREATURES

            CREATURES.pop(key, None)
            raise
    return creature


def ensure_spawned_creature(
    name: str,
    instructions: str,
    model: str | None = None,
) -> tuple[Agent[object], bool]:
    """Return an existing creature or recreate and persist a missing room agent."""

    from .creatures import CREATURES

    key = normalize_name(name)
    existing = CREATURES.get(key)
    if existing is not None:
        return existing, False
    return spawn_creature(name, instructions, model), True


def restore_spawned_creatures() -> list[str]:
    """Restore persisted dynamic creatures into the in-memory SDK registry."""

    from .creatures import CREATURES

    restored: list[str] = []
    for record in _read_registry():
        name = record.get("name")
        instructions = record.get("instructions")
        model = record.get("model")
        if not isinstance(name, str) or not isinstance(instructions, str):
            LOGGER.warning("Skipping incomplete spawned creature definition")
            continue
        key = normalize_name(name)
        if key in CREATURES:
            continue
        try:
            spawn_creature(
                name,
                instructions,
                model if isinstance(model, str) else None,
                persist=False,
            )
        except (TypeError, ValueError) as exc:
            LOGGER.warning("Could not restore spawned creature %s: %s", key, exc)
            continue
        restored.append(key)
    return restored
