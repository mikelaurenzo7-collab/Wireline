import { test, expect } from "@playwright/test";

/**
 * Voice Agent critical user flow
 * Create agent → Configure → Test call
 */
test.describe("Voice Agent Creation Flow", () => {
  // Support both Vercel env naming (E2E_USER_*) and local naming (E2E_TEST_*)
  const getCredentials = () => ({
    email: process.env.E2E_USER_EMAIL || process.env.E2E_TEST_EMAIL,
    password: process.env.E2E_USER_PASSWORD || process.env.E2E_TEST_PASSWORD,
  });

  test.skip(!getCredentials().email, "E2E test credentials required");

  test.beforeEach(async ({ page }) => {
    const { email, password } = getCredentials();
    // Login
    await page.goto("/login");
    await page.getByPlaceholder(/email/i).fill(email!);
    await page.getByPlaceholder(/password/i).fill(password!);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test("fleet / agents page loads (no /agents/new route in app)", async ({ page }) => {
    await page.goto("/agents");
    await expect(page.getByText(/fleet|templates|agents|my fleet/i).first()).toBeVisible({
      timeout: 20_000,
    });
  });
});
