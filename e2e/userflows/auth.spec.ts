import { test, expect } from "@playwright/test";

/**
 * Authentication user flow tests
 * Critical path: Login → Dashboard → Logout
 */
test.describe("Authentication Flows", () => {
  test("login page renders correctly", async ({ page }) => {
    await page.goto("/login");

    // Visual snapshot of login page
    await expect(page).toHaveScreenshot("login-page.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });

    // Check key elements exist (AuthPortal placeholders are not "email"/"password" text)
    const authForm = page.locator("form").first();
    await expect(page.locator("form").getByRole("button", { name: /sign in/i })).toBeVisible();
    await expect(authForm.locator('input[type="email"]')).toBeVisible();
    await expect(authForm.locator('input[type="password"]')).toBeVisible();
  });

  test("login with invalid credentials shows error", async ({ page }) => {
    await page.goto("/login");

    const authForm = page.locator("form").first();
    await authForm.locator('input[type="email"]').fill("test@example.com");
    await authForm.locator('input[type="password"]').fill("wrongpassword");
    await page
      .locator("form")
      .getByRole("button", { name: /sign in/i })
      .click();

    // Invalid credentials → 401; DB down → 500 — surface either as an error message
    await expect(
      page.getByText(/invalid|internal|error|failed|network|unable|authentication/i).first(),
    ).toBeVisible({
      timeout: 12_000,
    });
  });

  test("successful login redirects to dashboard", async ({ page }) => {
    // Skip if no test credentials configured (supports both Vercel and local naming)
    const email = process.env.E2E_USER_EMAIL || process.env.E2E_TEST_EMAIL;
    test.skip(!email, "No E2E test credentials");

    await page.goto("/login");

    const authForm = page.locator("form").first();
    await authForm.locator('input[type="email"]').fill(email!);
    await authForm
      .locator('input[type="password"]')
      .fill((process.env.E2E_USER_PASSWORD || process.env.E2E_TEST_PASSWORD)!);
    await page
      .locator("form")
      .getByRole("button", { name: /sign in/i })
      .click();

    // Authenticated shell loads (URL often stays `/` — see App.tsx post-login redirect)
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
    await expect(page.getByText(/dashboard|overview|welcome|pulse|wireline/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
