from __future__ import annotations

import re
from pathlib import Path

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
