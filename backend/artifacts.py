from __future__ import annotations

import re
from pathlib import Path
from uuid import uuid4

from .alert_pipeline import CreatureAlert, CreatureArtifact

ARTIFACTS_DIR = Path(__file__).resolve().parent / "artifacts"
MAX_ARTIFACT_BYTES = 750_000
ARTIFACT_ID_PATTERN = re.compile(r"[0-9a-f]{12}-[a-z0-9][a-z0-9-]{0,80}\.html")


def _safe_stem(filename: str) -> str:
    stem = Path(filename).stem.lower()
    clean = re.sub(r"[^a-z0-9]+", "-", stem).strip("-")
    return (clean or "prototype")[:64]


def materialize_artifact(alert: CreatureAlert) -> CreatureAlert:
    """Persist a validated HTML artifact and return public link metadata."""

    artifact = alert.artifact
    if artifact is None or not artifact.content:
        return alert.model_copy(update={"artifact": None})
    if artifact.media_type != "text/html":
        raise ValueError("Only self-contained HTML artifacts are supported")

    content = artifact.content.strip()
    encoded = content.encode("utf-8")
    if not encoded:
        return alert.model_copy(update={"artifact": None})
    if len(encoded) > MAX_ARTIFACT_BYTES:
        raise ValueError("Generated HTML artifact is too large")

    safe_stem = _safe_stem(artifact.filename)
    artifact_id = f"{uuid4().hex[:12]}-{safe_stem}.html"
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    destination = ARTIFACTS_DIR / artifact_id
    temporary = destination.with_suffix(".tmp")
    temporary.write_bytes(encoded)
    temporary.replace(destination)

    public_artifact = CreatureArtifact(
        filename=f"{safe_stem}.html",
        media_type="text/html",
        url=f"/api/artifacts/{artifact_id}",
    )
    return alert.model_copy(update={"artifact": public_artifact})


def read_artifact(artifact_id: str) -> tuple[Path, str]:
    """Resolve a generated artifact without permitting path traversal."""

    if ARTIFACT_ID_PATTERN.fullmatch(artifact_id) is None:
        raise FileNotFoundError(artifact_id)
    path = ARTIFACTS_DIR / artifact_id
    if not path.is_file():
        raise FileNotFoundError(artifact_id)
    return path, path.read_text(encoding="utf-8")
