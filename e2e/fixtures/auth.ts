import { type Page } from "@playwright/test";

/** Resolves Vercel-style and local env naming for the operator test account. */
export function e2eTestCredentials(): { email: string | undefined; password: string | undefined } {
  return {
    email: process.env.E2E_USER_EMAIL || process.env.E2E_TEST_EMAIL,
    password: process.env.E2E_USER_PASSWORD || process.env.E2E_TEST_PASSWORD,
  };
}

export function hasE2eCredentials(): boolean {
  const { email, password } = e2eTestCredentials();
  return !!(email && password);
}

/** Best-effort dismiss of cookie banners that block clicks in some environments. */
export async function dismissCookieBanner(page: Page): Promise<void> {
  const btn = page.getByRole("button", { name: /^(accept|ok|agree)$/i }).first();
  try {
    await btn.click({ timeout: 2500 });
  } catch {
    /* none */
  }
}

/**
 * Signs in via the same AuthPortal used on all unauthenticated routes.
 * Post-login navigation lands on `/` (see App.tsx).
 */
export async function loginAsTestUser(page: Page): Promise<void> {
  const { email, password } = e2eTestCredentials();
  if (!email || !password) {
    throw new Error("E2E_USER_EMAIL / E2E_USER_PASSWORD (or E2E_TEST_*) must be set");
  }

  await page.goto("/login");
  await dismissCookieBanner(page);

  const emailInput = page.locator('input[type="email"]').first();
  await emailInput.waitFor({ state: "visible", timeout: 20_000 });
  await emailInput.fill(email);
  await page.locator('input[type="password"]').first().fill(password);

  await page
    .locator("button[type='submit']")
    .filter({ hasText: /sign in/i })
    .click();

  await page.waitForURL((url) => url.pathname === "/" || url.pathname === "/dashboard", {
    timeout: 25_000,
  });
}
