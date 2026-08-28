"""Generate and email the weekly EOW draft on Thursday afternoon."""

from __future__ import annotations

import base64
import json
import logging
import os
import smtplib
import sys
import time
from datetime import date, datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any

import gspread
from google import genai
from google.genai import types
from google.oauth2.service_account import Credentials

from validator import validate_report


LOGGER = logging.getLogger("eow")
ROOT = Path(__file__).resolve().parent
HISTORY_DIR = ROOT / "history"
REPORT_PATH = HISTORY_DIR / "last_eow.md"

CONTROL_TAB = "Control"
CONTROL_CELL = "B2"
TASKS_TAB = "Tasks"
CHANGE_LOG_TAB = "Log de Cambios"
TASKS_HEADERS = (
    "Titulo de Tarea",
    "Mes",
    "Fecha",
    "Propiedad",
    "Status",
    "Owner",
    "Reporter",
    "LOEE (hs)",
    "Categoria",
    "Deadline Estimado",
    "Link Jira",
    "Referencias/Links y Comentarios",
)
CHANGE_LOG_HEADERS = (
    "Fecha",
    "Titulo de Tarea",
    "Status Anterior",
    "Status Nuevo",
)
ACCOUNT_ALIASES = {
    "wws": "WWS",
    "tcp": "TCP",
    "both": "Both",
    "ambas": "Both",
    "ambos": "Both",
}
STATUS_ALIASES = {
    "done": "DONE",
    "en progreso": "IN PROGRESS",
    "in progress": "IN PROGRESS",
    "bloqueado": "BLOCKER",
    "bloqueada": "BLOCKER",
    "blocked": "BLOCKER",
    "blocker": "BLOCKER",
}
GEMINI_MODEL = "gemini-3.6-flash"
GEMINI_ATTEMPTS = 3
GEMINI_RETRY_SECONDS = 5

SHEETS_SCOPES = (
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.readonly",
)

SYSTEM_PROMPT = """You are an EOW Report Generator for a Senior Analytics Expert
working as a vendor for two Amazon accounts: WWS (Amazon Sustainability) and
TCP (The Climate Pledge) at Monks agency.

The report is generated and emailed Thursday at 16:00
America/Argentina/Buenos_Aires as a personal draft for manual editing and
forwarding. The supplied week-ending date is the following Friday. Do not
mention this automation, GitHub, checkboxes, prompts, or email delivery in the
report.

Output rules:
1. Write in English only.
2. The first line must be exactly:
   # EOW Report - Week Ending YYYY-MM-DD
3. Group work under meaningful bold workstream headers, for example:
   **Marketing Channel Architecture**
   **Reporting and Other Issues**
   **Platform / Technical**
   **Workflow Optimization**
   Omit a workstream when it has no meaningful logged work.
4. Under a workstream, use the plain account label `WWS:` or `TCP:`. For a
   source row whose Account is `Both`, use `WWS / TCP:`. Keep account-specific
   work separate.
5. Every work bullet must use exactly:
   - [Analytics] description - STATUS -
6. STATUS must be exactly one of:
   DONE
   IN PROGRESS
   BLOCKER
   IN PROGRESS, continues next week
7. Use only short hyphens (-). Never output an en dash or em dash.
8. Preserve tool and dashboard names exactly, including QuickSight, Redshift,
   and GA4.
9. Do not invent facts, dates, owners, metrics, causes, or outcomes. Put the
   exact tag [CONFIRMAR] inline whenever input is ambiguous or incomplete.
   A source value equal to [CONFIRMAR] is explicitly missing and must remain
   visible in the relevant work bullet. For a missing workstream, use the
   header **Unclassified workstream [CONFIRMAR]**. For a missing account,
   include `Account [CONFIRMAR]` in the bullet instead of guessing WWS or TCP.
10. Compare with the prior EOW. An ongoing prior task must be described as
    continuing, not as a fresh item. Use the continuing-next-week status when
    the supplied evidence supports it.
11. Be professional, concise, client-facing, and free of internal jargon.
    Do not include human names unless explicit attribution is required.
12. End with the exact bold header `**Needs confirmation**`.
    If there are no [CONFIRMAR] tags in the workstream body, put exactly `None.`
    below it. Otherwise, repeat every body tag once as numbered lines:
    `1. [CONFIRMAR] concise description`
    These are numbered lines, not hyphen bullets.
13. Output markdown only, with no code fence and no commentary.
"""


def required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def parse_service_account() -> dict[str, Any]:
    encoded = required_env("GCP_SA_KEY_BASE64")
    try:
        padded = encoded + ("=" * (-len(encoded) % 4))
        decoded = base64.b64decode(padded).decode("utf-8")
        info = json.loads(decoded)
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RuntimeError("GCP_SA_KEY_BASE64 is not valid base64 JSON.") from exc

    required_fields = {"client_email", "private_key", "token_uri"}
    missing = required_fields.difference(info)
    if missing:
        raise RuntimeError(
            "Service-account JSON is missing: " + ", ".join(sorted(missing))
        )
    return info


def sheets_client() -> gspread.Client:
    credentials = Credentials.from_service_account_info(
        parse_service_account(), scopes=SHEETS_SCOPES
    )
    return gspread.authorize(credentials)


def spreadsheet() -> gspread.Spreadsheet:
    return sheets_client().open_by_key(required_env("SPREADSHEET_ID"))


def checkbox_is_checked(book: gspread.Spreadsheet) -> bool:
    value = book.worksheet(CONTROL_TAB).acell(CONTROL_CELL).value
    return str(value).strip().upper() == "TRUE"


def week_ending_for(day: date | None = None) -> date:
    current = day or datetime.now(timezone.utc).date()
    return current + timedelta(days=(4 - current.weekday()) % 7)


def parse_sheet_date(value: Any) -> date:
    text = str(value).strip()
    formats = (
        "%Y-%m-%d",
        "%m/%d/%Y %H:%M:%S",
        "%d/%m/%Y %H:%M:%S",
        "%m/%d/%Y",
        "%d/%m/%Y",
        "%m/%d/%y",
        "%d/%m/%y",
        "%Y-%m-%dT%H:%M:%S",
    )
    for fmt in formats:
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).date()
    except ValueError as exc:
        raise ValueError(f"Unsupported sheet date: {text!r}") from exc


def normalized_key(value: Any) -> str:
    return " ".join(str(value).split()).casefold()


def require_headers(
    tab_name: str, actual: list[str], expected: tuple[str, ...]
) -> None:
    if tuple(actual) != expected:
        raise RuntimeError(
            f"{tab_name} header row must exactly equal: " + " | ".join(expected)
        )


def rows_as_dicts(
    values: list[list[str]], headers: tuple[str, ...]
) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for raw_row in values[1:]:
        row = list(raw_row[: len(headers)])
        row.extend([""] * (len(headers) - len(row)))
        rows.append(
            dict(zip(headers, (str(value).strip() for value in row)))
        )
    return rows


def weekly_updates(
    book: gspread.Spreadsheet, week_ending: date
) -> list[dict[str, str]]:
    task_values = book.worksheet(TASKS_TAB).get_all_values()
    log_values = book.worksheet(CHANGE_LOG_TAB).get_all_values()
    if not task_values:
        raise RuntimeError(f"Sheet tab {TASKS_TAB!r} is empty.")
    if not log_values:
        raise RuntimeError(f"Sheet tab {CHANGE_LOG_TAB!r} is empty.")
    require_headers(TASKS_TAB, task_values[0], TASKS_HEADERS)
    require_headers(CHANGE_LOG_TAB, log_values[0], CHANGE_LOG_HEADERS)

    tasks_by_title: dict[str, dict[str, str]] = {}
    duplicate_titles: set[str] = set()
    for task in rows_as_dicts(task_values, TASKS_HEADERS):
        key = normalized_key(task["Titulo de Tarea"])
        if not key:
            continue
        if key in tasks_by_title:
            duplicate_titles.add(task["Titulo de Tarea"])
        tasks_by_title[key] = task
    if duplicate_titles:
        raise RuntimeError(
            "Tasks contains duplicate titles: "
            + ", ".join(sorted(duplicate_titles))
        )

    period_start = week_ending - timedelta(days=6)
    latest_events: dict[str, tuple[datetime, dict[str, str]]] = {}
    ignored_invalid_statuses = 0
    for row_number, event in enumerate(
        rows_as_dicts(log_values, CHANGE_LOG_HEADERS), start=2
    ):
        title = event["Titulo de Tarea"]
        if not title:
            continue
        try:
            event_date = parse_sheet_date(event["Fecha"])
        except ValueError as exc:
            raise RuntimeError(
                f"Invalid date on {CHANGE_LOG_TAB}! row {row_number}."
            ) from exc
        if not period_start <= event_date <= week_ending:
            continue

        normalized_status = STATUS_ALIASES.get(
            normalized_key(event["Status Nuevo"])
        )
        if not normalized_status:
            ignored_invalid_statuses += 1
            continue

        key = normalized_key(title)
        timestamp = datetime.combine(event_date, datetime.min.time())
        try:
            timestamp = datetime.strptime(event["Fecha"], "%m/%d/%Y %H:%M:%S")
        except ValueError:
            pass
        previous = latest_events.get(key)
        if previous is None or timestamp >= previous[0]:
            latest_events[key] = (
                timestamp,
                {**event, "status": normalized_status},
            )

    if ignored_invalid_statuses:
        LOGGER.warning(
            "Ignored %s change-log rows whose new value was not a valid status.",
            ignored_invalid_statuses,
        )

    selected: list[dict[str, str]] = []
    for key, (timestamp, event) in sorted(
        latest_events.items(), key=lambda item: item[1][0]
    ):
        task = tasks_by_title.get(key, {})
        account = ACCOUNT_ALIASES.get(
            normalized_key(task.get("Propiedad", "")), "[CONFIRMAR]"
        )
        workstream = task.get("Categoria", "") or "[CONFIRMAR]"
        selected.append(
            {
                "changed_at": timestamp.isoformat(),
                "account": account,
                "workstream": workstream,
                "task_name_description": event["Titulo de Tarea"],
                "status_before": event["Status Anterior"] or "[CONFIRMAR]",
                "status": event["status"],
                "notes_blockers": (
                    task.get("Referencias/Links y Comentarios", "")
                    or "[CONFIRMAR]"
                ),
                "task_matched_in_master": "yes" if task else "no",
            }
        )

    if not selected:
        raise RuntimeError(
            f"No valid status changes found in {CHANGE_LOG_TAB!r} from "
            f"{period_start.isoformat()} through {week_ending.isoformat()}."
        )
    return selected


def read_previous_report() -> str:
    if not REPORT_PATH.exists():
        return "(No prior EOW exists. Treat this as the first run.)"
    content = REPORT_PATH.read_text(encoding="utf-8").strip()
    return content or "(The prior EOW file is empty.)"


def build_user_prompt(
    week_ending: date, updates: list[dict[str, str]], previous: str
) -> str:
    return f"""Create the EOW report for Friday {week_ending.isoformat()}.

WEEKLY SHEET UPDATES (authoritative current-week source):
<weekly_updates>
{json.dumps(updates, ensure_ascii=False, indent=2)}
</weekly_updates>

PREVIOUS EOW (comparison source only):
<previous_eow>
{previous}
</previous_eow>

Use only evidence inside these two delimited inputs. Current-week updates take
precedence for current status. If a required interpretation is unsupported,
use [CONFIRMAR] instead of guessing.
"""


def generate_report(
    week_ending: date, updates: list[dict[str, str]], previous: str
) -> str:
    client = genai.Client(api_key=required_env("GEMINI_API_KEY"))
    prompt = build_user_prompt(week_ending, updates, previous)
    failures: list[str] = []

    for attempt in range(1, GEMINI_ATTEMPTS + 1):
        try:
            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_PROMPT,
                    temperature=0.2,
                ),
            )
            report = (response.text or "").strip()
            validation = validate_report(report)
            if validation.is_valid:
                return report + "\n"
            failures.append(f"attempt {attempt}: " + "; ".join(validation.errors))
        except Exception as exc:  # SDK errors vary by transport and version.
            failures.append(f"attempt {attempt}: {type(exc).__name__}: {exc}")

        LOGGER.warning("Gemini attempt %s of %s failed.", attempt, GEMINI_ATTEMPTS)
        if attempt < GEMINI_ATTEMPTS:
            time.sleep(GEMINI_RETRY_SECONDS * attempt)

    raise RuntimeError(
        f"{GEMINI_MODEL} produced no valid report:\n" + "\n".join(failures)
    )


def atomic_write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(content, encoding="utf-8")
    temporary.replace(path)


def generate_and_email() -> None:
    book = spreadsheet()
    week_ending = week_ending_for()
    updates = weekly_updates(book, week_ending)
    report = generate_report(week_ending, updates, read_previous_report())
    atomic_write(REPORT_PATH, report)
    send_email(report, week_ending.isoformat())

    if checkbox_is_checked(book):
        try:
            book.worksheet(CONTROL_TAB).update_acell(CONTROL_CELL, False)
        except Exception:
            LOGGER.exception(
                "Draft was emailed, but Control!B2 could not be reset."
            )
    LOGGER.info(
        "Validated EOW generated and emailed for %s.",
        week_ending.isoformat(),
    )

def send_email(report: str, week_ending: str) -> None:
    sender = required_env("EMAIL_USER")
    password = required_env("EMAIL_PASSWORD")
    recipients = [
        item.strip() for item in required_env("EMAIL_TO").split(",") if item.strip()
    ]
    if not recipients:
        raise RuntimeError("EMAIL_TO contains no recipients.")

    message = MIMEMultipart("alternative")
    message["Subject"] = f"EOW Report - Week Ending {week_ending}"
    message["From"] = sender
    message["To"] = ", ".join(recipients)
    message.attach(MIMEText(report, "plain", "utf-8"))

    with smtplib.SMTP("smtp.gmail.com", 587, timeout=30) as server:
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(sender, password)
        server.sendmail(sender, recipients, message.as_string())


def main() -> int:
    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(message)s",
    )
    try:
        generate_and_email()
        return 0
    except Exception:
        LOGGER.exception("EOW pipeline failed.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
