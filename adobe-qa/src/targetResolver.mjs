async function explicitTarget(page, selector, source, wanted = {}) {
  if (!selector) return null;
  let element;
  try {
    element = await page.$(selector);
  } catch {
    return null;
  }
  if (!element) return null;
  const interactive = await element.evaluate((node) =>
    node.matches('a, button, [role="button"], input[type="submit"]')
  );
  if (!interactive) {
    const descendants = await element.$$(
      'a, button, [role="button"], input[type="submit"]'
    );
    if (!descendants.length) {
      await element.dispose();
      return null;
    }
    let selected = descendants.length === 1 ? descendants[0] : null;
    if (!selected && (wanted.label || wanted.href)) {
      for (const candidate of descendants) {
        const matches = await candidate.evaluate((node, target) => {
          const norm = (value) => String(value || "").trim().toLowerCase();
          const label = norm(
            node.getAttribute("aria-label") || node.textContent || node.title
          );
          const href = norm(node.href || node.getAttribute("href"));
          return (
            (target.label && label.includes(norm(target.label))) ||
            (target.href && href === norm(target.href))
          );
        }, wanted);
        if (matches) {
          selected = candidate;
          break;
        }
      }
    }
    for (const candidate of descendants) {
      if (candidate !== selected) await candidate.dispose();
    }
    await element.dispose();
    if (!selected) return null;
    element = selected;
  }
  const observed = await element.evaluate((node) => {
    const card = node.closest('[data-component="article-card"]');
    const isVideo =
      node.classList.contains("js-video-cta") ||
      card?.classList.contains("has-video");
    return {
      tag: node.tagName,
      href: node.href || node.getAttribute("href") || null,
      observedInteractionType: isVideo
        ? "video"
        : node.classList.contains("dashboard-cta")
          ? "cta"
          : node.matches("a[href]")
            ? "link"
            : "cta",
    };
  });
  return {
    element,
    match: {
      source,
      selector,
      confidence: "confirmed",
      resolvedToClickableDescendant: !interactive,
      ...observed,
    },
  };
}

function normalized(value) {
  return String(value || "").trim().toLowerCase();
}

export async function resolveTarget(page, testCase) {
  const target = testCase.target || {};
  const explicit = await explicitTarget(
    page,
    testCase.selector,
    "selector",
    target
  );
  if (explicit) return explicit;

  for (const hint of testCase.domHints || []) {
    const hinted = await explicitTarget(page, hint, "domHint", target);
    if (hinted) return hinted;
  }

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
        components.find((value) => {
          const expected = norm(wanted.component).replace(/[^a-z0-9]/g, "");
          const actual = norm(value).replace(/[^a-z0-9]/g, "");
          return expected && actual.startsWith(expected);
        }) ||
        components[0] ||
        "";
      const section =
        sections.find((value) => norm(value) === norm(wanted.pageSection)) ||
        sections[0] ||
        "";
      const variant = card?.getAttribute("data-variant") || "";
      const isVideo =
        node.classList.contains("js-video-cta") ||
        card?.classList.contains("has-video");
      const className = String(node.className || "");
      const mediaType = isVideo
        ? "video"
        : card?.classList.contains("is-medium-light")
          ? "interactive"
          : node.hasAttribute("data-download") ||
              node.closest("[data-download]")
            ? "download"
            : card?.querySelector("img")
              ? "image"
              : "";
      const observedInteractionType = isVideo
        ? "video"
        : node.classList.contains("dashboard-cta")
          ? "cta"
          : node.matches("a[href]")
            ? "link"
            : "cta";

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
      if (wanted.component) {
        const expected = norm(wanted.component).replace(/[^a-z0-9]/g, "");
        const actual = norm(component).replace(/[^a-z0-9]/g, "");
        if (actual === expected) {
          score += 3;
          reasons.push("component");
        } else if (expected && actual.startsWith(expected)) {
          score += 2;
          reasons.push("componentPrefix");
        } else {
          score -= 4;
          reasons.push("componentMismatch");
        }
      }
      if (wanted.pageSection && norm(section) === norm(wanted.pageSection)) {
        score += 2;
        reasons.push("pageSection");
      }
      if (wanted.variant && norm(variant) === norm(wanted.variant)) {
        score += 1;
        reasons.push("variant");
      }
      if (wanted.mediaType && norm(mediaType) === norm(wanted.mediaType)) {
        score += 2;
        reasons.push("mediaType");
      }
      if (
        wanted.controlType === "link" &&
        className.includes("card-link")
      ) {
        score += 2;
        reasons.push("linkControl");
      }
      if (
        wanted.controlType === "cta" &&
        className.includes("primary-cta")
      ) {
        score += 2;
        reasons.push("ctaControl");
      }
      if (node.matches('a, button, [role="button"], input[type="submit"]')) {
        score += 0.5;
      }
      return {
        score,
        reasons,
        text,
        href,
        component,
        section,
        variant,
        mediaType,
        observedInteractionType,
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
