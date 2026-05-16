import type { Page } from "@playwright/test";

export function getE2EEmail(): string | undefined {
  return process.env.E2E_USER_EMAIL || process.env.E2E_TEST_EMAIL;
}

export function getE2EPassword(): string | undefined {
  return process.env.E2E_USER_PASSWORD || process.env.E2E_TEST_PASSWORD;
}

export function hasE2ECredentials(): boolean {
  return Boolean(getE2EEmail() && getE2EPassword());
}

/**
 * The auth screen has a “Sign In / Sign Up” tab pair plus a submit button also labeled “Sign In”.
 * Always target the form submit control to avoid strict-mode collisions.
 */
export function signInSubmitButton(page: import("@playwright/test").Page) {
  return page.locator("form").getByRole("button", { name: /^sign in$/i });
}

/** Dismiss the bottom cookie banner if it appears (delayed mount). */
export async function dismissCookieNotice(page: Page): Promise<void> {
  const dismiss = page.getByRole("button", { name: /dismiss cookie notice/i });
  try {
    await dismiss.click({ timeout: 4000 });
  } catch {
    /* not visible or already dismissed */
  }
}

/**
 * Sign in via the same email/password flow as the production AuthPortal.
 * Leaves the app on `/` (post-login redirect) or another authenticated path.
 */
export async function signInWithTestUser(page: Page): Promise<void> {
  const email = getE2EEmail();
  const password = getE2EPassword();
  if (!email || !password) {
    throw new Error("E2E_USER_EMAIL and E2E_USER_PASSWORD (or E2E_TEST_*) must be set");
  }

  await page.goto("/login");
  await dismissCookieNotice(page);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await signInSubmitButton(page).click();
  await page.waitForURL((url) => !url.pathname.includes("login"), { timeout: 45_000 });
}
