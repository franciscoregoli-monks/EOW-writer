import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  isPlanDefect,
  resolveCanonicalEvent,
} from "../src/canonicalEvent.mjs";

const sdr = JSON.parse(
  await readFile(new URL("../knowledge/wws-sdr.json", import.meta.url), "utf8")
);
const suite = "amznsproduction";

test("resolves a valid link through SDR", () => {
  const result = resolveCanonicalEvent(
    {
      id: "link",
      interactionType: "link",
      planEvent: { id: "event2", name: "Link Clicks" },
    },
    sdr,
    suite
  );
  assert.equal(result.eventId, "event2");
  assert.equal(result.event.canonicalName, "Link Clicks");
  assert.equal(isPlanDefect(result), false);
});

test("flags CTA claim on a video and resolves Video Start", () => {
  const result = resolveCanonicalEvent(
    {
      id: "video",
      interactionType: "video",
      planEvent: { id: "event1", name: "CTA Clicks" },
    },
    sdr,
    suite
  );
  assert.equal(result.eventId, "event13");
  assert.equal(result.family, "video");
  assert.equal(isPlanDefect(result), true);
});

test("flags Energy plan scroll ID and uses SDR scroll event", () => {
  const result = resolveCanonicalEvent(
    {
      id: "scroll",
      interactionType: "scroll",
      planEvent: { id: "event15", name: "Scroll Reach 25%" },
    },
    sdr,
    suite
  );
  assert.equal(result.eventId, "event5");
  assert.equal(result.family, "scroll");
  assert.equal(isPlanDefect(result), true);
  assert.ok(
    result.findings.some(
      (finding) => finding.code === "PLAN_EVENT_ID_NAME_MISMATCH"
    )
  );
});

test("does not silently accept an unknown plan event name", () => {
  const result = resolveCanonicalEvent(
    {
      id: "unknown-name",
      interactionType: "cta",
      planEvent: { id: "event1", name: "Mystery Conversion" },
    },
    sdr,
    suite
  );
  assert.equal(result.eventId, "event1");
  assert.equal(isPlanDefect(result), true);
  assert.ok(
    result.findings.some(
      (finding) => finding.code === "UNKNOWN_PLAN_EVENT_NAME"
    )
  );
});

test("flags a missing Adobe event ID while resolving video from SDR context", () => {
  const result = resolveCanonicalEvent(
    {
      id: "video-no-id",
      interactionType: "video",
      planEvent: { id: null, name: "Video Start" },
    },
    sdr,
    suite
  );
  assert.equal(result.eventId, "event13");
  assert.equal(isPlanDefect(result), true);
  assert.ok(
    result.findings.some(
      (finding) => finding.code === "MISSING_PLAN_EVENT_ID"
    )
  );
});

test("uses scroll milestone context when the plan mislabeled 100% as video complete", () => {
  const result = resolveCanonicalEvent(
    {
      id: "scroll-100",
      interactionType: "scroll",
      milestone: "100",
      planEvent: { id: "event14", name: "Video complete" },
    },
    sdr,
    suite
  );
  assert.equal(result.eventId, "event8");
  assert.equal(isPlanDefect(result), true);
});

test("Energy executable fixture preserves planned CTA semantics", async () => {
  const plan = JSON.parse(
    await readFile(
      new URL("../examples/wws-energy.plan.json", import.meta.url),
      "utf8"
    )
  );
  const imageCards = plan.cases.filter((item) =>
    /IMAGE-(LARGE|SMALL)$/.test(item.id)
  );
  assert.equal(imageCards.length, 2);
  for (const item of imageCards) {
    assert.equal(item.interactionType, "cta");
    assert.equal(item.planEvent.id, "event1");
    assert.match(item.expected.eVars.eVar36, /^<C40>$/);
  }
});
