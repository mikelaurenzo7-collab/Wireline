/**
 * Canonical production visual-QA matrix.
 *
 * Keep this file data-only so the capture runner, manifest gate, and contract
 * tests all prove the same route and breakpoint inventory.
 */

export const VISUAL_QA_SCHEMA_VERSION = 2;
export const DEMO_AGENT_ROUTE_TOKEN = "<demo-agent-id>";

export const PUBLIC_ROUTES = Object.freeze([
  "/",
  "/features",
  "/pricing",
  "/showcase",
  "/compare",
  "/solutions/support",
  "/solutions/sales",
  "/for/personal",
  "/for/home-services",
  "/for/medical",
  "/for/legal",
  "/for/real-estate",
  "/for/insurance",
  "/for/restaurants",
  "/for/sales",
  "/about",
  "/blog",
  "/changelog",
  "/security",
  "/trust",
  "/trust/medical",
  "/trust/legal",
  "/trust/insurance",
  "/trust/enterprise",
  "/status",
  "/support",
  "/contact",
  "/privacy",
  "/terms",
  "/developers",
  "/signin",
  "/signup",
  "/reset-password?token=visual-qa",
  "/onboarding",
  "/auth/oauth-complete",
  "/404",
  "/not-found",
  "/this-route-does-not-exist",
  "/legal/data-deletion",
]);

export const AUTHENTICATED_ROUTE_TEMPLATES = Object.freeze([
  "/overview",
  "/studio",
  `/studio?agent=${DEMO_AGENT_ROUTE_TOKEN}`,
  "/studio?create=1",
  "/studio/handoff",
  "/templates",
  "/knowledge",
  "/connections",
  "/connections/salesforce",
  "/phone",
  "/phone?tab=logs",
  "/insights",
  "/inbox",
  "/approvals",
  "/apps",
  "/settings",
  "/settings/billing",
  "/settings/phone",
  "/settings/team",
  "/settings/customization",
  "/settings/compliance",
  "/settings/apps",
  "/admin",
  "/workspace-route-does-not-exist",
]);

/**
 * The 639/640, 767/768, and 1023/1024 pairs guard the responsive seams. The
 * remaining sizes cover real phones, tablets, short laptops, and large screens.
 */
export const VISUAL_QA_VIEWPORTS = Object.freeze([
  { name: "compact-360x640", width: 360, height: 640, isMobile: true, hasTouch: true },
  { name: "phone-390x844", width: 390, height: 844, isMobile: true, hasTouch: true },
  { name: "phone-430x932", width: 430, height: 932, isMobile: true, hasTouch: true },
  { name: "sm-before-639x900", width: 639, height: 900, isMobile: true, hasTouch: true },
  { name: "sm-at-640x900", width: 640, height: 900, isMobile: true, hasTouch: true },
  { name: "md-before-767x1024", width: 767, height: 1024, isMobile: true, hasTouch: true },
  { name: "md-at-768x1024", width: 768, height: 1024, isMobile: true, hasTouch: true },
  { name: "tablet-834x1112", width: 834, height: 1112, isMobile: true, hasTouch: true },
  { name: "lg-before-1023x768", width: 1023, height: 768, isMobile: true, hasTouch: true },
  { name: "lg-at-1024x768", width: 1024, height: 768, isMobile: false, hasTouch: false },
  { name: "laptop-1280x800", width: 1280, height: 800, isMobile: false, hasTouch: false },
  { name: "short-laptop-1365x768", width: 1365, height: 768, isMobile: false, hasTouch: false },
  { name: "desktop-1440x900", width: 1440, height: 900, isMobile: false, hasTouch: false },
  { name: "wide-1536x960", width: 1536, height: 960, isMobile: false, hasTouch: false },
  { name: "full-hd-1920x1080", width: 1920, height: 1080, isMobile: false, hasTouch: false },
]);

export const FULL_SCREENSHOT_COUNT =
  (PUBLIC_ROUTES.length + AUTHENTICATED_ROUTE_TEMPLATES.length) * VISUAL_QA_VIEWPORTS.length;

export function materializeAuthenticatedRoutes(agentId) {
  const safeAgentId = typeof agentId === "string" ? agentId.trim() : "";
  return AUTHENTICATED_ROUTE_TEMPLATES.map((route) =>
    route.includes(DEMO_AGENT_ROUTE_TOKEN)
      ? route.replace(DEMO_AGENT_ROUTE_TOKEN, encodeURIComponent(safeAgentId))
      : route,
  );
}

export function routePathname(route) {
  return new URL(route, "https://visual-qa.invalid").pathname;
}

export function expectedModalPolicy(mode, routeTemplate) {
  if (mode === "authenticated" && routeTemplate === "/studio?create=1") return "required";
  return "forbidden";
}

export function allowedFinalPathnames(mode, routeTemplate) {
  const requested = routePathname(routeTemplate);
  if (mode === "public" && routeTemplate === "/onboarding") {
    // The lifecycle route immediately advances. Anonymous captures normally
    // land on sign-in; a still-mounted transition or Studio redirect is also valid.
    return ["/onboarding", "/studio", "/signin"];
  }
  return [requested];
}

export function captureKey(mode, viewportName, routeTemplate) {
  return `${mode}::${viewportName}::${routeTemplate}`;
}
