from __future__ import annotations

import json
from typing import Any

from pydantic import BaseModel, Field


class CreatureAlert(BaseModel):
    """The structured result every creature returns to the city."""

    headline: str
    details: str
    impact: str
    recommendation: str
    sources: list[str] = Field(default_factory=list)


def _decode_json(value: str) -> Any:
    cleaned = value.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()
    return json.loads(cleaned)


def parse_alert(output: Any) -> CreatureAlert:
    """Normalize structured SDK output into the payload sent to the frontend."""

    if isinstance(output, CreatureAlert):
        return output
    if isinstance(output, BaseModel):
        return CreatureAlert.model_validate(output.model_dump())
    if isinstance(output, dict):
        return CreatureAlert.model_validate(output)
    if isinstance(output, str):
        return CreatureAlert.model_validate(_decode_json(output))
    raise TypeError(f"Unsupported creature output type: {type(output).__name__}")
