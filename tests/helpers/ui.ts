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
  { path: "/signin", name: "signin", title: /Wireline/i },
  { path: "/signup", name: "signup", title: /Wireline/i },
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
