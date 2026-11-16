import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { createQaJobQueue } from "./jobQueue.mjs";
import { runQa } from "./runJob.mjs";

const MAX_BODY_BYTES = 1024 * 1024;

function sendJson(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error("Request body is too large");
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) return {};
  const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!input || Array.isArray(input) || typeof input !== "object") {
    throw new Error("Request body must be a JSON object");
  }
  return input;
}

function publicJob(job) {
  return {
    id: job.id,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    error: job.error,
    report: job.report,
  };
}

export function createRunServer({ run = runQa } = {}) {
  const jobs = createQaJobQueue({
    execute: async (input) => {
      const result = await run(input);
      return result?.report ?? result;
    },
  });

  return createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://localhost");

    if (url.pathname === "/api/runs") {
      if (request.method !== "POST") {
        sendJson(response, 405, { error: "Method not allowed" });
        return;
      }

      try {
        const input = await readJson(request);
        const job = jobs.enqueue(input);
        sendJson(response, 202, { run: publicJob(job) });
      } catch (error) {
        sendJson(response, 400, {
          error: error instanceof Error ? error.message : "Invalid request",
        });
      }
      return;
    }

    const match = url.pathname.match(/^\/api\/runs\/([^/]+)$/);
    if (match) {
      if (request.method !== "GET") {
        sendJson(response, 405, { error: "Method not allowed" });
        return;
      }

      const job = jobs.get(decodeURIComponent(match[1]));
      if (!job) {
        sendJson(response, 404, { error: "QA run not found" });
        return;
      }
      sendJson(response, 200, { run: publicJob(job) });
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  const server = createRunServer();
  server.listen(port, () => {
    console.log(`Adobe QA API listening on http://localhost:${port}`);
  });
}
