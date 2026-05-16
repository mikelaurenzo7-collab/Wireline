import { test, expect } from "@playwright/test";
import { dismissCookieNotice, signInSubmitButton } from "../helpers/auth";

/**
 * Authentication user flow tests
 * Critical path: Login → app shell → invalid credentials
 */
test.describe("Authentication Flows", () => {
  test("login page renders correctly", async ({ page }) => {
    await page.goto("/login");
    await dismissCookieNotice(page);

    await expect(signInSubmitButton(page)).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();

    if (!process.env.CI) {
      await expect(page).toHaveScreenshot("login-page.png", {
        fullPage: true,
        maxDiffPixelRatio: 0.03,
      });
    }
  });

  test("login with invalid credentials shows error", async ({ page }) => {
    await page.goto("/login");
    await dismissCookieNotice(page);

    await page.locator('input[type="email"]').fill("not-a-real-user@wireline.invalid");
    await page.locator('input[type="password"]').fill("wrongpassword");
    await signInSubmitButton(page).click();

    await expect(page.getByText(/invalid|error|failed|credentials/i)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("successful login reaches authenticated shell", async ({ page }) => {
    const email = process.env.E2E_USER_EMAIL || process.env.E2E_TEST_EMAIL;
    test.skip(!email, "No E2E test credentials");

    await page.goto("/login");
    await dismissCookieNotice(page);

    await page.locator('input[type="email"]').fill(email!);
    await page
      .locator('input[type="password"]')
      .fill((process.env.E2E_USER_PASSWORD || process.env.E2E_TEST_PASSWORD)!);
    await signInSubmitButton(page).click();

    await page.waitForURL((url) => !url.pathname.includes("login"), { timeout: 45_000 });
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
    await expect(page.getByRole("link", { name: /go to command center/i })).toBeVisible({
      timeout: 15_000,
    });
  });
});
