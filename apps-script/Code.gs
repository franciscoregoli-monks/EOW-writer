/**
 * Append status changes from Tasks to Log de Cambios.
 *
 * The columns are resolved from row 1, so moving Status or Titulo de Tarea
 * does not silently break the trigger.
 */
function onEdit(e) {
  if (!e || !e.range) return;

  const sheet = e.range.getSheet();
  if (sheet.getName() !== "Tasks") return;
  if (
    e.range.getRow() <= 1 ||
    e.range.getNumRows() !== 1 ||
    e.range.getNumColumns() !== 1
  ) {
    return;
  }

  const headers = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getDisplayValues()[0];
  const taskColumn = headers.indexOf("Titulo de Tarea") + 1;
  const statusColumn = headers.indexOf("Status") + 1;
  if (!taskColumn || !statusColumn) {
    throw new Error(
      "Tasks must contain Titulo de Tarea and Status headers."
    );
  }
  if (e.range.getColumn() !== statusColumn) return;

  const taskTitle = sheet.getRange(e.range.getRow(), taskColumn).getValue();
  const oldStatus = e.oldValue === undefined ? "" : e.oldValue;
  const newStatus =
    e.value === undefined ? e.range.getDisplayValue() : e.value;
  if (!taskTitle || String(oldStatus) === String(newStatus)) return;

  const logSheet = e.source.getSheetByName("Log de Cambios");
  if (!logSheet) {
    throw new Error('Missing required tab "Log de Cambios".');
  }

  logSheet.appendRow([new Date(), taskTitle, oldStatus, newStatus]);
}

/**
 * Install this function as an "On edit" trigger. It dispatches generation
 * only when Control!B2 changes to TRUE.
 */
function dispatchEowOnEdit(e) {
  if (!e || !e.range) return;
  if (
    e.range.getSheet().getName() !== "Control" ||
    e.range.getA1Notation() !== "B2" ||
    String(e.value).toUpperCase() !== "TRUE"
  ) {
    return;
  }

  const props = PropertiesService.getScriptProperties();
  const owner = props.getProperty("GH_OWNER");
  const repo = props.getProperty("GH_REPO");
  const token = props.getProperty("GH_TOKEN");
  if (!owner || !repo || !token) {
    throw new Error("Missing GH_OWNER, GH_REPO, or GH_TOKEN script property.");
  }

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
      `GitHub dispatch failed: ${response.getResponseCode()} ` +
        response.getContentText()
    );
  }
}
