from __future__ import annotations

import os
import stat
import tempfile
from pathlib import Path
from typing import Any

from agents import function_tool


WORKSPACE_ROOT = Path(__file__).resolve().parent.parent
MAX_FILE_BYTES = 100_000
PROTECTED_PATH_PARTS = {".git", ".venv", "node_modules", ".pytest_cache"}
ALLOWED_FILE_EXTENSIONS = {
    ".css",
    ".html",
    ".js",
    ".jsx",
    ".json",
    ".md",
    ".mdx",
    ".py",
    ".sql",
    ".toml",
    ".ts",
    ".tsx",
    ".txt",
    ".yaml",
    ".yml",
}


def _is_protected(path: Path) -> bool:
    return any(
        part in PROTECTED_PATH_PARTS
        or part == ".env"
        or part.startswith(".env.")
        for part in path.parts
    )


def _resolve_file(path: str) -> Path:
    if not path or path.startswith(("/", "~")):
        raise ValueError("path must be relative to the repository workspace")

    candidate = (WORKSPACE_ROOT / path).resolve()
    try:
        relative = candidate.relative_to(WORKSPACE_ROOT)
    except ValueError as exc:
        raise ValueError("path must stay inside the repository workspace") from exc

    if not relative.parts or _is_protected(relative):
        raise ValueError("access to protected paths is blocked")
    if candidate.suffix.lower() not in ALLOWED_FILE_EXTENSIONS:
        allowed = ", ".join(sorted(ALLOWED_FILE_EXTENSIONS))
        raise ValueError(f"file extension is not allowed; use one of: {allowed}")
    return candidate


def _relative(path: Path) -> str:
    return str(path.relative_to(WORKSPACE_ROOT))


def read_workspace_file_impl(path: str) -> dict[str, Any]:
    """Read a bounded, non-secret source or documentation file."""

    target = _resolve_file(path)
    if not target.is_file():
        raise ValueError(f"file does not exist: {path}")

    raw = target.read_bytes()
    truncated = len(raw) > MAX_FILE_BYTES
    content = raw[:MAX_FILE_BYTES].decode("utf-8", errors="replace")
    return {
        "ok": True,
        "path": _relative(target),
        "content": content,
        "truncated": truncated,
    }


def write_workspace_file_impl(
    path: str,
    content: str,
    overwrite: bool = False,
) -> dict[str, Any]:
    """Create or update a workspace file without granting execute permission."""

    target = _resolve_file(path)
    encoded = content.encode("utf-8")
    if len(encoded) > MAX_FILE_BYTES:
        raise ValueError(f"content exceeds the {MAX_FILE_BYTES}-byte limit")
    was_existing = target.exists()
    if was_existing and not overwrite:
        raise ValueError("file already exists; pass overwrite=true to replace it")
    if was_existing and not target.is_file():
        raise ValueError("target is not a regular file")

    target.parent.mkdir(parents=True, exist_ok=True)
    temporary_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb",
            dir=target.parent,
            prefix=f".{target.name}.",
            suffix=".tmp",
            delete=False,
        ) as temporary:
            temporary.write(encoded)
            temporary.flush()
            os.fsync(temporary.fileno())
            temporary_path = temporary.name
        os.replace(temporary_path, target)
        temporary_path = None

        # Generated files are data/artifacts, never executable programs.
        os.chmod(
            target,
            stat.S_IRUSR
            | stat.S_IWUSR
            | stat.S_IRGRP
            | stat.S_IROTH,
        )
    finally:
        if temporary_path is not None:
            try:
                os.unlink(temporary_path)
            except FileNotFoundError:
                pass

    return {
        "ok": True,
        "path": _relative(target),
        "bytes": len(encoded),
        "created": not was_existing,
        "executable": False,
    }


@function_tool(
    name_override="read_workspace_file",
    description_override=(
        "Read a bounded source or documentation file inside the repository. "
        "Secrets, environment files, dependency directories, and binary files are blocked."
    ),
)
async def read_workspace_file(path: str) -> dict[str, Any]:
    return read_workspace_file_impl(path)


@function_tool(
    name_override="write_workspace_file",
    description_override=(
        "Create or update a source, configuration, or Markdown file inside the repository. "
        "Only approved text extensions are allowed; secrets and protected directories are "
        "blocked; generated files are written without execute permission. Never run the file."
    ),
)
async def write_workspace_file(
    path: str,
    content: str,
    overwrite: bool = False,
) -> dict[str, Any]:
    return write_workspace_file_impl(path, content, overwrite)
