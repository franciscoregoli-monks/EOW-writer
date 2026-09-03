import { randomUUID } from "node:crypto";
import { executeQa } from "./runQa.mjs";

const STATE_KEY = Symbol.for("adobe-qa.job-queue");
const MAX_JOB_AGE_MS = 24 * 60 * 60 * 1000;

function state() {
  if (!globalThis[STATE_KEY]) {
    globalThis[STATE_KEY] = {
      jobs: new Map(),
      tail: Promise.resolve(),
    };
  }
  return globalThis[STATE_KEY];
}

function pruneJobs(queue) {
  const cutoff = Date.now() - MAX_JOB_AGE_MS;
  for (const [id, job] of queue.jobs) {
    if (
      ["complete", "error"].includes(job.status) &&
      Date.parse(job.completedAt) < cutoff
    ) {
      queue.jobs.delete(id);
    }
  }
}

export function enqueueQa(
  input,
  cleanup = async () => {},
  execute = executeQa
) {
  const queue = state();
  pruneJobs(queue);
  const id = randomUUID();
  const job = {
    id,
    status: "queued",
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    report: null,
    error: null,
  };
  queue.jobs.set(id, job);

  queue.tail = queue.tail
    .catch(() => {})
    .then(async () => {
      job.status = "running";
      job.startedAt = new Date().toISOString();
      try {
        job.report = await execute(input);
        job.status = "complete";
      } catch (error) {
        job.status = "error";
        job.error =
          error instanceof Error ? error.message : "The QA run failed";
      } finally {
        job.completedAt = new Date().toISOString();
        await cleanup();
      }
    });

  return job;
}

export function getQaJob(id) {
  const queue = state();
  pruneJobs(queue);
  return queue.jobs.get(id) || null;
}
