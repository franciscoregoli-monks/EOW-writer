import { readFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
import { parseFieldValue } from "./valueSemantics.mjs";

const STANDARD_EVENT = /^Event:\s*(.+?)\s*\((event\d+)\)\s*$/i;
const SCROLL_EVENT = /^Event\s+(\d+)\s*=\s*(.+)$/i;
const VIDEO_EVENT = /^Event\s*=\s*(Video.+)$/i;
const STANDARD_FIELD =
  /^(Prop|eVar)\s*(\d+)\s*\(([^)]+)\):\s*(.*)$/i;
const REMOVED_FIELD =
  /^(Prop|eVar)\s*(\d+)\s*\(([^)]+)\)\s+removed\s*$/i;
const SEQUENCE_FIELD =
  /^(Prop|eVar)\s*(\d+):\s*([^<"“”]+?)\s*(<[^>]+>|["“”].+["“”])\s*$/i;

function extractBalancedBlocks(xml, tagName) {
  const open = new RegExp(`<${tagName}(\\s[^>]*)?>`, "g");
  const close = `</${tagName}>`;
  const blocks = [];
  let match;
  while ((match = open.exec(xml)) !== null) {
    const start = open.lastIndex;
    const end = xml.indexOf(close, start);
    if (end === -1) break;
    blocks.push(xml.slice(start, end));
    open.lastIndex = end + close.length;
  }
  return blocks;
}

function decodeXml(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

export function extractSlideLines(xml) {
  const shapes = extractBalancedBlocks(xml, "p:sp")
    .map((shape, index) => ({
      shape,
      index,
      y: Number(
        shape.match(/<a:off\s+x="-?\d+"\s+y="(-?\d+)"/)?.[1] ||
          Number.MAX_SAFE_INTEGER
      ),
    }))
    .sort((a, b) => a.y - b.y || a.index - b.index);
  return shapes.flatMap(({ shape }) =>
    extractBalancedBlocks(shape, "a:p")
      .map((paragraph) => {
        const runs =
          paragraph.match(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g) || [];
        return decodeXml(
          runs
            .map((run) => run.replace(/<a:t[^>]*>|<\/a:t>/g, ""))
            .join("")
        ).trim();
      })
      .filter(Boolean)
  );
}

function fieldKey(type, number) {
  return /prop/i.test(type)
    ? `prop${Number(number)}`
    : `eVar${Number(number)}`;
}

function parseFields(lines, sequence = false) {
  const eVars = {};
  const props = {};
  const removedFields = [];
  for (const line of lines) {
    const removed = line.match(REMOVED_FIELD);
    if (removed) {
      const key = fieldKey(removed[1], removed[2]);
      const parsed = { kind: "removed", raw: line, friendlyName: removed[3] };
      (/prop/i.test(removed[1]) ? props : eVars)[key] = parsed;
      removedFields.push(key);
      continue;
    }
    const match = line.match(sequence ? SEQUENCE_FIELD : STANDARD_FIELD);
    if (!match) continue;
    const [, type, number, friendlyName, rawValue] = match;
    const key = fieldKey(type, number);
    const parsed = {
      ...parseFieldValue(rawValue),
      friendlyName: friendlyName.trim(),
    };
    (/prop/i.test(type) ? props : eVars)[key] = parsed;
  }
  return { eVars, props, removedFields };
}

function parseStandardSpec(lines, slide) {
  const eventIndex = lines.findIndex((line) => STANDARD_EVENT.test(line));
  if (eventIndex === -1) return null;
  const [, eventName, eventId] = lines[eventIndex].match(STANDARD_EVENT);
  const fields = parseFields(lines.slice(eventIndex + 1));
  return {
    slide,
    pageFamily: lines[0] || null,
    section: lines[1] || null,
    feature: lines[2] || null,
    eventName: eventName.trim(),
    eventId: eventId.toLowerCase(),
    interactionType: /video/i.test(lines[2] || "")
      ? "video"
      : /link/i.test(eventName)
        ? "link"
        : /cta/i.test(eventName)
          ? "cta"
          : "custom",
    ...fields,
  };
}

function parseSequenceSpec(lines, slide) {
  const scrollIndex = lines.findIndex((line) => SCROLL_EVENT.test(line));
  const videoIndex = lines.findIndex((line) => VIDEO_EVENT.test(line));
  if (scrollIndex === -1 && videoIndex === -1) return null;
  const isScroll = scrollIndex !== -1;
  const eventIndex = isScroll ? scrollIndex : videoIndex;
  const match = lines[eventIndex].match(isScroll ? SCROLL_EVENT : VIDEO_EVENT);
  const eventId = isScroll ? `event${Number(match[1])}` : null;
  const eventName = isScroll ? match[2].trim() : match[1].trim();
  return {
    slide,
    pageFamily: lines[0] || null,
    section: lines[1] || null,
    feature: eventName,
    eventName,
    eventId,
    interactionType: isScroll ? "scroll" : "video",
    ...parseFields(lines.slice(eventIndex + 1), true),
  };
}

function parsePush(lines, slide) {
  const rawPushCode = lines.join("\n");
  if (!/adobeDataLayer\.push\(/i.test(rawPushCode)) return null;
  const value = (field) =>
    rawPushCode.match(
      new RegExp(`${field}\\s*:\\s*(?:["“”']([^"“”']+)["“”']|<([^>]+)>)`, "i")
    );
  const componentMatch = value("component");
  const eventMatch = value("event");
  const component = componentMatch?.[1] || componentMatch?.[2] || null;
  return {
    slide,
    section: lines[1] || null,
    feature: (lines[2] || "")
      .replace(/\s*\|\s*datalayer\s+push\s*$/i, "")
      .trim(),
    eventName: eventMatch?.[1] || eventMatch?.[2] || null,
    component,
    rawPushCode,
  };
}

function key(...values) {
  return values.map((value) => String(value || "").trim().toLowerCase()).join("::");
}

function candidateSelectors(component) {
  if (!component) return [];
  const normalized = component.toLowerCase().replace(/[^a-z0-9.-]/g, "");
  return [
    `[data-component="${component}"]`,
    `[data-analytics-component="${component}"]`,
    `#${component}`,
    `[data-testid="${component}"]`,
    `[data-component^="${normalized}-"]`,
  ];
}

function targetMetadata(spec, push) {
  const feature = spec.feature || "";
  const lower = feature.toLowerCase();
  return {
    component: push?.component || null,
    pageSection: spec.section,
    label: feature,
    variant: lower.includes("large")
      ? "large"
      : lower.includes("small")
        ? "small"
        : null,
    mediaType: lower.includes("video")
      ? "video"
      : lower.includes("image")
        ? "image"
        : lower.includes("interactive")
          ? "interactive"
          : lower.includes("download")
            ? "download"
            : null,
    controlType: spec.interactionType,
  };
}

export async function loadPptxPlan({ filePath, url }) {
  if (!url) throw new Error("--url is required for a PPTX plan");
  const files = unzipSync(new Uint8Array(await readFile(filePath)));
  const decoder = new TextDecoder();
  const slideFiles = Object.keys(files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort(
      (a, b) =>
        Number(a.match(/slide(\d+)/)[1]) - Number(b.match(/slide(\d+)/)[1])
    );
  const specs = [];
  const pushes = [];
  for (const name of slideFiles) {
    const slide = Number(name.match(/slide(\d+)/)[1]);
    const lines = extractSlideLines(decoder.decode(files[name]));
    const push = parsePush(lines, slide);
    if (push) {
      pushes.push(push);
      continue;
    }
    const spec =
      parseStandardSpec(lines, slide) || parseSequenceSpec(lines, slide);
    if (spec) specs.push(spec);
  }

  const exactPushes = new Map(
    pushes.map((push) => [
      key(push.section, push.feature, push.eventName),
      push,
    ])
  );
  const fallbackPushes = new Map();
  for (const push of pushes) {
    const fallback = key(push.section, push.feature);
    if (!fallbackPushes.has(fallback)) fallbackPushes.set(fallback, push);
  }

  const cases = specs.map((spec) => {
    const exact = exactPushes.get(key(spec.section, spec.feature, spec.eventName));
    const push = exact || fallbackPushes.get(key(spec.section, spec.feature));
    const parserWarnings = [];
    if (!push) {
      parserWarnings.push({
        code: "UNMATCHED_PUSH_SLIDE",
        message: `Slide ${spec.slide} has no matching DataLayer Push slide`,
      });
    } else if (!exact && push.eventName !== spec.eventName) {
      parserWarnings.push({
        code: "PUSH_EVENT_MISMATCH",
        message: `Slide ${spec.slide} says "${spec.eventName}", matched push says "${push.eventName}"`,
      });
    }
    return {
      id: `slide-${spec.slide}`,
      name: `${spec.section} — ${spec.feature}`,
      slide: spec.slide,
      section: spec.section,
      feature: spec.feature,
      url,
      action:
        spec.interactionType === "scroll" ? "scroll" : "click",
      interactionType: spec.interactionType,
      planEvent: { id: spec.eventId, name: spec.eventName },
      expected: { eVars: spec.eVars, props: spec.props },
      removedFields: spec.removedFields,
      domHints: candidateSelectors(push?.component),
      target: targetMetadata(spec, push),
      source: {
        slide: spec.slide,
        pushSlide: push?.slide || null,
        pushMatched: Boolean(push),
        rawPushCode: push?.rawPushCode || null,
        parserWarnings,
      },
    };
  });

  return {
    name: path.basename(filePath),
    adobe: { dataLayer: "adobeDataLayer" },
    cases,
    stats: {
      totalItems: cases.length,
      matched: cases.filter((item) => item.source.pushMatched).length,
      unmatched: cases.filter((item) => !item.source.pushMatched).length,
      unmatchedSlides: cases
        .filter((item) => !item.source.pushMatched)
        .map((item) => item.slide),
      specSlides: specs.length,
      pushSlides: pushes.length,
    },
  };
}
