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

WORKSPACE_ROOT = Path(__file__).resolve().parent.parent
MAX_PROJECT_SLUG_LENGTH = 64


def is_website_task(task: str) -> bool:
    """Return whether a task asks for a website-like deliverable."""

    normalized = re.sub(r"\s+", " ", task.casefold()).strip()
    return bool(
        re.search(
            r"\b(website|web\s+site|webpage|web\s+page|site|html|"
            r"landing\s+page|frontend|web\s+app)\b",
            normalized,
        )
    )


def project_slug(task: str) -> str:
    """Create a stable, filesystem-safe project name from the founder task."""

    slug = re.sub(r"[^a-z0-9]+", "-", task.casefold()).strip("-")
    slug = slug[:MAX_PROJECT_SLUG_LENGTH].rstrip("-")
    return slug or "website"


def artifact_directory_for_task(task: str) -> str | None:
    """Return the standard relative output directory for website tasks."""

    if not is_website_task(task):
        return None
    return f"artifacts/{project_slug(task)}"


def artifact_entrypoint_for_task(task: str) -> str | None:
    directory = artifact_directory_for_task(task)
    return f"{directory}/index.html" if directory else None


def prepare_artifact_directory(directory: str | None) -> str | None:
    """Create the known output directory before agents start writing files."""

    if directory is None:
        return None
    target = (WORKSPACE_ROOT / directory).resolve()
    target.relative_to(WORKSPACE_ROOT)
    target.mkdir(parents=True, exist_ok=True)
    return directory


def list_artifact_files(directory: str | None) -> list[str]:
    """List generated files so the API can tell the founder exactly what exists."""

    if directory is None:
        return []
    target = (WORKSPACE_ROOT / directory).resolve()
    target.relative_to(WORKSPACE_ROOT)
    if not target.is_dir():
        return []
    return sorted(
        str(path.relative_to(WORKSPACE_ROOT))
        for path in target.rglob("*")
        if path.is_file() and not path.is_symlink() and not path.name.startswith(".")
    )


def artifact_location_instructions(task: str, *, write_files: bool = True) -> str:
    """Give agents one unambiguous location for a website deliverable."""

    directory = artifact_directory_for_task(task)
    if directory is None:
        return (
            "If this task creates files, use the safe workspace file tool and report "
            "each exact relative path. Never execute generated files."
        )
    entrypoint = f"{directory}/index.html"
    if not write_files:
        return (
            "WEBSITE ARTIFACT LOCATION — COORDINATOR OWNED\n"
            f"The final website belongs under `{directory}/`, with entrypoint "
            f"`{entrypoint}`. This is a specialist research pass: do not write final "
            "website files. Return evidence, a concrete implementation plan, and the "
            "exact intended file paths to the coordinator. Never execute generated code."
        )
    return (
        "WEBSITE ARTIFACT LOCATION — REQUIRED\n"
        f"Write every final website file under `{directory}/`. The browser entrypoint "
        f"must be `{entrypoint}`. Keep styles, scripts, images, README.md, and the "
        "final report in that same folder. Do not put the final site in the repository "
        "root, `frontend/`, or an arbitrary folder. Use relative workspace paths and "
        "list the exact generated files in your final response. Never execute generated "
        "code."
    )
