from __future__ import annotations

import json
from typing import Any

from pydantic import BaseModel, Field


class ReportFinding(BaseModel):
    worker: str
    headline: str
    details: str
    impact: str
    recommendation: str
    sources: list[str] = Field(default_factory=list)


class TaskReport(BaseModel):
    """The structured artifact produced by the orchestrator."""

    task: str
    summary: str
    findings: list[ReportFinding] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    sources: list[str] = Field(default_factory=list)


def _dedupe_sources(sources: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for source in sources:
        clean = source.strip()
        if clean and clean not in seen:
            seen.add(clean)
            result.append(clean)
    return result


def enforce_citations(report: TaskReport) -> TaskReport:
    """Keep only findings with traceable source references.

    Web claims should carry exact URLs; claims based on supplied repository data
    should carry a path or record reference. The orchestrator is the final gate,
    so an uncited worker claim cannot silently become a final recommendation.
    """

    supported: list[ReportFinding] = []
    missing: list[str] = []
    finding_sources: list[str] = []
    for finding in report.findings:
        finding.sources = _dedupe_sources(finding.sources)
        if finding.sources:
            supported.append(finding)
            finding_sources.extend(finding.sources)
        else:
            missing.append(f"{finding.worker}: {finding.headline}")

    report.findings = supported
    report.sources = _dedupe_sources([*report.sources, *finding_sources])
    if missing:
        report.risks = [
            *report.risks,
            "Omitted uncited findings: " + "; ".join(missing),
        ]
    return report


def parse_task_report(output: Any) -> TaskReport:
    if isinstance(output, TaskReport):
        return output
    if isinstance(output, BaseModel):
        return TaskReport.model_validate(output.model_dump())
    if isinstance(output, dict):
        return TaskReport.model_validate(output)
    if isinstance(output, str):
        cleaned = output.strip()
        if cleaned.startswith("```"):
            lines = cleaned.splitlines()
            if lines and lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            cleaned = "\n".join(lines).strip()
        return TaskReport.model_validate(json.loads(cleaned))
    raise TypeError(f"Unsupported task report output type: {type(output).__name__}")


def render_task_report(report: TaskReport) -> str:
    lines = [
        f"# Task report: {report.task}",
        "",
        "## Summary",
        "",
        report.summary,
        "",
        "## Findings",
        "",
    ]

    if report.findings:
        for finding in report.findings:
            lines.extend(
                [
                    f"### {finding.headline} ({finding.worker})",
                    "",
                    finding.details,
                    "",
                    f"**Impact:** {finding.impact}",
                    "",
                    f"**Recommendation:** {finding.recommendation}",
                    "",
                ]
            )
    else:
        lines.extend(["No worker findings were returned.", ""])

    lines.extend(["## Recommendations", ""])
    lines.extend(f"- {item}" for item in report.recommendations)
    if not report.recommendations:
        lines.append("No recommendations were returned.")
    lines.append("")

    lines.extend(["## Risks", ""])
    lines.extend(f"- {item}" for item in report.risks)
    if not report.risks:
        lines.append("No additional risks were reported.")
    lines.append("")

    if report.sources:
        lines.extend(["## Sources", ""])
        lines.extend(f"- {source}" for source in report.sources)
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"
