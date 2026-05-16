import { test, expect } from "@playwright/test";
import { dismissCookieBanner, hasE2eCredentials, loginAsTestUser } from "../fixtures/auth";

test.describe("Component Visual Tests — public", () => {
  test("login form component", async ({ page }) => {
    await page.goto("/login");
    await dismissCookieBanner(page);

    const loginForm = page.locator("form").first();
    await expect(loginForm).toHaveScreenshot("login-form.png");
  });
});

test.describe("Component Visual Tests — authenticated chrome", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!hasE2eCredentials(), "Set E2E credentials for shell screenshots");
    await loginAsTestUser(page);
  });

  test("navigation rail visible", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("domcontentloaded");

    const rail = page.locator("aside").first();
    await expect(rail).toBeVisible({ timeout: 20_000 });
    await expect(rail).toHaveScreenshot("sidebar-expanded.png");
  });
});
