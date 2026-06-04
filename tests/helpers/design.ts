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

export async function assertBrandPrimaryToken(page: Page) {
  const brand = await getCssVar(page, "--color-brand");
  expect(brand.toLowerCase()).toBe(BRAND_PRIMARY.toLowerCase());
}

export async function assertPaperBackground(page: Page) {
  const paper = await getCssVar(page, "--color-paper");
  expect(paper.length).toBeGreaterThan(0);
}

/** Authenticated app chrome must not expose legacy aurora-ring decoration. */
export async function assertNoAuroraRingInApp(page: Page) {
  const count = await page.locator(".aurora-ring").count();
  expect(count, "app routes must not render .aurora-ring").toBe(0);
}

/** Primary CTAs on marketing pages should use brand ink, not off-hue literals. */
export async function assertHeaderTrialCta(page: Page) {
  const cta = page.getByTestId("header-cta");
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute("href", /\/signup/);
}
