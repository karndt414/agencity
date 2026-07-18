from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv


ENV_FILE = Path(__file__).resolve().parent / ".env"
load_dotenv(ENV_FILE)

AGENTS_MODEL = os.getenv("AGENTS_MODEL", "gpt-5.4")


def has_openai_api_key() -> bool:
    return bool(os.getenv("OPENAI_API_KEY"))
