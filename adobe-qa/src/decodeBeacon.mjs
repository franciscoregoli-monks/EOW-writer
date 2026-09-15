const EVAR = /^v(\d+)$/;
const PROP = /^c(\d+)$/;

export function decodeBeaconUrl(url) {
  const parsed = new URL(url);
  const params = parsed.searchParams;
  const path = parsed.pathname;
  const suiteMatch = path.match(/\/b\/ss\/([^/]+)\//);

  const eVars = {};
  const props = {};
  for (const [key, value] of params.entries()) {
    const eVar = key.match(EVAR);
    const prop = key.match(PROP);
    if (eVar) eVars[`eVar${eVar[1]}`] = value;
    if (prop) props[`prop${prop[1]}`] = value;
  }

  return {
    url,
    host: parsed.host,
    reportSuite: suiteMatch ? suiteMatch[1] : null,
    pageName: params.get("pageName"),
    pageUrl: params.get("g"),
    channel: params.get("ch"),
    events: params.get("events"),
    products: params.get("products"),
    linkType: params.get("pe"),
    linkName: params.get("pev2"),
    hitType: params.get("pe") ? "link" : "pageview",
    campaign: params.get("v0") ?? params.get("campaign"),
    eVars,
    props,
    raw: Object.fromEntries(params.entries()),
  };
}

export function isAdobeBeacon(url) {
  return /\/b\/ss\//.test(url) || /\/ee\//.test(url);
}

export function flattenBeacon(decoded) {
  return {
    reportSuite: decoded.reportSuite,
    pageName: decoded.pageName,
    pageUrl: decoded.pageUrl,
    channel: decoded.channel,
    events: decoded.events,
    products: decoded.products,
    hitType: decoded.hitType,
    linkName: decoded.linkName,
    campaign: decoded.campaign,
    ...decoded.eVars,
    ...decoded.props,
  };
}
