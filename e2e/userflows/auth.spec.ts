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

    // Check key elements exist
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
    await expect(page.getByPlaceholder(/email/i)).toBeVisible();
    await expect(page.getByPlaceholder(/password/i)).toBeVisible();
  });

  test("login with invalid credentials shows error", async ({ page }) => {
    await page.goto("/login");

    await page.getByPlaceholder(/email/i).fill("test@example.com");
    await page.getByPlaceholder(/password/i).fill("wrongpassword");
    await page.getByRole("button", { name: /sign in/i }).click();

    // Should show error message
    await expect(page.getByText(/invalid|error|failed/i)).toBeVisible();
  });

  test("successful login redirects to dashboard", async ({ page }) => {
    // Skip if no test credentials configured
    test.skip(!process.env.E2E_TEST_EMAIL, "No E2E test credentials");

    await page.goto("/login");

    await page.getByPlaceholder(/email/i).fill(process.env.E2E_TEST_EMAIL!);
    await page.getByPlaceholder(/password/i).fill(process.env.E2E_TEST_PASSWORD!);
    await page.getByRole("button", { name: /sign in/i }).click();

    // Should redirect to dashboard
    await expect(page).toHaveURL(/dashboard|home/);
    await expect(page.getByText(/dashboard|overview|welcome/i)).toBeVisible();
  });
});
