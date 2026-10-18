import assert from "node:assert/strict";
import test from "node:test";
import { enqueueQa, getQaJob } from "../src/jobQueue.mjs";

async function waitForCompletion(jobIds) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const jobs = jobIds.map(getQaJob);
    if (jobs.every((job) => ["complete", "error"].includes(job.status))) {
      return jobs;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Jobs did not complete");
}

test("QA jobs execute serially and retain their reports", async () => {
  let active = 0;
  let maximumActive = 0;
  const order = [];
  const cleaned = [];
  const execute = async ({ name }) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    order.push(`start:${name}`);
    await new Promise((resolve) => setTimeout(resolve, 15));
    order.push(`end:${name}`);
    active -= 1;
    return { plan: name };
  };

  const first = enqueueQa(
    { name: "first" },
    async () => cleaned.push("first"),
    execute
  );
  const second = enqueueQa(
    { name: "second" },
    async () => cleaned.push("second"),
    execute
  );
  const jobs = await waitForCompletion([first.id, second.id]);

  assert.equal(maximumActive, 1);
  assert.deepEqual(order, [
    "start:first",
    "end:first",
    "start:second",
    "end:second",
  ]);
  assert.deepEqual(
    jobs.map((job) => job.report),
    [{ plan: "first" }, { plan: "second" }]
  );
  assert.deepEqual(cleaned, ["first", "second"]);
});
