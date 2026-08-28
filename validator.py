"""Validation rules for generated EOW markdown reports."""

from __future__ import annotations

import re
from dataclasses import dataclass


HEADER_RE = re.compile(
    r"^# EOW Report - Week Ending \d{4}-\d{2}-\d{2}$", re.MULTILINE
)
WORKSTREAM_HEADER_RE = re.compile(r"^\*\*(?!Needs confirmation\*\*$).+\*\*$")
ACCOUNT_HEADER_RE = re.compile(r"^(WWS|TCP|WWS / TCP):$")
STATUS_RE = (
    r"(?:DONE|IN PROGRESS|BLOCKER|IN PROGRESS, continues next week)"
)
BULLET_RE = re.compile(rf"^- .+ - {STATUS_RE} -$")
CONFIRM_SECTION_RE = re.compile(
    r"^\*\*Needs confirmation\*\*[ \t]*$", re.MULTILINE
)


@dataclass(frozen=True)
class ValidationResult:
    """Structured validator result."""

    errors: tuple[str, ...]

    @property
    def is_valid(self) -> bool:
        return not self.errors

    def raise_for_errors(self) -> None:
        if self.errors:
            raise ValueError("Invalid EOW report:\n- " + "\n- ".join(self.errors))


def validate_report(report: str) -> ValidationResult:
    """Validate the complete output contract without modifying model text."""
    errors: list[str] = []
    normalized = report.strip()

    if not normalized:
        return ValidationResult(("Report is empty.",))

    if "—" in normalized or "–" in normalized:
        errors.append("Only short hyphens are allowed; en/em dashes were found.")

    if "[Analytics]" in normalized:
        errors.append("The obsolete [Analytics] prefix is not allowed.")

    if not HEADER_RE.search(normalized):
        errors.append(
            "Missing exact '# EOW Report - Week Ending YYYY-MM-DD' header."
        )

    confirmation_headers = list(CONFIRM_SECTION_RE.finditer(normalized))
    if len(confirmation_headers) != 1:
        errors.append("Exactly one '**Needs confirmation**' section is required.")
        body = normalized
        confirmation_text = ""
    else:
        split_at = confirmation_headers[0].start()
        body = normalized[:split_at].rstrip()
        confirmation_text = normalized[confirmation_headers[0].end() :].strip()

        if not confirmation_text:
            errors.append("The Needs confirmation section cannot be empty.")

    workstream_count = 0
    bullet_count = 0
    workstream_has_bullet = False
    seen_workstream = False

    for line_number, raw_line in enumerate(body.splitlines(), start=1):
        line = raw_line.strip()
        if not line or HEADER_RE.fullmatch(line):
            continue

        if WORKSTREAM_HEADER_RE.fullmatch(line):
            if seen_workstream and not workstream_has_bullet:
                errors.append("A workstream section has no valid work bullets.")
            workstream_count += 1
            seen_workstream = True
            workstream_has_bullet = False
            continue

        if ACCOUNT_HEADER_RE.fullmatch(line):
            if not seen_workstream:
                errors.append(
                    f"Account label before a workstream on line {line_number}."
                )
            continue

        if line.startswith("-"):
            bullet_count += 1
            if not BULLET_RE.fullmatch(line):
                errors.append(
                    f"Invalid bullet syntax or status on line {line_number}: {line}"
                )
            elif not seen_workstream:
                errors.append(
                    f"Work bullet before a workstream on line {line_number}."
                )
            else:
                workstream_has_bullet = True
            continue

        errors.append(f"Unexpected body line {line_number}: {line}")

    if seen_workstream and not workstream_has_bullet:
        errors.append("The final workstream section has no valid work bullets.")
    if workstream_count == 0:
        errors.append("At least one bold workstream section is required.")
    if bullet_count == 0:
        errors.append("At least one work bullet is required.")

    body_confirmations = body.count("[CONFIRMAR]")
    confirmation_confirmations = confirmation_text.count("[CONFIRMAR]")
    if body_confirmations != confirmation_confirmations:
        errors.append(
            "Needs confirmation must repeat each body [CONFIRMAR] tag exactly once "
            f"(body={body_confirmations}, section={confirmation_confirmations})."
        )

    if body_confirmations == 0 and confirmation_text != "None.":
        errors.append(
            "Needs confirmation must contain exactly 'None.' when no tags exist."
        )
    if body_confirmations > 0:
        confirmation_lines = [
            line.strip()
            for line in confirmation_text.splitlines()
            if line.strip()
        ]
        if any(not re.fullmatch(r"\d+\. \[CONFIRMAR\] .+", line) for line in confirmation_lines):
            errors.append(
                "Confirmation entries must be numbered as "
                "'1. [CONFIRMAR] description'."
            )

    return ValidationResult(tuple(dict.fromkeys(errors)))


def assert_valid_report(report: str) -> None:
    """Raise ValueError when the report violates any output rule."""
    validate_report(report).raise_for_errors()
