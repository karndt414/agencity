from __future__ import annotations

from agents import Agent

from .alert_pipeline import CreatureAlert
from .creatures import MODEL, register_creature, normalize_name


def spawn_creature(name: str, instructions: str, model: str | None = None) -> Agent[object]:
    """Create and register a new creature without restarting the backend."""

    clean_name = name.strip()
    clean_instructions = instructions.strip()
    if not clean_name:
        raise ValueError("Creature name is required")
    if not clean_instructions:
        raise ValueError("Creature instructions are required")

    creature = Agent(
        name=clean_name,
        instructions=clean_instructions,
        model=model or MODEL,
        output_type=CreatureAlert,
    )
    register_creature(normalize_name(clean_name), creature)
    return creature
