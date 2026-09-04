import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { createRunServer } from "../src/server.mjs";

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for job state");
}

test("simultaneous run requests use one runner and queue the second", async (t) => {
  let active = 0;
  let maximumActive = 0;
  const releases = [];
  const run = async ({ name }) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => releases.push(resolve));
    active -= 1;
    return { report: { plan: name } };
  };

  const server = createRunServer({ run });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const post = (name) =>
    fetch(`${baseUrl}/api/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    }).then((response) => response.json());

  const [firstResponse, secondResponse] = await Promise.all([
    post("first"),
    post("second"),
  ]);
  const firstId = firstResponse.run.id;
  const secondId = secondResponse.run.id;
  const getRun = async (id) => {
    const response = await fetch(`${baseUrl}/api/runs/${id}`);
    return (await response.json()).run;
  };

  await waitFor(async () => {
    const [first, second] = await Promise.all([
      getRun(firstId),
      getRun(secondId),
    ]);
    return first.status === "running" && second.status === "queued";
  });
  assert.equal(maximumActive, 1);

  releases.shift()();
  await waitFor(async () => (await getRun(secondId)).status === "running");
  assert.equal(maximumActive, 1);

  releases.shift()();
  const [first, second] = await Promise.all([
    waitFor(async () => {
      const runState = await getRun(firstId);
      return runState.status === "complete" && runState;
    }),
    waitFor(async () => {
      const runState = await getRun(secondId);
      return runState.status === "complete" && runState;
    }),
  ]);

  assert.deepEqual(first.report, { plan: "first" });
  assert.deepEqual(second.report, { plan: "second" });
});
