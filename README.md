# EOW Report Generator

Python and GitHub Actions pipeline for WWS / TCP weekly Analytics briefs.

## Schedule and lifecycle

- Thursday 20:00 ART (`23:00 UTC`): read `Control!B2`, extract the current
  weekly rows, compare them with `history/last_eow.md`, generate with Gemini,
  validate, and commit the draft plus a pending-mail marker.
- Friday 08:00 ART (`11:00 UTC`): send the already validated draft through
  Gmail SMTP, record it as sent, remove the marker, and set `Control!B2` to
  `FALSE`.
- A Google Apps Script can also dispatch `trigger_eow_generation`. It starts
  the Thursday generation phase immediately; it does not send row data.

If `Control!B2` is `FALSE`, generation exits successfully before calling
Gemini or modifying history. If a draft is already pending, duplicate
generation is skipped.

## Expected Google Sheet

The spreadsheet must contain:

1. Tab `Control`, with checkbox `APPR_EOW_FOR_MAIL` in cell `B2`.
2. Tab `Tasks`, the deduplicated task master, with these exact headers:

`Titulo de Tarea`, `Mes`, `Fecha`, `Propiedad`, `Status`, `Owner`, `Reporter`,
`LOEE (hs)`, `Categoria`, `Deadline Estimado`, `Link Jira`,
`Referencias/Links y Comentarios`.

3. Tab `Log de Cambios`, populated by `apps-script/Code.gs`, with:

`Fecha`, `Titulo de Tarea`, `Status Anterior`, `Status Nuevo`.

The weekly window is Saturday through the Friday named in the report. The
reader takes status changes from `Log de Cambios`, keeps the latest event for
each task, and joins it to `Tasks` by normalized task title.

Recognized account values in `Propiedad` are `WWS`, `TCP`, `Both`, `Ambas`, and
`Ambos`. Missing accounts or `Categoria` values are sent to Gemini as
`[CONFIRMAR]`; they are never guessed. Recognized status values are `Done`,
`En progreso`, `In progress`, `Bloqueado`, `Bloqueada`, `Blocked`, and
`Blocker`. Rows whose new value is not a status are ignored and logged as a
warning.

## Permission setup

### 1. Google Cloud service account for the Sheet

This identity is used by GitHub Actions. It is not your personal Google user.

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project.
3. Go to **APIs & Services > Library**.
4. Enable **Google Sheets API**.
5. Enable **Google Drive API**.
6. Go to **IAM & Admin > Service Accounts**.
7. Click **Create service account**.
8. Name it `eow-report-generator`. No project-wide IAM role is required.
9. Open the new service account.
10. Go to **Keys > Add key > Create new key > JSON**.
11. Download the JSON once and keep it outside this repository.
12. Open the target Google Sheet and click **Share**.
13. Copy `client_email` from the JSON and share the Sheet with that address as
    **Editor**.

Why Editor: Thursday requires reading the log tab and `Control!B2`; Friday
requires writing `FALSE` to `Control!B2`. Do not grant Workspace admin or
domain-wide delegation.

Encode the JSON on macOS without printing it:

```bash
base64 -i /absolute/path/eow-service-account.json | tr -d '\n' | pbcopy
```

Paste the clipboard value into the GitHub secret `GCP_SA_KEY_BASE64`, then
delete the local key if your organization's key-storage policy requires it.
Never commit the JSON.

### 2. Gemini API key

1. Open [Google AI Studio API keys](https://aistudio.google.com/apikey).
2. Select the intended Google Cloud project.
3. Create an API key.
4. Restrict it to the Generative Language API when the console offers API
   restrictions.
5. Add it to GitHub as `GEMINI_API_KEY`.

The configured model is `gemini-3.6-flash`. A generation run calls it up to
three times, retrying when the API errors or when `validator.py` rejects the
output. There is no fallback to a different model.

Gemini receives only the normalized weekly rows and prior markdown that Python
places in the request. The API key has no Sheet or Drive permission.

### 3. Gmail SMTP permission

1. Sign in as the mailbox that will send the brief.
2. Enable **2-Step Verification** at
   [Google Account Security](https://myaccount.google.com/security).
3. Open [App Passwords](https://myaccount.google.com/apppasswords).
4. Create an app password named `EOW GitHub Actions`.
5. Add the mailbox address to GitHub as `EMAIL_USER`.
6. Add the 16-character app password to GitHub as `EMAIL_PASSWORD`.
7. Add recipients, comma-separated, as `EMAIL_TO`.

Use an App Password, not the normal account password. No Gmail API role is
needed. If App Passwords is unavailable, a Google Workspace administrator must
allow it for the sending account; otherwise this SMTP design cannot
authenticate.

### 4. GitHub Actions permissions and secrets

In the GitHub repository:

1. Go to **Settings > Secrets and variables > Actions > Secrets**.
2. Add:
   - `GCP_SA_KEY_BASE64`
   - `GEMINI_API_KEY`
   - `EMAIL_USER`
   - `EMAIL_PASSWORD`
   - `EMAIL_TO`
   - `SPREADSHEET_ID`
3. `SPREADSHEET_ID` is the value between `/d/` and `/edit` in the Sheet URL.
4. Go to **Settings > Actions > General > Workflow permissions**.
5. Allow **Read and write permissions** if organization policy does not allow
   the YAML `contents: write` request by default.
6. Keep Actions enabled on the repository's default branch.

`GITHUB_TOKEN` is created automatically for each run. Do not create it as a
secret. It receives `contents: write` only so the workflow can commit files in
`history/`.

The Sheet tab names, headers, and Gemini model are fixed in code so accidental
repository-variable changes cannot point the automation at the wrong data.

### 5. Apps Script status log and optional checkbox webhook

The `onEdit` function in `apps-script/Code.gs` is required: it appends every
change in the `Tasks` column named `Status` to `Log de Cambios`. It resolves
the columns by header name rather than a fixed letter.

1. In the Sheet, open **Extensions > Apps Script**.
2. Replace the old `Code.gs` contents with the complete contents of
   `apps-script/Code.gs`.
3. Click **Save**. The `onEdit` function starts logging status changes without
   a separate trigger.

The scheduled Thursday run needs no GitHub token in Apps Script. Complete the
steps below only when checking `Control!B2` should launch generation
immediately instead of waiting for the schedule.

#### Create a least-privilege GitHub token

1. In GitHub, open **Settings > Developer settings > Personal access tokens >
   Fine-grained tokens**.
2. Restrict repository access to this repository only.
3. Grant repository permission **Contents: Read and write**. The dispatch REST
   endpoint requires this permission.
4. Use a short expiration and rotate it before expiry.

A classic PAT also works with `repo`, but grants broader access and is not
preferred.

#### Store properties and install the checkbox trigger

1. Open **Project Settings > Script Properties**.
2. Add:
   - `GH_TOKEN`
   - `GH_OWNER`
   - `GH_REPO`
3. The `dispatchEowOnEdit` function is already included in
   `apps-script/Code.gs`.

```javascript
function dispatchEowOnEdit(e) {
  const range = e.range;
  if (
    range.getSheet().getName() !== "Control" ||
    range.getA1Notation() !== "B2" ||
    String(e.value).toUpperCase() !== "TRUE"
  ) {
    return;
  }

  const props = PropertiesService.getScriptProperties();
  const owner = props.getProperty("GH_OWNER");
  const repo = props.getProperty("GH_REPO");
  const token = props.getProperty("GH_TOKEN");

  const response = UrlFetchApp.fetch(
    `https://api.github.com/repos/${owner}/${repo}/dispatches`,
    {
      method: "post",
      contentType: "application/json",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      payload: JSON.stringify({
        event_type: "trigger_eow_generation",
      }),
      muteHttpExceptions: true,
    }
  );

  if (response.getResponseCode() !== 204) {
    throw new Error(
      `GitHub dispatch failed: ${response.getResponseCode()} ${response.getContentText()}`
    );
  }
}
```

4. Click **Triggers** (clock icon) > **Add Trigger**.
5. Function: `dispatchEowOnEdit`.
6. Event source: **From spreadsheet**.
7. Event type: **On edit**.
8. Authorize spreadsheet access and external requests to `api.github.com`.

Use an installable trigger. A simple `onEdit` trigger cannot reliably make the
authorized external request. Keep the PAT in Script Properties, never in a
Sheet cell or source code.

`repository_dispatch` only runs a workflow file present on the default branch.

## First-run checklist

1. Confirm the Sheet is shared with the service-account `client_email`.
2. Confirm `Tasks` and `Log de Cambios` use the exact configured headers.
3. Leave `Control!B2` as `FALSE`.
4. In GitHub, open **Actions > EOW automation > Run workflow** and choose
   `generate`. It should finish without Gemini or history changes.
5. Change one real task's `Status`, confirm a new `Log de Cambios` row, and
   set `B2` to `TRUE`.
6. Manually run `generate`.
7. Review `history/last_eow.md` and `history/pending_email.txt`.
8. Set `EMAIL_TO` to an internal test recipient.
9. Manually run `send-email`.
10. Verify the email, `Control!B2 = FALSE`, and removal of the pending marker.

Only after this test should external recipients remain in `EMAIL_TO`.

## Local commands

Use Python 3.10 or newer:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py --mode generate
python main.py --mode send-email
```

For local runs, export the same environment variables used by GitHub. Do not
store real secrets in tracked files.

## Failure behavior

- Invalid or missing Sheet data: no Gemini output is persisted and `B2`
  remains `TRUE`.
- Gemini or regex validation failure after three attempts: no mail and no
  pending marker.
- Friday with no pending marker: exits without resending the prior report.
- SMTP failure: pending marker and `B2=TRUE` remain for retry.
- SMTP succeeds but B2 reset fails: the pending marker has already been deleted,
  so the workflow fails visibly and B2 must be reset manually.

SMTP does not provide an idempotency key. A runner termination in the very
small interval after SMTP accepts the message and before sent state is written
can cause a duplicate on retry.
