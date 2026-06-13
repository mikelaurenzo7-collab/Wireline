import { expect, type Page } from "@playwright/test";

/**
 * Shared UI invariants for the functional e2e suite.
 *
 * These helpers encode the layout and accessibility contracts that the
 * retired visual-regression baselines used to guard — but as behavioural
 * assertions that are stable across CI and local runs (no pixel diffing,
 * no committed PNG baselines to churn).
 */

/** Phone, tablet, desktop. Names mirror the Tailwind breakpoints. */
export const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

/**
 * Public marketing/auth surfaces that render without a database or auth
 * session. Every prospect-facing userflow starts on one of these.
 */
export const PUBLIC_ROUTES = [
  { path: "/", name: "landing", title: /Wireline/i },
  { path: "/pricing", name: "pricing", title: /Wireline/i },
  { path: "/showcase", name: "showcase", title: /Wireline/i },
  { path: "/compare", name: "compare", title: /Wireline/i },
  { path: "/about", name: "about", title: /Wireline/i },
  { path: "/blog", name: "blog", title: /Wireline/i },
  {
    path: "/blog/voice-ai-benchmarks-sub-400ms-response-times",
    name: "blog-post",
    title: /Wireline/i,
  },
  { path: "/signin", name: "signin", title: /Wireline/i },
  { path: "/signup", name: "signup", title: /Wireline/i },
] as const;

/** Extended public routes including legal, status, and info pages. */
export const EXTENDED_PUBLIC_ROUTES = [
  { path: "/status", name: "status", title: /Wireline/i },
  { path: "/changelog", name: "changelog", title: /Wireline/i },
  { path: "/security", name: "security", title: /Wireline/i },
  { path: "/privacy", name: "privacy", title: /Wireline/i },
  { path: "/terms", name: "terms", title: /Wireline/i },
  { path: "/support", name: "support", title: /Wireline/i },
  { path: "/developers", name: "developers", title: /Wireline/i },
] as const;

/** Auth-adjacent public routes (not in PUBLIC_ROUTES). */
export const AUTH_PUBLIC_ROUTES = [
  { path: "/reset-password", name: "reset-password", title: /Wireline/i },
  { path: "/login", name: "login", title: /Wireline/i },
  { path: "/auth/signin", name: "auth-signin-legacy", title: /Wireline/i },
  { path: "/auth/signup", name: "auth-signup-legacy", title: /Wireline/i },
] as const;

/** Legal, docs, and error surfaces. */
export const LEGAL_AND_DOCS_ROUTES = [
  { path: "/legal/data-deletion", name: "data-deletion", title: /Wireline/i },
  { path: "/docs/zoom", name: "zoom-docs", title: /Wireline/i },
  { path: "/not-found", name: "not-found", title: /Wireline/i },
] as const;

/** Every public path the design suite should sweep. */
export const ALL_PUBLIC_MARKETING_PATHS = [
  ...PUBLIC_ROUTES.map((r) => r.path),
  ...EXTENDED_PUBLIC_ROUTES.map((r) => r.path),
  ...AUTH_PUBLIC_ROUTES.map((r) => r.path),
  ...LEGAL_AND_DOCS_ROUTES.map((r) => r.path),
] as const;

/** All authenticated routes that must redirect to signin when unauthenticated. */
export const AUTHENTICATED_ROUTES = [
  { path: "/chat", name: "chat" },
  { path: "/ops", name: "live-ops" },
  { path: "/phone", name: "phone" },
  { path: "/email", name: "email" },
  { path: "/sms", name: "sms" },
  { path: "/activity", name: "activity" },
  { path: "/cockpit", name: "cockpit" },
  { path: "/triage", name: "triage" },
  { path: "/insights", name: "insights" },
  { path: "/appointments", name: "appointments" },
  { path: "/training", name: "training" },
  { path: "/knowledge", name: "knowledge" },
  { path: "/agents", name: "agents" },
  { path: "/integrations", name: "integrations" },
  { path: "/admin", name: "admin" },
  { path: "/dnc", name: "dnc" },
  { path: "/audit", name: "audit" },
  { path: "/help", name: "help" },
  { path: "/pipeline", name: "pipeline" },
  { path: "/founder", name: "founder" },
] as const;

/**
 * Authenticated routes with URL-driven sub-tabs (ClientSubTabs or SettingsTabSwitcher).
 * `tablist` is the aria-label on the tablist; `tabs` are visible tab labels.
 */
export const AUTHENTICATED_SUBTAB_SURFACES = [
  {
    path: "/phone",
    tablist: "Phone sections",
    tabs: ["Call History", "Outbound", "Appointments"] as const,
  },
  {
    path: "/ops",
    tablist: "Live Ops sections",
    tabs: ["Live floor", "Actions", "Triage", "Analytics"] as const,
  },
  {
    path: "/training",
    tablist: "Training modules",
    tabs: ["Knowledge", "Voices", "Pronunciation", "Simulator", "Flow"] as const,
  },
  {
    path: "/admin",
    tablist: "Settings sub-navigation",
    tabs: [
      "Billing",
      "Team",
      "Branding",
      "Carrier",
      "Growth",
      "Integrations",
      "Activity",
      "DNC",
      "Audit",
    ] as const,
  },
] as const;

/** Deep-link tab URLs used by legacy redirects and bookmarks. */
export const AUTHENTICATED_TAB_DEEP_LINKS = [
  "/phone?tab=outbound",
  "/phone?tab=appointments",
  "/ops?tab=intel",
  "/ops?tab=actions",
  "/ops?tab=analytics",
  "/ops?tab=floor",
  "/admin?tab=growth",
  "/admin?tab=subscription",
  "/admin?tab=team",
  "/admin?tab=branding",
  "/admin?tab=carrier",
  "/admin?tab=flywheel",
  "/admin?tab=system",
  "/admin?tab=activity",
  "/training?tab=database",
  "/training?tab=voices",
  "/training?tab=pronunciation",
  "/training?tab=simulator",
  "/training?tab=flow",
] as const;

/** Legacy redirects that must forward to new paths. */
export const LEGACY_REDIRECTS = [
  { from: "/dashboard", to: "/ops" },
  { from: "/command", to: "/ops" },
  { from: "/live", to: "/ops" },
  { from: "/cockpit", to: "/ops" },
  { from: "/logs", to: "/phone" },
  { from: "/inbox", to: "/email" },
  { from: "/outbound", to: "/phone" },
  { from: "/appointments", to: "/phone" },
  { from: "/activity", to: "/phone" },
  { from: "/knowledge", to: "/training" },
  { from: "/train", to: "/training" },
  { from: "/admin/growth", to: "/admin?tab=flywheel" },
  { from: "/ops/actions", to: "/ops?tab=intel" },
] as const;

/** Industry wedge landing pages reached from outbound DMs (/for/<slug>). */
export const VERTICAL_WEDGES = [
  { slug: "home-services", headline: /after-hours calls/i },
  { slug: "medical", headline: /patients/i },
  { slug: "legal", headline: /client call captured/i },
  { slug: "real-estate", headline: /lead worked/i },
  { slug: "personal", headline: /awkward call/i },
  { slug: "insurance", headline: /quote request/i },
  { slug: "restaurants", headline: /dinner rush/i },
  { slug: "sales", headline: /AI SDR/i },
] as const;

/**
 * Navigate and wait for the SPA to hydrate. Marketing pages are lazy-loaded
 * behind Suspense, so the persistent site header is the earliest reliable
 * signal that the route chunk has mounted. Non-retrying assertions (counts,
 * evaluate) must run only after this resolves.
 */
export async function gotoHydrated(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByTestId("site-header")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 20_000 });
}

/** Authenticated shell: wait for sidebar rail and primary heading. */
export async function gotoAuthenticated(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("sidebar-rail")).toBeVisible({ timeout: 25_000 });
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 25_000 });
}

/**
 * The page must never scroll horizontally. A 2px slack absorbs sub-pixel
 * rounding; anything beyond that is a real chrome regression (the class of
 * bug the old visual suite was created to catch).
 */
export async function assertNoHorizontalOverflow(page: Page) {
  const overflowBy = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - doc.clientWidth;
  });
  expect(overflowBy, "page must not scroll horizontally").toBeLessThanOrEqual(2);
}

/**
 * Every page must expose exactly one level-1 heading. A missing or
 * duplicated h1 breaks both the document outline and screen-reader nav.
 */
export async function assertSingleH1(page: Page) {
  // Wait for the (lazy) route to render its heading before counting, so a
  // pre-hydration snapshot doesn't read 0.
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 20_000 });
  const count = await page.getByRole("heading", { level: 1 }).count();
  expect(count, "page must have exactly one <h1>").toBe(1);
}

/**
 * Open the public mobile navigation overlay. Header collapses the nav
 * behind a hamburger below the md breakpoint.
 */
export async function openPublicMobileNav(page: Page) {
  await page.getByTestId("mobile-menu-toggle").click();
  await expect(page.getByRole("dialog", { name: "Site navigation" })).toBeVisible();
}
