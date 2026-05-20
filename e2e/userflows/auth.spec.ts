import { test, expect } from "@playwright/test";

/**
 * Authentication user flow tests
 * Critical path: Login → Dashboard → Logout
 */
test.describe("Authentication Flows", () => {
  test("login page renders correctly", async ({ page }) => {
    await page.goto("/login");

    // Check key elements exist
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator("form").getByRole("button", { name: /^sign in$/i })).toBeVisible();
  });

  test("login with invalid credentials shows error", async ({ page }) => {
    await page.route("**/api/auth/signin", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Invalid email or password" }),
      });
    });

    await page.goto("/login");

    await page.locator('input[type="email"]').fill("test@example.com");
    await page.locator('input[type="password"]').fill("wrongpassword");
    await page
      .locator("form")
      .getByRole("button", { name: /^sign in$/i })
      .click();

    // Should show error message
    await expect(page.getByText(/invalid email or password/i)).toBeVisible();
  });

  test("successful login redirects to dashboard", async ({ page }) => {
    // Skip if no test credentials configured (supports both Vercel and local naming)
    const email = process.env.E2E_USER_EMAIL || process.env.E2E_TEST_EMAIL;
    const password = process.env.E2E_USER_PASSWORD || process.env.E2E_TEST_PASSWORD;
    test.skip(!email || !password, "No E2E test credentials");

    await page.goto("/login");

    await page.locator('input[type="email"]').fill(email!);
    await page.locator('input[type="password"]').fill(password!);
    await page
      .locator("form")
      .getByRole("button", { name: /^sign in$/i })
      .click();

    // Should redirect to dashboard
    await expect(page).not.toHaveURL(/login|signin|signup/);
    await expect(page.getByText(/dashboard|overview|welcome/i)).toBeVisible();
  });
});
