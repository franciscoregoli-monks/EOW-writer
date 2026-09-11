async function explicitTarget(page, selector, source, wanted = {}) {
  if (!selector) return null;
  let element;
  try {
    const matches = await page.$$(selector);
    if (matches.length === 1) {
      [element] = matches;
    } else if (matches.length > 1 && wanted.pageSection) {
      const sectionMatches = [];
      for (const candidate of matches) {
        const matchesSection = await candidate.evaluate((node, pageSection) => {
          const norm = (value) => String(value || "").trim().toLowerCase();
          return (
            norm(node.getAttribute("data-section-label")) === norm(pageSection) ||
            norm(node.id) === norm(pageSection)
          );
        }, wanted.pageSection);
        if (matchesSection) sectionMatches.push(candidate);
      }
      if (sectionMatches.length === 1) [element] = sectionMatches;
    }
    for (const candidate of matches) {
      if (candidate !== element) await candidate.dispose();
    }
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
    if (!selected && (wanted.label || wanted.href || wanted.dataTitle)) {
      for (const candidate of descendants) {
        const matches = await candidate.evaluate((node, target) => {
          const norm = (value) => String(value || "").trim().toLowerCase();
          const label = norm(
            node.getAttribute("aria-label") || node.textContent || node.title
          );
          const href = norm(node.href || node.getAttribute("href"));
          const dataTitle = norm(
            node.closest('[data-component="slider-card"]')?.getAttribute(
              "data-title"
            )
          );
          return (
            (target.href && href === norm(target.href)) ||
            (target.dataTitle && dataTitle === norm(target.dataTitle)) ||
            (target.label && label.includes(norm(target.label)))
          );
        }, wanted);
        if (matches) {
          selected = candidate;
          break;
        }
      }
    }
    if (!selected && wanted.controlType) {
      const matchingControl = [];
      for (const candidate of descendants) {
        const matches = await candidate.evaluate((node, controlType) => {
          const inRequestedScope =
            !controlType.scope ||
            (controlType.scope === "slider-card" &&
              Boolean(node.closest('[data-component="slider-card"]')));
          if (!inRequestedScope) return false;
          if (controlType.type === "link") {
            return node.classList.contains("card-link");
          }
          if (controlType.type === "cta") {
            return (
              node.classList.contains("primary-cta") ||
              node.classList.contains("dashboard-cta")
            );
          }
          return false;
        }, { type: wanted.controlType, scope: wanted.scope });
        if (matches) matchingControl.push(candidate);
      }
      // Ambiguous controls are deliberately left unresolved. Clicking the
      // first plausible element produces evidence for the wrong interaction.
      if (matchingControl.length === 1) selected = matchingControl[0];
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

async function plannedComponentExists(page, component) {
  if (!component) return true;
  const expected = normalized(component).replace(/[^a-z0-9]/g, "");
  return page.$$eval(
    "[data-component]",
    (elements, wanted) =>
      elements.some((element) => {
        const actual = String(element.getAttribute("data-component") || "")
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "");
        return actual === wanted || actual.startsWith(wanted);
      }),
    expected
  );
}

async function plannedComponentClickableCount(page, component) {
  const expected = normalized(component).replace(/[^a-z0-9]/g, "");
  return page.$$eval(
    "[data-component]",
    (elements, wanted) => {
      const roots = elements.filter((element) => {
        const actual = String(element.getAttribute("data-component") || "")
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "");
        return actual === wanted || actual.startsWith(wanted);
      });
      return new Set(
        roots.flatMap((root) => [
          ...root.querySelectorAll(
            'a, button, [role="button"], input[type="submit"]'
          ),
        ])
      ).size;
    },
    expected
  );
}

async function markProbeCandidates(page, testCase) {
  const target = testCase.target || {};
  return page.$$eval(
    "[data-component]",
    (elements, wanted) => {
      const norm = (value) =>
        String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
      document
        .querySelectorAll("[data-adobe-qa-probe-index]")
        .forEach((element) =>
          element.removeAttribute("data-adobe-qa-probe-index")
        );
      const expected = norm(wanted.component);
      const roots = elements.filter((element) => {
        const actual = norm(element.getAttribute("data-component"));
        return actual === expected || (expected && actual.startsWith(expected));
      });
      const all = [];
      const seen = new Set();
      const add = (element) => {
        if (!seen.has(element)) {
          seen.add(element);
          all.push(element);
        }
      };
      for (const root of roots) {
        if (root.matches('a, button, [role="button"], input[type="submit"]')) {
          add(root);
        }
        root
          .querySelectorAll('a, button, [role="button"], input[type="submit"]')
          .forEach(add);
      }
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden"
        );
      };
      const scoped = wanted.scope === "slider-card"
        ? all.filter((element) =>
            Boolean(element.closest('[data-component="slider-card"]'))
          )
        : all;
      const typed = scoped.filter((element) => {
        if (wanted.controlType === "link") {
          return element.classList.contains("card-link");
        }
        if (wanted.controlType === "cta") {
          return (
            element.classList.contains("primary-cta") ||
            element.classList.contains("dashboard-cta") ||
            element.classList.contains("article-cta") ||
            element.classList.contains("qa-toggle-button")
          );
        }
        return true;
      });
      const byControl = typed.length ? typed : scoped.filter(visible);
      const candidates = byControl.filter((element) => {
        const card = element.closest(".dashboard-card");
        const cardComponent = card?.getAttribute("data-component") || "";
        const variant = card?.getAttribute("data-variant") || "";
        const href = element.href || element.getAttribute("href") || "";
        if (wanted.variant && variant !== wanted.variant) return false;
        if (wanted.mediaType === "image") {
          return (
            cardComponent === "article-card" &&
            !card?.classList.contains("has-video")
          );
        }
        if (wanted.mediaType === "video") {
          return Boolean(card?.classList.contains("has-video"));
        }
        if (wanted.mediaType === "download") {
          return (
            element.hasAttribute("data-download") ||
            Boolean(element.closest("[data-download]")) ||
            /\.pdf(?:$|[?#])/i.test(href)
          );
        }
        if (wanted.mediaType === "interactive") {
          return ["infographic-card", "qa-card"].includes(cardComponent);
        }
        return true;
      });
      candidates.forEach((element, index) =>
        element.setAttribute("data-adobe-qa-probe-index", String(index))
      );
      return candidates.map((element, index) => {
        const sliderCard = element.closest('[data-component="slider-card"]');
        const dashboardCard = element.closest(".dashboard-card");
        const dataTitle = sliderCard?.getAttribute("data-title") || null;
        const href = element.href || element.getAttribute("href") || null;
        const childHref =
          dashboardCard?.querySelector("a[href]")?.href || null;
        const ariaLabel = element.getAttribute("aria-label") || null;
        const identity = dataTitle
          ? { type: "data-title", value: dataTitle }
          : href
            ? { type: "href", value: href }
            : childHref
              ? { type: "href", value: childHref }
              : ariaLabel
                ? { type: "aria-label", value: ariaLabel }
                : null;
        return {
          index,
          identity,
          href,
          ariaLabel,
          dataTitle,
        };
      });
    },
    {
      component: target.component,
      controlType: target.controlType,
      scope: target.scope,
      variant: target.variant,
      mediaType: target.mediaType,
    }
  );
}

export async function findProbeCandidates(page, testCase) {
  return markProbeCandidates(page, testCase);
}

export async function countProbeCandidates(page, testCase) {
  return (await markProbeCandidates(page, testCase)).length;
}

export async function resolveProbeCandidate(page, testCase, index) {
  const candidates = await markProbeCandidates(page, testCase);
  if (index < 0 || index >= candidates.length) return null;
  const element = await page.$(
    `[data-adobe-qa-probe-index="${index}"]`
  );
  if (!element) return null;
  const observed = await element.evaluate((node) => ({
    tag: node.tagName,
    href: node.href || node.getAttribute("href") || null,
    text: String(
      node.getAttribute("aria-label") || node.textContent || node.title || ""
    ).trim(),
  }));
  return {
    element,
    match: {
      source: "beaconEVar12Candidate",
      confidence: "probe",
      candidateIndex: index,
      candidateCount: candidates.length,
      identity: candidates[index].identity,
      ...observed,
    },
  };
}

export async function resolveTarget(page, testCase) {
  const target = testCase.target || {};
  if (target.planUnderspecified) {
    const clickableCount = await plannedComponentClickableCount(
      page,
      target.component
    );
    const error = new Error(
      `The plan identifies ${target.component}/${String(target.controlType || "control").toUpperCase()} ` +
        `but does not distinguish among the ${clickableCount} clickables in the component`
    );
    error.code = "PLAN_UNDERSPECIFIED_TARGET";
    throw error;
  }
  const explicit = await explicitTarget(
    page,
    testCase.selector,
    "selector",
    target
  );
  if (explicit) return explicit;

  let matchedHintContainer = false;
  for (const hint of testCase.domHints || []) {
    try {
      const hintedContainer = await page.$(hint);
      if (hintedContainer) {
        matchedHintContainer = true;
        await hintedContainer.dispose();
      }
    } catch {
      // Invalid hints are ignored by explicitTarget as well.
    }
    const hinted = await explicitTarget(page, hint, "domHint", target);
    if (hinted) return hinted;
  }

  if (!(await plannedComponentExists(page, target.component))) {
    const error = new Error(
      `${testCase.id}: component ${target.component} not present on page`
    );
    error.code = "COMPONENT_NOT_PRESENT";
    throw error;
  }

  // A confirmed component container with no unique instance match is an
  // ambiguity, not permission to click a lower-confidence element elsewhere.
  if (matchedHintContainer) return null;

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
