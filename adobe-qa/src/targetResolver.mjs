async function explicitTarget(page, selector, source) {
  if (!selector) return null;
  const element = await page.$(selector);
  if (!element) return null;
  return {
    element,
    match: { source, selector, confidence: "confirmed" },
  };
}

function normalized(value) {
  return String(value || "").trim().toLowerCase();
}

export async function resolveTarget(page, testCase) {
  const explicit = await explicitTarget(page, testCase.selector, "selector");
  if (explicit) return explicit;

  for (const hint of testCase.domHints || []) {
    const hinted = await explicitTarget(page, hint, "domHint");
    if (hinted) return hinted;
  }

  const target = testCase.target || {};
  const candidates = await page.$$(
    'a, button, [role="button"], [data-component="article-card"]'
  );
  let best = null;

  for (const element of candidates) {
    const result = await element.evaluate((node, wanted) => {
      const norm = (value) => String(value || "").trim().toLowerCase();
      const text = norm(
        node.getAttribute("aria-label") ||
          node.textContent ||
          node.getAttribute("title")
      );
      const href = node.href || node.getAttribute("href") || "";
      const card = node.closest('[data-component="article-card"]');
      const ancestors = [];
      let current = node;
      while (current) {
        ancestors.push(current);
        current = current.parentElement;
      }
      const components = ancestors
        .map((element) => element.getAttribute?.("data-component"))
        .filter(Boolean);
      const sections = ancestors
        .flatMap((element) => [
          element.getAttribute?.("data-section-label"),
          element.id,
        ])
        .filter(Boolean);
      const component =
        components.find((value) => norm(value) === norm(wanted.component)) ||
        components[0] ||
        "";
      const section =
        sections.find((value) => norm(value) === norm(wanted.pageSection)) ||
        sections[0] ||
        "";
      const variant = card?.getAttribute("data-variant") || "";

      let score = 0;
      const reasons = [];
      if (wanted.label && text.includes(norm(wanted.label))) {
        score += 5;
        reasons.push("label");
      }
      if (wanted.href && norm(href) === norm(wanted.href)) {
        score += 6;
        reasons.push("href");
      }
      if (wanted.component && norm(component) === norm(wanted.component)) {
        score += 3;
        reasons.push("component");
      }
      if (wanted.pageSection && norm(section) === norm(wanted.pageSection)) {
        score += 2;
        reasons.push("pageSection");
      }
      if (wanted.variant && norm(variant) === norm(wanted.variant)) {
        score += 1;
        reasons.push("variant");
      }
      return {
        score,
        reasons,
        text,
        href,
        component,
        section,
        variant,
        tag: node.tagName,
      };
    }, target);
    if (!best || result.score > best.result.score) best = { element, result };
  }

  if (!best || best.result.score < 3) {
    for (const element of candidates) await element.dispose();
    return null;
  }
  for (const element of candidates) {
    if (element !== best.element) await element.dispose();
  }
  return {
    element: best.element,
    match: {
      source: "secondaryLocators",
      confidence: best.result.score >= 6 ? "high" : "low",
      ...best.result,
      requested: Object.fromEntries(
        Object.entries(target).filter(([, value]) => normalized(value))
      ),
    },
  };
}
