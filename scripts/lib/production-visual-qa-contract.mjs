export const CANONICAL_PRODUCTION_VISUAL_BASE_URL = "https://botbound.app";

function visualExpectation(route, page, states = []) {
  return Object.freeze({
    route,
    page,
    states: Object.freeze([...states].sort((left, right) => left.localeCompare(right))),
  });
}

export const PRODUCTION_VISUAL_MARKETING_EXPECTATIONS = Object.freeze([
  visualExpectation("/", "home"),
  visualExpectation("/features", "features"),
  visualExpectation("/pricing", "pricing"),
  visualExpectation("/compare", "compare"),
  visualExpectation("/solutions/support", "solutions", ["support"]),
  visualExpectation("/solutions/sales", "solutions", ["sales"]),
  visualExpectation("/for/everyday", "vertical", ["personal"]),
  visualExpectation("/for/home-services", "vertical", ["home-services"]),
  visualExpectation("/for/medical", "vertical", ["medical"]),
  visualExpectation("/for/legal", "vertical", ["legal"]),
  visualExpectation("/for/real-estate", "vertical", ["real-estate"]),
  visualExpectation("/for/insurance", "vertical", ["insurance"]),
  visualExpectation("/for/restaurants", "vertical", ["restaurants"]),
  visualExpectation("/for/sales", "vertical", ["sales"]),
  visualExpectation("/about", "about"),
  // These public legacy routes intentionally redirect to their current homes.
  visualExpectation("/blog", "changelog"),
  visualExpectation("/changelog", "changelog"),
  visualExpectation("/security", "trust-center", ["trust"]),
  visualExpectation("/trust", "trust-center", ["trust"]),
  visualExpectation("/trust/medical", "trust-pack", ["medical"]),
  visualExpectation("/trust/legal", "trust-pack", ["legal"]),
  visualExpectation("/trust/insurance", "trust-pack", ["insurance"]),
  visualExpectation("/trust/enterprise", "trust-pack", ["enterprise"]),
  visualExpectation("/support", "support"),
  visualExpectation("/contact", "contact"),
  visualExpectation("/privacy", "privacy"),
  visualExpectation("/terms", "terms"),
  visualExpectation("/developers", "developers"),
  visualExpectation("/get-started", "auth-portal", ["get-started"]),
  visualExpectation("/signin", "auth-portal", ["signin"]),
  visualExpectation("/signup", "auth-portal", ["signup"]),
  visualExpectation("/status", "trust-center", ["trust"]),
  visualExpectation("/404", "public-not-found", ["404"]),
  visualExpectation("/not-found", "public-not-found", ["not-found"]),
]);

export const PRODUCTION_VISUAL_AUTHENTICATED_EXPECTATIONS = Object.freeze([
  visualExpectation("/studio", "studio"),
  visualExpectation("/studio?create=1", "studio", ["create-dialog"]),
  visualExpectation("/templates", "templates"),
  visualExpectation("/knowledge", "knowledge"),
  visualExpectation("/connections", "connections"),
  visualExpectation("/connections/salesforce", "salesforce"),
  visualExpectation("/phone", "phone", ["primary-logs"]),
  visualExpectation("/phone?tab=setup#company-identity", "phone", [
    "primary-lines",
    "company-identity",
  ]),
  visualExpectation("/phone?tab=logs", "phone", ["primary-logs"]),
  visualExpectation("/phone?tab=outbound", "phone", ["primary-outbound", "secondary-dispatch"]),
  visualExpectation("/phone?tab=campaigns", "phone", ["primary-outbound", "secondary-campaigns"]),
  visualExpectation("/phone?tab=callbacks", "phone", ["primary-logs"]),
  visualExpectation("/calendar", "calendar", ["agenda"]),
  visualExpectation("/calendar?tab=availability", "calendar", ["availability"]),
  visualExpectation("/computer", "computer"),
  visualExpectation("/insights", "insights"),
  visualExpectation("/inbox", "inbox"),
  visualExpectation("/approvals", "approvals"),
  visualExpectation("/settings", "settings", ["account"]),
  visualExpectation("/settings/billing", "settings", ["billing"]),
  visualExpectation("/settings/team", "settings", ["team"]),
  visualExpectation("/settings/customization", "settings", ["customization"]),
  visualExpectation("/settings/compliance", "settings", ["compliance"]),
  visualExpectation("/settings/apps", "settings", ["apps"]),
  visualExpectation("/settings/apps/command", "settings", ["apps-command"]),
  visualExpectation("/settings/not-a-route", "authenticated-not-found", ["not-found"]),
  // /admin is the platform-admin console. The capture account is an ordinary
  // workspace, so each tab lands on the owner page that holds the same control.
  visualExpectation("/admin", "settings", ["account"]),
  visualExpectation("/admin?tab=subscription", "settings", ["billing"]),
  visualExpectation("/admin?tab=team", "settings", ["team"]),
  visualExpectation("/admin?tab=branding", "settings", ["customization"]),
  visualExpectation("/admin?tab=carrier", "phone", ["primary-lines"]),
]);

/** Mirrors settingsPathForAdminTab in src/lib/admin-access.ts; a test keeps them equal. */
export const ADMIN_TAB_OWNER_PAGES = new Map([
  ["subscription", "/settings/billing"],
  ["team", "/settings/team"],
  ["branding", "/settings/customization"],
  ["carrier", "/phone?tab=lines"],
  ["activity", "/settings/compliance"],
  ["dnc", "/settings/compliance"],
  ["audit", "/settings/compliance"],
  ["voices", "/knowledge?tab=voice"],
]);

export function adminTabOwnerPage(tab) {
  return ADMIN_TAB_OWNER_PAGES.get(tab ?? "") ?? "/settings";
}

export const PRODUCTION_VISUAL_COMPATIBILITY_EXPECTATIONS = Object.freeze([
  visualExpectation("/overview", "studio"),
  visualExpectation("/studio/live-video", "studio"),
  visualExpectation("/settings/phone#company-identity", "phone", [
    "primary-lines",
    "company-identity",
  ]),
  visualExpectation("/apps", "settings", ["apps"]),
  visualExpectation("/apps/command", "settings", ["apps-command"]),
]);

export const PRODUCTION_VISUAL_MARKETING_ROUTES = Object.freeze(
  PRODUCTION_VISUAL_MARKETING_EXPECTATIONS.map(({ route }) => route),
);

export const PRODUCTION_VISUAL_AUTHENTICATED_ROUTES = Object.freeze(
  PRODUCTION_VISUAL_AUTHENTICATED_EXPECTATIONS.map(({ route }) => route),
);

export const PRODUCTION_VISUAL_COMPATIBILITY_ROUTES = Object.freeze(
  PRODUCTION_VISUAL_COMPATIBILITY_EXPECTATIONS.map(({ route }) => route),
);

export const PRODUCTION_VISUAL_REDIRECTS = new Map([
  ["/blog", "/changelog"],
  ["/security", "/trust"],
  ["/status", "/trust"],
  ["/overview", "/studio"],
  ["/studio/live-video", "/studio"],
  ["/settings/phone", "/phone"],
  ["/apps", "/settings/apps"],
  ["/apps/command", "/settings/apps/command"],
]);

export const PRODUCTION_VISUAL_VIEWPORTS = Object.freeze([
  Object.freeze({ name: "phone", width: 390, height: 844, isMobile: true, hasTouch: true }),
  Object.freeze({
    name: "desktop",
    width: 1440,
    height: 1100,
    isMobile: false,
    hasTouch: false,
  }),
  Object.freeze({
    name: "laptop",
    width: 1280,
    height: 900,
    isMobile: false,
    hasTouch: false,
  }),
  Object.freeze({
    name: "breakpoint",
    width: 1023,
    height: 768,
    isMobile: false,
    hasTouch: false,
  }),
  Object.freeze({
    name: "short",
    width: 1365,
    height: 650,
    isMobile: false,
    hasTouch: false,
  }),
]);

export const PRODUCTION_VISUAL_MANIFEST_VIEWPORTS = Object.freeze(
  PRODUCTION_VISUAL_VIEWPORTS.map(({ name, width, height }) =>
    Object.freeze({ name, width, height }),
  ),
);

const expectationByCaptureKey = new Map([
  ...PRODUCTION_VISUAL_MARKETING_EXPECTATIONS.map((expectation) => [
    `public\u0000${expectation.route}`,
    expectation,
  ]),
  ...[
    ...PRODUCTION_VISUAL_AUTHENTICATED_EXPECTATIONS,
    ...PRODUCTION_VISUAL_COMPATIBILITY_EXPECTATIONS,
  ].map((expectation) => [`authenticated\u0000${expectation.route}`, expectation]),
]);

const computerPanelExpectation = visualExpectation("/computer", "studio", ["computer-panel"]);

function opensComputerBesideChat(viewportName) {
  const viewport = PRODUCTION_VISUAL_VIEWPORTS.find(({ name }) => name === viewportName);
  return Boolean(viewport && viewport.width >= 1180);
}

export function productionVisualRouteExpectation(mode, route, viewportName) {
  if (mode === "authenticated" && route === "/computer" && opensComputerBesideChat(viewportName)) {
    return computerPanelExpectation;
  }
  return expectationByCaptureKey.get(`${mode}\u0000${route}`) ?? null;
}

export function productionVisualSemanticKey(mode, route, viewportName) {
  // AuthPortal deliberately renders the same signup form for these two URLs.
  // Keep their route-specific marker assertions distinct; only their expected
  // screenshot identity is shared.
  const captureRoute = mode === "public" && route === "/get-started" ? "/signup" : route;
  const expectation = productionVisualRouteExpectation(mode, captureRoute, viewportName);
  return expectation ? `${expectation.page}\u0000${expectation.states.join("\u0000")}` : null;
}

export function requiredProductionVisualSemanticAssertions() {
  const assertions = [];
  for (const viewport of PRODUCTION_VISUAL_VIEWPORTS) {
    for (const [mode, expectations] of [
      ["public", PRODUCTION_VISUAL_MARKETING_EXPECTATIONS],
      [
        "authenticated",
        [
          ...PRODUCTION_VISUAL_AUTHENTICATED_EXPECTATIONS,
          ...PRODUCTION_VISUAL_COMPATIBILITY_EXPECTATIONS,
        ],
      ],
    ]) {
      for (const { route } of expectations) {
        const expectation = productionVisualRouteExpectation(mode, route, viewport.name);
        assertions.push({
          viewport: viewport.name,
          mode,
          route: expectation.route,
          expectedPage: expectation.page,
          expectedStates: [...expectation.states],
          assertedPages: [expectation.page],
          assertedStates: [...expectation.states],
          success: true,
        });
      }
    }
  }
  return assertions;
}

export function visualQaFileStem(route) {
  if (route === "/") return "home";
  return (
    route
      .replace(/^\//, "")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "") || "home"
  );
}

export function routeReachedExactly(
  baseUrl,
  requestedRoute,
  finalUrl,
  viewportName,
  rosterIds = [],
) {
  try {
    const base = new URL(baseUrl);
    const requested = new URL(requestedRoute, `${base.origin}/`);
    const final = new URL(finalUrl);
    let expectedPath = PRODUCTION_VISUAL_REDIRECTS.get(requested.pathname) || requested.pathname;
    let expectedSearch = requested.search;
    let expectedHash = requested.hash;
    if (requested.pathname === "/settings/phone") {
      const search = new URLSearchParams(requested.search);
      search.set("tab", "setup");
      expectedSearch = `?${search.toString()}`;
    }
    if (requested.pathname === "/studio/live-video") {
      // This retired surface intentionally discards its old route state.
      expectedSearch = "";
      expectedHash = "";
    }
    if (requested.pathname === "/admin") {
      const ownerPage = new URL(
        adminTabOwnerPage(requested.searchParams.get("tab")),
        `${base.origin}/`,
      );
      expectedPath = ownerPage.pathname;
      expectedSearch = ownerPage.search;
      expectedHash = "";
    }
    if (requested.pathname === "/computer" && opensComputerBesideChat(viewportName)) {
      expectedPath = "/studio";
      const search = new URLSearchParams({ panel: "computer" });
      const agent = requested.searchParams.get("agent")?.trim();
      if (agent) search.set("agent", agent);
      expectedSearch = `?${search}`;
      expectedHash = "";
    }
    // Studio can select a Bot when a populated workspace opens an unscoped link.
    const search = new URLSearchParams(expectedSearch);
    const selected = final.searchParams.get("agent");
    if (
      expectedPath === "/studio" &&
      !search.has("create") &&
      !search.has("agent") &&
      selected &&
      rosterIds.includes(selected)
    ) {
      search.set("agent", selected);
      expectedSearch = `?${search}`;
    }
    return (
      final.origin === base.origin &&
      final.pathname === expectedPath &&
      final.search === expectedSearch &&
      final.hash === expectedHash
    );
  } catch {
    return false;
  }
}

function artifactName(viewportName, mode, route, suffix) {
  return `${viewportName}-${mode}-${visualQaFileStem(route)}-${suffix}.png`;
}

export function requiredProductionVisualArtifactNames() {
  const names = [];
  for (const viewport of PRODUCTION_VISUAL_VIEWPORTS) {
    for (const route of PRODUCTION_VISUAL_MARKETING_ROUTES) {
      names.push(artifactName(viewport.name, "public", route, "viewport"));
      names.push(artifactName(viewport.name, "public", route, "full"));
    }
    for (const route of [
      ...PRODUCTION_VISUAL_AUTHENTICATED_ROUTES,
      ...PRODUCTION_VISUAL_COMPATIBILITY_ROUTES,
    ]) {
      names.push(artifactName(viewport.name, "authenticated", route, "viewport"));
      names.push(artifactName(viewport.name, "authenticated", route, "full"));
    }
  }
  return names;
}

export function optionalProductionVisualArtifactNames() {
  const names = [];
  for (const viewport of PRODUCTION_VISUAL_VIEWPORTS) {
    for (const route of [
      ...PRODUCTION_VISUAL_AUTHENTICATED_ROUTES,
      ...PRODUCTION_VISUAL_COMPATIBILITY_ROUTES,
    ]) {
      names.push(artifactName(viewport.name, "authenticated", route, "scroll-end"));
    }
  }
  return names;
}

export function isSafeProductionVisualArtifactDirectory(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/.test(value);
}
