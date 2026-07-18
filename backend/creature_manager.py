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

# Standard API token prices per one million tokens. The default Agencity model
# is GPT-5.4; keeping the rates beside the usage calculation makes the HUD an
# auditable estimate instead of a fictional credit balance.
MODEL_PRICING: dict[str, tuple[float, float, float]] = {
    "gpt-5.4": (2.50, 0.25, 15.00),
    "gpt-5.4-mini": (0.75, 0.075, 4.50),
    "gpt-5.4-nano": (0.20, 0.02, 1.25),
}


def _usage_message(creature: str, model: str, usage: Any) -> dict[str, Any]:
    input_tokens = int(getattr(usage, "input_tokens", 0) or 0)
    output_tokens = int(getattr(usage, "output_tokens", 0) or 0)
    input_details = getattr(usage, "input_tokens_details", None)
    cached_tokens = int(getattr(input_details, "cached_tokens", 0) or 0)
    uncached_tokens = max(0, input_tokens - cached_tokens)
    input_rate, cached_rate, output_rate = MODEL_PRICING.get(model, (0.0, 0.0, 0.0))
    estimated_cost = (
        uncached_tokens * input_rate
        + cached_tokens * cached_rate
        + output_tokens * output_rate
    ) / 1_000_000
    return {
        "type": "usage",
        "creature": creature,
        "model": model,
        "input_tokens": input_tokens,
        "cached_input_tokens": cached_tokens,
        "output_tokens": output_tokens,
        "total_tokens": input_tokens + output_tokens,
        "estimated_cost_usd": round(estimated_cost, 8),
        "pricing_available": model in MODEL_PRICING,
    }


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

            model = agent.model if isinstance(agent.model, str) else str(agent.model)
            await _emit(sink, _usage_message(key, model, result.context_wrapper.usage))
            alert = parse_alert(result.final_output)
        except Exception as exc:
            await _emit(sink, {"type": "error", "creature": key, "error": str(exc)})
            raise

    payload = alert.model_dump()
    await _emit(
        sink,
        {"type": "alert", "creature": key, "phase": phase, "alert": payload},
    )
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


async def direct_creature(
    name: str,
    quest: str,
    data: dict[str, Any],
    sink: EventSink | None = None,
) -> CreatureAlert:
    """Give an existing creature a founder-authored quest with its available data."""

    clean_quest = quest.strip()
    if not clean_quest:
        raise ValueError("Quest is required")

    input_text = (
        "NEW QUEST FROM THE FOUNDER\n"
        f"{clean_quest}\n\n"
        "Complete this quest using your specialty and the available data below. "
        "Return the most actionable structured alert you can support.\n\n"
        f"AVAILABLE DATA\n{json.dumps(data, ensure_ascii=False, indent=2)}"
    )
    return await _run(name, input_text, sink, phase="quest")


async def direct_creatures(
    names: list[str],
    quest: str,
    data_by_creature: dict[str, dict[str, Any]],
    sink: EventSink | None = None,
) -> dict[str, CreatureAlert | Exception]:
    """Dispatch one quest to one or more existing creatures in parallel."""

    results = await asyncio.gather(
        *(
            direct_creature(name, quest, data_by_creature.get(name, {}), sink)
            for name in names
        ),
        return_exceptions=True,
    )
    return dict(zip(names, results))


def select_quest_coordinator(quest: str, names: list[str]) -> str:
    """Pick the existing specialist best suited to synthesize a party quest."""

    normalized = quest.lower()
    specialties = (
        ("pyre", ("burn", "cost", "expense", "finance", "runway", "spend")),
        ("sight", ("competitor", "market", "news", "research", "trend", "web")),
        ("lode", ("candidate", "engineer", "hire", "hiring", "talent", "team")),
        ("fetch", ("customer", "deal", "follow-up", "investor", "outreach", "sales")),
    )
    for creature, keywords in specialties:
        if creature in names and any(keyword in normalized for keyword in keywords):
            return creature
    return "fetch" if "fetch" in names else names[0]


async def collaborate_on_quest(
    names: list[str],
    quest: str,
    data_by_creature: dict[str, dict[str, Any]],
    sink: EventSink | None = None,
) -> dict[str, CreatureAlert | Exception]:
    """Run a party council: specialist research followed by peer synthesis."""

    first_pass = await direct_creatures(names, quest, data_by_creature, sink)
    reports = {
        name: result
        for name, result in first_pass.items()
        if isinstance(result, CreatureAlert)
    }
    if len(reports) < 2:
        return first_pass

    coordinator = select_quest_coordinator(quest, list(reports))
    await _emit(
        sink,
        {
            "type": "collaboration_start",
            "quest": quest,
            "coordinator": coordinator,
            "participants": list(reports),
        },
    )
    for name, report in reports.items():
        if name == coordinator:
            continue
        await _emit(
            sink,
            {
                "type": "collaboration",
                "from": name,
                "to": coordinator,
                "headline": report.headline,
            },
        )

    peer_reports = {
        name: report.model_dump()
        for name, report in reports.items()
    }
    synthesis_input = (
        "PARTY COUNCIL SYNTHESIS\n"
        f"Founder quest: {quest.strip()}\n\n"
        "Your fellow creatures completed independent specialist investigations. "
        "Compare their evidence, resolve conflicts, connect findings across specialties, "
        "and return one prioritized party recommendation. Preserve supporting URLs in "
        "the `sources` field. You may use your tools or a handoff if a material gap remains.\n\n"
        f"PEER REPORTS\n{json.dumps(peer_reports, ensure_ascii=False, indent=2)}"
    )
    try:
        synthesis = await _run(
            coordinator,
            synthesis_input,
            sink,
            phase="synthesis",
        )
    except Exception as exc:
        await _emit(
            sink,
            {
                "type": "collaboration_error",
                "coordinator": coordinator,
                "error": str(exc),
            },
        )
        await _emit(
            sink,
            {
                "type": "collaboration_end",
                "coordinator": coordinator,
                "participants": list(reports),
                "status": "error",
            },
        )
        return first_pass

    first_pass[coordinator] = synthesis
    await _emit(
        sink,
        {
            "type": "collaboration_end",
            "coordinator": coordinator,
            "participants": list(reports),
            "status": "found",
        },
    )
    return first_pass


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
