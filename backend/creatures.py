from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from agents import Agent, SQLiteSession, handoff

from .alert_pipeline import CreatureAlert

ROOT = Path(__file__).resolve().parent.parent
PROMPTS_DIR = ROOT / "prompts"
DATA_DIR = Path(__file__).resolve().parent / "data"
SESSION_DB = DATA_DIR / "sessions.db"
MODEL = os.getenv("AGENTS_MODEL", "gpt-5.4")

_COMMON_INSTRUCTIONS = """
You are one creature in Agencity, a living city of autonomous founder-data agents.
Use only the data in the current input and the context provided by another creature.
Never invent records, amounts, dates, people, or sources.
Return a concise structured alert. If another creature is the right specialist for
an actionable follow-up, use the available handoff once and explain why.
"""


def _instructions(name: str) -> str:
    prompt = (PROMPTS_DIR / f"{name}.md").read_text(encoding="utf-8")
    return f"{_COMMON_INSTRUCTIONS}\n\n{prompt}"


def _agent(name: str) -> Agent[Any]:
    return Agent(
        name=name.capitalize(),
        instructions=_instructions(name),
        model=MODEL,
        output_type=CreatureAlert,
    )


pyre = _agent("pyre")
fetch = _agent("fetch")
sight = _agent("sight")
lode = _agent("lode")

# Handoffs are wired after all four agents exist so the graph stays explicit.
pyre.handoffs = [
    handoff(
        fetch,
        tool_name_override="handoff_to_fetch",
        tool_description_override="Send subscription cancellation and negotiation work to Fetch.",
    )
]
fetch.handoffs = [
    handoff(
        lode,
        tool_name_override="handoff_to_lode",
        tool_description_override="Send hiring-related follow-up and warm-intro work to Lode.",
    )
]
sight.handoffs = [
    handoff(
        pyre,
        tool_name_override="handoff_to_pyre",
        tool_description_override="Send competitor spending or runway threats to Pyre.",
    )
]
lode.handoffs = [
    handoff(
        fetch,
        tool_name_override="handoff_to_fetch",
        tool_description_override="Send candidate outreach and scheduling work to Fetch.",
    )
]

CREATURES: dict[str, Agent[Any]] = {
    "pyre": pyre,
    "fetch": fetch,
    "sight": sight,
    "lode": lode,
}
_SESSIONS: dict[str, SQLiteSession] = {}


def normalize_name(name: str) -> str:
    return "-".join(name.strip().lower().split())


def get_creature(name: str) -> Agent[Any]:
    key = normalize_name(name)
    try:
        return CREATURES[key]
    except KeyError as exc:
        raise KeyError(f"Unknown creature: {name}") from exc


def get_session(name: str) -> SQLiteSession:
    key = normalize_name(name)
    if key not in _SESSIONS:
        _SESSIONS[key] = SQLiteSession(f"agencity-{key}", db_path=SESSION_DB)
    return _SESSIONS[key]


def register_creature(key: str, creature: Agent[Any]) -> None:
    normalized = normalize_name(key)
    if normalized in CREATURES:
        raise ValueError(f"Creature already exists: {normalized}")
    CREATURES[normalized] = creature
