import { test, expect } from "@playwright/test";
import {
  dismissCookieBanner,
  e2eTestCredentials,
  hasE2eCredentials,
  loginAsTestUser,
} from "../fixtures/auth";

/**
 * Authentication user flow tests
 * Critical path: Login shell → operator console → session gate
 */
test.describe("Authentication Flows", () => {
  test("login page renders correctly", async ({ page }) => {
    await page.goto("/login");
    await dismissCookieBanner(page);

    await expect(page).toHaveScreenshot("login-page.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });

    await expect(
      page.locator("button[type='submit']").filter({ hasText: /sign in/i }),
    ).toBeVisible();
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });

  test("login with invalid credentials shows error", async ({ page }) => {
    await page.goto("/login");
    await dismissCookieBanner(page);

    await page.locator('input[type="email"]').first().fill("not-a-real-user@wireline-e2e.invalid");
    await page.locator('input[type="password"]').first().fill("wrongpassword");
    await page
      .locator("button[type='submit']")
      .filter({ hasText: /sign in/i })
      .click();

    await expect(page.getByText(/invalid|failed|authentication|credentials/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("successful login reaches operator console", async ({ page }) => {
    test.skip(!hasE2eCredentials(), "Set E2E_USER_EMAIL + E2E_USER_PASSWORD (or E2E_TEST_*)");

    await loginAsTestUser(page);

    await expect(page).toHaveURL(/\/($|dashboard)/);
    await expect(page.getByText(/WIRELINE|Command|Dashboard|Triage/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("unauthenticated deep link shows auth shell (URL preserved)", async ({ page }) => {
    await page.goto("/outbound");
    await dismissCookieBanner(page);

    await expect(page).toHaveURL("/outbound");
    await expect(page.getByText(/welcome back|sign in/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("logout clears session and shows auth", async ({ page }) => {
    test.skip(!hasE2eCredentials(), "Set E2E_USER_EMAIL + E2E_USER_PASSWORD (or E2E_TEST_*)");

    await loginAsTestUser(page);

    await page.getByRole("button", { name: "Sign out" }).click();

    await expect(page.getByText(/welcome back|sign in/i).first()).toBeVisible({ timeout: 15_000 });
    const { email } = e2eTestCredentials();
    await page
      .locator('input[type="email"]')
      .first()
      .fill(email || "");
    await expect(page.locator('input[type="email"]').first()).toHaveValue(email || "");
  });
});
