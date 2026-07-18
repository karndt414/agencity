from __future__ import annotations

import asyncio
import os
import signal
import shlex
import sys
from pathlib import Path
from typing import Any

from agents import function_tool


WORKSPACE_ROOT = Path(__file__).resolve().parent.parent
BACKEND_PYTHON = WORKSPACE_ROOT / "backend" / ".venv" / "bin" / "python"
MAX_COMMAND_LENGTH = 400
MAX_OUTPUT_CHARS = 16_000
COMMAND_TIMEOUT_SECONDS = 30
SECRET_PATH_PARTS = {".git", ".venv", "node_modules", ".pytest_cache"}

TOOL_CATALOG: list[dict[str, str]] = [
    {
        "name": "web_search",
        "kind": "hosted",
        "status": "enabled",
        "description": "Search current public web information and preserve source URLs.",
    },
    {
        "name": "handoffs",
        "kind": "agent-routing",
        "status": "enabled",
        "description": "Route a specialist task to another creature for collaboration.",
    },
    {
        "name": "run_terminal_command",
        "kind": "local-inspection",
        "status": "enabled",
        "description": "Run an allowlisted, inspection-only command inside the repository workspace.",
    },
    {
        "name": "run_python_check",
        "kind": "local-python",
        "status": "enabled",
        "description": "Compile-check approved Python paths without executing application code.",
    },
    {
        "name": "read_workspace_file",
        "kind": "local-files",
        "status": "enabled",
        "description": "Read bounded source and Markdown files while excluding secrets and dependencies.",
    },
    {
        "name": "write_workspace_file",
        "kind": "local-files",
        "status": "enabled",
        "description": "Create or update approved text files without granting execute permission.",
    },
    {
        "name": "task_orchestrator",
        "kind": "agent-orchestration",
        "status": "enabled",
        "description": "Run parallel low-cost workers and compile their evidence into one structured report.",
    },
]


def _contains_secret_path(path: Path) -> bool:
    return any(
        part in SECRET_PATH_PARTS or part == ".env" or part.startswith(".env.")
        for part in path.parts
    )


def _resolve_cwd(cwd: str) -> Path:
    raw = Path(cwd.strip() or ".")
    candidate = (raw if raw.is_absolute() else WORKSPACE_ROOT / raw).resolve()
    try:
        candidate.relative_to(WORKSPACE_ROOT)
    except ValueError as exc:
        raise ValueError("cwd must stay inside the repository workspace") from exc
    if _contains_secret_path(candidate.relative_to(WORKSPACE_ROOT)):
        raise ValueError("cwd points at a protected directory")
    if not candidate.is_dir():
        raise ValueError(f"cwd is not a directory: {cwd}")
    return candidate


def _resolve_workspace_path(value: str, cwd: Path) -> Path:
    if not value or value.startswith(("/", "~")):
        raise ValueError("paths must be relative to the repository workspace")
    candidate = (cwd / value).resolve()
    try:
        candidate.relative_to(WORKSPACE_ROOT)
    except ValueError as exc:
        raise ValueError("path must stay inside the repository workspace") from exc
    if _contains_secret_path(candidate.relative_to(WORKSPACE_ROOT)):
        raise ValueError("access to protected paths is blocked")
    return candidate


def _validate_shell_syntax(command: str) -> None:
    forbidden = (";", "&&", "||", "|", ">", "<", "`", "$(", "\n", "\r")
    if any(token in command for token in forbidden):
        raise ValueError("shell operators, redirection, and command substitution are blocked")


def _validate_ls(argv: list[str], cwd: Path) -> list[str]:
    allowed_flags = {"-l"}
    for token in argv[1:]:
        if token.startswith("-"):
            if token not in allowed_flags:
                raise ValueError(f"ls flag is not allowed: {token}")
        else:
            _resolve_workspace_path(token, cwd)
    return argv


def _validate_rg(argv: list[str], cwd: Path) -> list[str]:
    if len(argv) not in {2, 3} or argv[1].startswith("-"):
        raise ValueError("rg usage is limited to: rg <pattern> [relative-path]")
    if len(argv[1]) > 160:
        raise ValueError("rg pattern is too long")
    if len(argv) == 3:
        _resolve_workspace_path(argv[2], cwd)
    return [
        "rg",
        "--max-count",
        "50",
        "--glob",
        "!.env",
        "--glob",
        "!.env.*",
        "--glob",
        "!.git/**",
        "--glob",
        "!**/.venv/**",
        "--glob",
        "!**/node_modules/**",
        *argv[1:],
    ]


def _validate_git(argv: list[str]) -> list[str]:
    if argv in (["git", "status"], ["git", "status", "--short"]):
        return ["git", "status", "--short"]
    if argv == ["git", "diff", "--stat"]:
        return argv
    if len(argv) == 5 and argv[:4] == ["git", "log", "--oneline", "-n"]:
        try:
            count = int(argv[4])
        except ValueError as exc:
            raise ValueError("git log count must be an integer") from exc
        if 1 <= count <= 20:
            return argv
    raise ValueError("only git status, git diff --stat, and short git log are allowed")


def _validate_python(argv: list[str], cwd: Path) -> list[str]:
    if len(argv) < 3 or argv[1] != "-m" or argv[2] not in {"compileall", "json.tool"}:
        raise ValueError("Python is limited to compileall and json.tool; application execution is blocked")

    module = argv[2]
    allowed_flags = {"-q"}
    if module == "json.tool":
        if len(argv) != 4:
            raise ValueError("json.tool requires one protected-safe workspace path")
        _resolve_workspace_path(argv[3], cwd)
        return [str(BACKEND_PYTHON if BACKEND_PYTHON.exists() else sys.executable), *argv[1:]]

    if len(argv) < 4:
        raise ValueError("compileall requires an explicit protected-safe workspace path")
    for token in argv[3:]:
        if token.startswith("-"):
            if token not in allowed_flags:
                raise ValueError(f"Python flag is not allowed: {token}")
        else:
            target = _resolve_workspace_path(token, cwd)
            relative = target.relative_to(WORKSPACE_ROOT)
            if not relative.parts or relative.parts[0] != "backend":
                raise ValueError("compileall is limited to the backend workspace")
    return [str(BACKEND_PYTHON if BACKEND_PYTHON.exists() else sys.executable), *argv[1:]]


def _validated_argv(command: str, cwd: Path) -> list[str]:
    clean = command.strip()
    if not clean:
        raise ValueError("command is required")
    if len(clean) > MAX_COMMAND_LENGTH:
        raise ValueError(f"command exceeds {MAX_COMMAND_LENGTH} characters")
    _validate_shell_syntax(clean)
    try:
        argv = shlex.split(clean)
    except ValueError as exc:
        raise ValueError(f"command could not be parsed: {exc}") from exc
    if not argv:
        raise ValueError("command is required")

    program = argv[0]
    if program == "pwd":
        if len(argv) != 1:
            raise ValueError("pwd does not accept arguments")
        return argv
    if program == "ls":
        return _validate_ls(argv, cwd)
    if program == "rg":
        return _validate_rg(argv, cwd)
    if program == "git":
        return _validate_git(argv)
    if program in {"python", "python3"}:
        return _validate_python(argv, cwd)
    raise ValueError(
        "command is not allowlisted; supported commands are inspection commands and compile-only Python checks"
    )


def _safe_environment() -> dict[str, str]:
    return {
        "PATH": os.environ.get("PATH", ""),
        "LANG": "C.UTF-8",
        "LC_ALL": "C.UTF-8",
        "PYTHONUNBUFFERED": "1",
    }


async def execute_terminal_command(command: str, cwd: str = ".") -> dict[str, Any]:
    """Execute one safe workspace command without exposing the server environment."""

    resolved_cwd = _resolve_cwd(cwd)
    argv = _validated_argv(command, resolved_cwd)
    try:
        process = await asyncio.create_subprocess_exec(
            *argv,
            cwd=resolved_cwd,
            env=_safe_environment(),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            start_new_session=os.name != "nt",
        )
    except FileNotFoundError as exc:
        return {
            "ok": False,
            "command": command,
            "cwd": str(resolved_cwd.relative_to(WORKSPACE_ROOT)),
            "exit_code": None,
            "stdout": "",
            "stderr": f"executable unavailable: {argv[0]}",
            "stdout_truncated": False,
            "stderr_truncated": False,
            "timed_out": False,
        }

    try:
        stdout, stderr = await asyncio.wait_for(
            process.communicate(), timeout=COMMAND_TIMEOUT_SECONDS
        )
        timed_out = False
    except asyncio.TimeoutError:
        if os.name == "nt":
            process.kill()
        else:
            os.killpg(process.pid, signal.SIGKILL)
        stdout, stderr = await process.communicate()
        timed_out = True

    stdout_decoded = stdout.decode("utf-8", errors="replace")
    stderr_decoded = stderr.decode("utf-8", errors="replace")
    stdout_text = stdout_decoded[:MAX_OUTPUT_CHARS]
    stderr_text = stderr_decoded[:MAX_OUTPUT_CHARS]
    return {
        "ok": process.returncode == 0 and not timed_out,
        "command": command,
        "cwd": str(resolved_cwd.relative_to(WORKSPACE_ROOT)) or ".",
        "exit_code": process.returncode,
        "stdout": stdout_text,
        "stderr": stderr_text,
        "stdout_truncated": len(stdout_decoded) > MAX_OUTPUT_CHARS,
        "stderr_truncated": len(stderr_decoded) > MAX_OUTPUT_CHARS,
        "timed_out": timed_out,
    }


@function_tool(
    name_override="run_terminal_command",
    description_override=(
        "Run one safe, inspection-only command inside the Agencity repository. "
        "Use this for repository inspection, source search, or git status/diff/log. "
        "It cannot execute programs, run tests, build packages, access secrets, or mutate files."
    ),
    timeout=COMMAND_TIMEOUT_SECONDS + 5,
)
async def run_terminal_command(command: str, cwd: str = ".") -> dict[str, Any]:
    return await execute_terminal_command(command, cwd)


async def execute_python_check(target: str = "backend") -> dict[str, Any]:
    """Compile-check an allowlisted Python path without executing application code."""

    allowed_targets = {"backend/tests", "backend/tests/test_backend.py", "backend"}
    clean_target = target.strip() or "backend"
    if clean_target == "compileall":
        clean_target = "backend"
    if clean_target not in allowed_targets:
        options = ", ".join(["compileall", *sorted(allowed_targets)])
        raise ValueError(f"Python check target must be one of: {options}")
    return await execute_terminal_command(f"python -m compileall -q {clean_target}")


@function_tool(
    name_override="run_python_check",
    description_override=(
        "Compile-check Agencity Python source using its local Python environment. "
        "This validates syntax but never runs application or test code."
    ),
    timeout=COMMAND_TIMEOUT_SECONDS + 5,
)
async def run_python_check(target: str = "backend") -> dict[str, Any]:
    return await execute_python_check(target)
