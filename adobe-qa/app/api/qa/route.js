import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import os from "node:os";
import path from "node:path";
import { executeQa } from "../../../src/runQa.mjs";

export const runtime = "nodejs";
export const maxDuration = 300;

function requiredText(form, key) {
  const value = String(form.get(key) || "").trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function assertPublicUrl(value, label) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`${label} must use http or https`);
  }
  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname.startsWith("127.") ||
    hostname.startsWith("10.") ||
    hostname.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    isIP(hostname)
  ) {
    throw new Error(`${label} must be a public URL`);
  }
  return url.toString();
}

async function saveUpload(form, key, directory, extension) {
  const file = form.get(key);
  if (!(file instanceof File) || file.size === 0) {
    throw new Error(`${key} is required`);
  }
  const destination = path.join(
    /* turbopackIgnore: true */ directory,
    `${key}.${extension}`
  );
  await writeFile(destination, Buffer.from(await file.arrayBuffer()));
  return destination;
}

export async function POST(request) {
  let directory;
  try {
    const form = await request.formData();
    const targetUrl = assertPublicUrl(requiredText(form, "url"), "url");
    const sourceType = requiredText(form, "sourceType");
    const reportSuite =
      String(form.get("reportSuite") || "").trim() || "amznsproduction";
    directory = await mkdtemp(path.join(os.tmpdir(), "adobe-qa-"));

    const input = {
      url: targetUrl,
      reportSuite,
      sdrPath: "knowledge/wws-sdr.json",
      dataLayerMapPath: "knowledge/datalayer-map.json",
    };

    if (sourceType === "pptx") {
      input.pptxPath = await saveUpload(form, "plan", directory, "pptx");
    } else if (sourceType === "json") {
      input.planPath = await saveUpload(form, "plan", directory, "json");
    } else if (sourceType === "csv") {
      input.planPath = await saveUpload(form, "plan", directory, "csv");
    } else if (sourceType === "sheet") {
      input.sheetUrl = assertPublicUrl(
        requiredText(form, "sheetUrl"),
        "sheetUrl"
      );
    } else if (sourceType === "sheet-csv") {
      input.eventsCsvPath = await saveUpload(
        form,
        "eventsCsv",
        directory,
        "csv"
      );
      input.pushesCsvPath = await saveUpload(
        form,
        "pushesCsv",
        directory,
        "csv"
      );
    } else {
      throw new Error(`Unsupported plan source: ${sourceType}`);
    }

    const report = await executeQa(input);
    return Response.json({ report });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "The QA run failed";
    const inputError =
      /required|must use|must be a public|unsupported plan source/i.test(
        message
      );
    return Response.json(
      { error: message },
      { status: inputError ? 400 : 500 }
    );
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true });
  }
}
