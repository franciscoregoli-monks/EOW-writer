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
  } finally {
    await browser.close();
  }
});
