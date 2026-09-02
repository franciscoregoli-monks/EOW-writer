import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { strToU8, zipSync } from "fflate";
import { loadPptxPlan } from "../src/pptxPlanParser.mjs";

function slide(lines) {
  const shapes = lines
    .map(
      (line, index) =>
        `<p:sp><p:spPr><a:xfrm><a:off x="0" y="${index * 100}"/></a:xfrm></p:spPr>` +
        `<p:txBody><a:p><a:r><a:t>${line
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")}</a:t></a:r></a:p></p:txBody></p:sp>`
    )
    .join("");
  return (
    '<?xml version="1.0"?>' +
    '<p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree>' +
    shapes +
    "</p:spTree></p:cSld></p:sld>"
  );
}

test("PPTX parser pairs spec/push slides and keeps sequence cases visible", async () => {
  const files = {
    "ppt/slides/slide1.xml": strToU8(
      slide([
        "Energy Spotlight - Analytics",
        "Energy Spotlight | C-40",
        "Fact Cards - Image Large",
        "Event: CTA Clicks (event1)",
        'eVar3 (Page name): "Energy Spotlight"',
        "eVar15 (Page URL): <Page URL>",
      ])
    ),
    "ppt/slides/slide2.xml": strToU8(
      slide([
        "Energy Spotlight - Analytics",
        "Energy Spotlight | C-40",
        "Fact Cards - Image Large | DataLayer Push",
        "var adobeDataLayer = adobeDataLayer || [];",
        "adobeDataLayer.push({",
        'event: "CTA Clicks",',
        'linkTitle: "8M",',
        'destinationLink: "https://example.com/eu",',
        "component: <C40>",
        "});",
      ])
    ),
    "ppt/slides/slide3.xml": strToU8(
      slide([
        "Energy Spotlight - Analytics",
        "Scroll",
        "Every time the user reaches 25% scroll rate",
        "Event 15= Scroll Reach 25%",
        "eVar1: Domain <website domain>",
      ])
    ),
    "ppt/slides/slide4.xml": strToU8(
      slide([
        "TCP - Analytics",
        "Video",
        "Event = Video Start",
        "eVar13: Video Name <video name>",
      ])
    ),
  };
  const directory = await mkdtemp(path.join(os.tmpdir(), "pptx-plan-"));
  const filePath = path.join(directory, "plan.pptx");
  await writeFile(filePath, zipSync(files));

  const plan = await loadPptxPlan({
    filePath,
    url: "https://example.com",
  });
  assert.deepEqual(plan.stats, {
    totalItems: 3,
    matched: 1,
    unmatched: 2,
    unmatchedSlides: [3, 4],
    specSlides: 3,
    pushSlides: 1,
  });
  const click = plan.cases[0];
  assert.equal(click.planEvent.id, "event1");
  assert.equal(click.expected.eVars.eVar3.value, "Energy Spotlight");
  assert.equal(click.expected.eVars.eVar15.kind, "dynamic");
  assert.equal(click.target.component, "C40");
  assert.equal(click.target.variant, "large");
  assert.equal(click.target.mediaType, "image");
  assert.equal(click.target.dataTitle, "8M");
  assert.equal(click.target.href, "https://example.com/eu");

  assert.equal(plan.cases[1].interactionType, "scroll");
  assert.equal(plan.cases[1].planEvent.id, "event15");
  assert.equal(plan.cases[1].milestone, "25");
  assert.equal(plan.cases[2].interactionType, "video");
  assert.equal(plan.cases[2].planEvent.id, null);
});
