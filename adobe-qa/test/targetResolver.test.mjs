import assert from "node:assert/strict";
import test from "node:test";
import puppeteer from "puppeteer-core";
import { resolveTarget } from "../src/targetResolver.mjs";

test("domHint containers resolve to the intended clickable descendant", async () => {
  const browser = await puppeteer.launch({
    executablePath:
      process.env.CHROME_PATH || "/usr/bin/google-chrome-stable",
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <section data-component="HomeCtaCard">
        <button aria-label="Other action">Other</button>
        <button aria-label="Download Report">Download</button>
      </section>
      <a href="https://example.com/destination">External story</a>
      <button aria-label="Popular Downloads">Popular Downloads</button>
      <section data-component="c40-dashboard" data-section-label="optimize">
        <a class="dashboard-cta" data-download href="/report.pdf">1.14</a>
      </section>
      <section data-component="c40-dashboard" data-section-label="generate">
        <a class="dashboard-cta" href="/generator">Generator</a>
      </section>
      <section data-component="c43-highlight-slider">
        <a class="primary-cta" href="/overview">Learn more</a>
        <div data-component="slider-card" data-title="7.9M">
          <a class="card-link" href="/us">7.9M</a>
        </div>
        <div data-component="slider-card" data-title="8M">
          <a class="card-link" href="/eu">8M</a>
        </div>
      </section>
    `);
    const resolved = await resolveTarget(page, {
      domHints: ['[data-component="HomeCtaCard"]'],
      target: { component: "HomeCtaCard", label: "Download Report" },
    });
    assert.ok(resolved);
    assert.equal(resolved.match.source, "domHint");
    assert.equal(resolved.match.resolvedToClickableDescendant, true);
    assert.equal(
      await resolved.element.evaluate((element) =>
        element.getAttribute("aria-label")
      ),
      "Download Report"
    );
    await resolved.element.dispose();

    const hrefResolved = await resolveTarget(page, {
      target: { href: "https://example.com/destination" },
    });
    assert.ok(hrefResolved);
    assert.equal(hrefResolved.match.source, "secondaryLocators");
    assert.equal(hrefResolved.match.confidence, "high");
    await hrefResolved.element.dispose();

    const downloadResolved = await resolveTarget(page, {
      target: {
        component: "C40",
        label: "Download",
        mediaType: "download",
        controlType: "cta",
      },
    });
    assert.ok(downloadResolved);
    assert.equal(
      await downloadResolved.element.evaluate((element) =>
        element.getAttribute("href")
      ),
      "/report.pdf"
    );
    await downloadResolved.element.dispose();

    const sectionTarget = await resolveTarget(page, {
      id: "section-target",
      domHints: ['[data-component^="c40-"]'],
      target: {
        component: "C40",
        pageSection: "generate",
        controlType: "cta",
      },
    });
    assert.ok(sectionTarget);
    assert.equal(sectionTarget.match.source, "domHint");
    assert.equal(
      await sectionTarget.element.evaluate((element) => element.getAttribute("href")),
      "/generator"
    );
    await sectionTarget.element.dispose();

    const ambiguousSection = await resolveTarget(page, {
      id: "ambiguous-section",
      domHints: ['[data-component^="c40-"]'],
      target: { component: "C40", controlType: "cta" },
    });
    assert.equal(ambiguousSection, null);

    const sliderCta = await resolveTarget(page, {
      id: "slider-cta",
      domHints: ['[data-component^="c43-"]'],
      target: { component: "C43", controlType: "cta" },
    });
    assert.ok(sliderCta);
    assert.equal(sliderCta.match.source, "domHint");
    assert.equal(
      await sliderCta.element.evaluate((element) => element.getAttribute("href")),
      "/overview"
    );
    await sliderCta.element.dispose();

    const missingCardCta = await resolveTarget(page, {
      id: "missing-card-cta",
      domHints: ['[data-component^="c43-"]'],
      target: {
        component: "C43",
        controlType: "cta",
        scope: "slider-card",
      },
    });
    assert.equal(missingCardCta, null);

    const sliderLink = await resolveTarget(page, {
      id: "slider-link",
      domHints: ['[data-component^="c43-"]'],
      target: { component: "C43", controlType: "link", dataTitle: "8M" },
    });
    assert.ok(sliderLink);
    assert.equal(sliderLink.match.source, "domHint");
    assert.equal(
      await sliderLink.element.evaluate((element) => element.getAttribute("href")),
      "/eu"
    );
    await sliderLink.element.dispose();

    const ambiguousSliderLink = await resolveTarget(page, {
      id: "ambiguous-slider-link",
      domHints: ['[data-component^="c43-"]'],
      target: { component: "C43", controlType: "link" },
    });
    assert.equal(ambiguousSliderLink, null);

    await assert.rejects(
      resolveTarget(page, {
        id: "missing-teaser",
        domHints: ['[data-component^="c38.1-"]'],
        target: { component: "C38.1", controlType: "link" },
      }),
      (error) => error.code === "COMPONENT_NOT_PRESENT"
    );
  } finally {
    await browser.close();
  }
});
