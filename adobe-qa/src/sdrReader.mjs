import { readFile } from "node:fs/promises";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";
import { unzipSync } from "fflate";

const SHEETS = {
  events: {
    name: "Events",
    headers: ["#", "Friendly Name", "Event Type", "Description"],
  },
  eVars: {
    name: "Conversion Variables (eVars)",
    headers: ["#", "Variable (Friendly Name)", "Description"],
  },
  props: {
    name: "Traffic Variables (props)",
    headers: ["#", "Variable (Friendly Name)", "Description"],
  },
  pushes: {
    name: "Data Layer Pushes",
    headers: ["Variable (Friendly Name)", "Reference", "Description"],
  },
  suites: {
    name: "Report Suites",
    headers: ["RSID", "Title", "Description"],
  },
};

function text(value) {
  if (value == null) return "";
  if (typeof value === "object" && value["#text"] != null) {
    return String(value["#text"]);
  }
  return String(value);
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function richText(node) {
  if (node == null) return "";
  if (typeof node !== "object") return String(node);
  if (node.t != null) return text(node.t);
  return asArray(node.r)
    .map((run) => text(run.t))
    .join("");
}

function columnNumber(reference) {
  const letters = String(reference).match(/^[A-Z]+/)?.[0] || "";
  return [...letters].reduce(
    (number, letter) => number * 26 + letter.charCodeAt(0) - 64,
    0
  );
}

function xmlFile(files, name, parser) {
  const bytes = files[name];
  if (!bytes) throw new Error(`Missing XLSX part: ${name}`);
  return parser.parse(new TextDecoder().decode(bytes));
}

function parseWorksheet(xml, sharedStrings) {
  return asArray(xml.worksheet?.sheetData?.row)
    .map((row) => {
      const cells = {};
      for (const cell of asArray(row.c)) {
        const column = columnNumber(cell["@_r"]);
        let value = "";
        if (cell["@_t"] === "s") {
          value = sharedStrings[Number(cell.v)] || "";
        } else if (cell["@_t"] === "inlineStr") {
          value = richText(cell.is);
        } else if (cell.v != null) {
          value = text(cell.v);
        }
        if (value !== "") cells[column] = value;
      }
      return { rowNumber: Number(row["@_r"]), cells };
    })
    .filter((row) => Object.keys(row.cells).length);
}

async function parseWorkbook(filePath) {
  const files = unzipSync(new Uint8Array(await readFile(filePath)));
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseTagValue: false,
    trimValues: false,
  });
  const sharedXml = xmlFile(files, "xl/sharedStrings.xml", parser);
  const sharedStrings = asArray(sharedXml.sst?.si).map(richText);
  const workbookXml = xmlFile(files, "xl/workbook.xml", parser);
  const relationshipsXml = xmlFile(
    files,
    "xl/_rels/workbook.xml.rels",
    parser
  );
  const relationships = Object.fromEntries(
    asArray(relationshipsXml.Relationships?.Relationship).map((relationship) => [
      relationship["@_Id"],
      relationship["@_Target"],
    ])
  );
  const sheets = {};
  for (const sheet of asArray(workbookXml.workbook?.sheets?.sheet)) {
    const target = relationships[sheet["@_r:id"]].replace(/^\//, "");
    const archivePath = target.startsWith("xl/") ? target : `xl/${target}`;
    sheets[sheet["@_name"]] = parseWorksheet(
      xmlFile(files, archivePath, parser),
      sharedStrings
    );
  }
  return sheets;
}

function findHeader(worksheetName, rows, required) {
  for (const row of rows) {
    const cells = Object.entries(row.cells).map(([column, value]) => ({
      column: Number(column),
      value,
    }));
    const columns = {};
    for (const header of required) {
      const match = cells.find((cell) => cell.value === header);
      if (!match) break;
      columns[header] = match.column;
    }
    if (Object.keys(columns).length === required.length) {
      return {
        rowNumber: row.rowNumber,
        columns,
        literal: cells.map((cell) => cell.value),
      };
    }
  }
  throw new Error(
    `${worksheetName}: could not find header row containing ${required.join(", ")}`
  );
}

function readTable(worksheetRows, spec) {
  const header = findHeader(spec.name, worksheetRows, spec.headers);
  const tableRows = [];
  const keyColumn = header.columns[spec.headers[0]];
  for (const row of worksheetRows) {
    if (row.rowNumber <= header.rowNumber) continue;
    if (!text(row.cells[keyColumn]).trim()) continue;
    const values = {};
    for (const [label, column] of Object.entries(header.columns)) {
      values[label] = text(row.cells[column]).trim();
    }
    // Preserve every literal column, including columns not required to locate the table.
    const headerRow = worksheetRows.find(
      (candidate) => candidate.rowNumber === header.rowNumber
    );
    for (const [column, value] of Object.entries(row.cells)) {
      const headerName = text(headerRow.cells[Number(column)]).trim();
      if (headerName) values[headerName] = value.trim();
    }
    tableRows.push({ rowNumber: row.rowNumber, values });
  }
  return { header, rows: tableRows };
}

function stripSuffix(name, type) {
  const pattern =
    type === "event"
      ? /\s*\(e\d+\)\s*$/i
      : type === "eVar"
        ? /\s*\(v\d+\)\s*$/i
        : /\s*\(c\d+\)\s*$/i;
  return name.replace(pattern, "").trim();
}

function numericId(value, prefix) {
  const match = String(value).match(/(\d+)/);
  return match ? `${prefix}${Number(match[1])}` : null;
}

function eventIdFromName(value) {
  const match = String(value).match(/\(e(\d+)\)/i);
  return match ? `event${Number(match[1])}` : null;
}

function eventNameFromPush(reference) {
  const match = reference.match(/event\s*:\s*["“”']([^"“”']+)["“”']/i);
  return match ? match[1].trim() : null;
}

function canonicalMap(rows, type) {
  const prefix = type === "event" ? "event" : type === "eVar" ? "eVar" : "prop";
  const friendlyColumn =
    type === "event" ? "Friendly Name" : "Variable (Friendly Name)";
  const output = {};
  for (const { rowNumber, values } of rows) {
    const friendlyName = values[friendlyColumn]?.trim();
    if (!friendlyName) continue;
    const id = numericId(values["#"], prefix);
    if (!id) continue;
    output[id] = {
      id,
      canonicalName: stripSuffix(friendlyName, type),
      friendlyName,
      description: values.Description || "",
      status: values.Status || "",
      sourceRow: rowNumber,
    };
  }
  return output;
}

export async function readSdr(filePath) {
  const workbook = await parseWorkbook(filePath);

  const tables = {};
  for (const [key, spec] of Object.entries(SHEETS)) {
    const worksheet = workbook[spec.name];
    if (!worksheet) throw new Error(`Missing SDR sheet: ${spec.name}`);
    tables[key] = readTable(worksheet, spec);
  }

  const events = canonicalMap(tables.events.rows, "event");
  const eVars = canonicalMap(tables.eVars.rows, "eVar");
  const props = canonicalMap(tables.props.rows, "prop");

  const dataLayerPushes = {};
  const aliases = {};
  for (const { rowNumber, values } of tables.pushes.rows) {
    const label = values["Variable (Friendly Name)"];
    const eventId = eventIdFromName(label);
    const reference = values.Reference || "";
    const dataLayerEvent = eventNameFromPush(reference);
    const key = eventId || `row${rowNumber}`;
    dataLayerPushes[key] = {
      eventId,
      label,
      dataLayerEvent,
      reference,
      description: values.Description || "",
      whenSet: values["When Set"] || "",
      responsible: values["Responsible for populating"] || "",
      sourceRow: rowNumber,
    };
    if (eventId) {
      aliases[label.toLowerCase()] = eventId;
      if (dataLayerEvent) aliases[dataLayerEvent.toLowerCase()] = eventId;
    }
  }

  for (const event of Object.values(events)) {
    aliases[event.id.toLowerCase()] = event.id;
    aliases[event.friendlyName.toLowerCase()] = event.id;
    aliases[event.canonicalName.toLowerCase()] = event.id;
  }

  const dictionary = { events, eVars, props };
  const byReportSuite = {};
  for (const { rowNumber, values } of tables.suites.rows) {
    const rsid = values.RSID;
    byReportSuite[rsid] = {
      rsid,
      title: values.Title || "",
      description: values.Description || "",
      sourceRow: rowNumber,
      dictionary,
    };
  }

  return {
    source: path.basename(filePath),
    sheetNames: Object.keys(workbook),
    counts: {
      events: Object.keys(events).length,
      eVars: Object.keys(eVars).length,
      props: Object.keys(props).length,
      dataLayerPushRows: tables.pushes.rows.length,
      dataLayerPushReferences: tables.pushes.rows.filter(
        (row) => row.values.Reference
      ).length,
      reportSuites: Object.keys(byReportSuite).length,
    },
    headers: Object.fromEntries(
      Object.entries(tables).map(([key, table]) => [
        key,
        {
          row: table.header.rowNumber,
          literal: table.header.literal,
        },
      ])
    ),
    aliases,
    dataLayerPushes,
    byReportSuite,
  };
}

export function schemaForSuite(sdr, reportSuite) {
  const suite = sdr.byReportSuite?.[reportSuite];
  if (!suite) {
    throw new Error(
      `Report suite ${reportSuite} is not in SDR; available: ${Object.keys(
        sdr.byReportSuite || {}
      ).join(", ")}`
    );
  }
  return suite.dictionary;
}
