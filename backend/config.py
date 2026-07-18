from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv


ENV_FILE = Path(__file__).resolve().parent / ".env"
load_dotenv(ENV_FILE)

AGENTS_MODEL = os.getenv("AGENTS_MODEL", "gpt-5.4-mini")
ORCHESTRATOR_MODEL = os.getenv("ORCHESTRATOR_MODEL", "gpt-5.4-mini")
WORKER_MODEL = os.getenv("WORKER_MODEL", "gpt-5.4-nano")


def has_openai_api_key() -> bool:
    return bool(os.getenv("OPENAI_API_KEY", "").strip())
