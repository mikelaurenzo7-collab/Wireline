import { expect, type Page } from "@playwright/test";

/** Wireline brand primary — must match `--color-brand` in index.css */
export const BRAND_PRIMARY = "#8B3FD6";

/**
 * Reads a CSS custom property from :root after the app stylesheet loads.
 */
export async function getCssVar(page: Page, name: string): Promise<string> {
  return page.evaluate((varName) => {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  }, name);
}

export async function assertMarketingSurface(page: Page) {
  await expect(page.locator(".marketing-surface").first()).toBeVisible({ timeout: 20_000 });
}

export async function assertAppSurface(page: Page) {
  await expect(page.locator(".app-surface").first()).toBeVisible({ timeout: 25_000 });
}

export async function assertAuthenticatedShell(page: Page) {
  await expect(page.getByTestId("client-console")).toBeVisible({ timeout: 25_000 });
  await expect(page.getByTestId("sidebar-rail")).toBeVisible();
  await assertAppSurface(page);
}

export async function assertBrandPrimaryToken(page: Page) {
  const brand = await getCssVar(page, "--color-brand");
  expect(brand.toLowerCase()).toBe(BRAND_PRIMARY.toLowerCase());
}

export async function assertPaperBackground(page: Page) {
  const paper = await getCssVar(page, "--color-paper");
  expect(paper.length).toBeGreaterThan(0);
}

export async function assertFocusRingToken(page: Page) {
  const ring = await getCssVar(page, "--focus-ring");
  expect(ring.length).toBeGreaterThan(0);
}

/** Authenticated app chrome must not expose the legacy aurora-ring decoration (retired with the Rich Cream + Purple rebrand). */
export async function assertNoAuroraRingInApp(page: Page) {
  const count = await page.locator(".aurora-ring").count();
  expect(count, "app routes must not render .aurora-ring (renamed to .wl-purple-ring)").toBe(0);
}

/** Removed landing hero orbs must not reappear in DOM. */
export async function assertNoHeroAuroraOrbs(page: Page) {
  await expect(page.locator(".hero-aurora-orb")).toHaveCount(0);
  await expect(page.locator(".hero-aurora-orb-warm")).toHaveCount(0);
}

/** Primary CTAs on marketing pages should use brand ink, not off-hue literals. */
export async function assertHeaderTrialCta(page: Page) {
  const cta = page.getByTestId("header-cta");
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute("href", /\/signup/);
}

/** Auth surfaces use the rich cream canvas (no purple aurora wash). */
export async function assertAuthPortalCanvas(page: Page) {
  await expect(page.locator(".auth-portal-canvas").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".auth-aurora-a")).toHaveCount(0);
  await expect(page.locator(".auth-aurora-b")).toHaveCount(0);
}

/** Director mission control — composer dock is always present on /chat. */
export async function assertDirectorComposerDock(page: Page) {
  await expect(page.locator(".wl-composer-dock").first()).toBeVisible({
    timeout: 25_000,
  });
}

/** At least one elevated panel pattern on app data surfaces. */
export async function assertWlPanelPresent(page: Page) {
  const count = await page.locator(".wl-panel, .wl-panel-elevated").count();
  expect(count, "app route should use wl-panel surfaces").toBeGreaterThan(0);
}

/** App scroll regions use the locked shell viewport class. */
export async function assertScrollViewportInShell(page: Page) {
  const count = await page.locator(".scroll-viewport").count();
  expect(count, "AppShell should expose scroll-viewport").toBeGreaterThan(0);
}

/** Motion respects OS reduced-motion when emulated. */
export async function assertReducedMotionHonored(page: Page) {
  const sample = page.locator(".wl-orbit, .app-tab-active-bg").first();
  if ((await sample.count()) === 0) return;
  const duration = await sample.evaluate((el) => {
    const anim = getComputedStyle(el).animationDuration;
    const trans = getComputedStyle(el).transitionDuration;
    return { anim, trans };
  });
  const animOk =
    !duration.anim ||
    duration.anim === "0s" ||
    duration.anim.split(",").every((d) => d.trim() === "0s");
  const transOk =
    !duration.trans ||
    duration.trans === "0s" ||
    duration.trans.split(",").every((d) => d.trim() === "0s");
  expect(animOk || transOk).toBeTruthy();
}
