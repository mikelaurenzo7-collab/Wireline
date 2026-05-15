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
    await expect(page).toHaveURL(/dashboard/);
  });

  test("create new voice agent", async ({ page }) => {
    // Navigate to agent creation
    await page.goto("/agents/new");

    // Fill agent details
    await page.getByLabel(/agent name/i).fill("E2E Test Agent");
    await page.getByLabel(/description/i).fill("Created by automated E2E test");

    // Select archetype
    await page.getByLabel(/archetype/i).selectOption("receptionist");

    // Save agent
    await page.getByRole("button", { name: /create|save/i }).click();

    // Should redirect to agent detail or show success
    await expect(page.getByText(/created|success/i)).toBeVisible();
  });

  test("configure agent phone number", async ({ page }) => {
    await page.goto("/agents");

    // Find test agent
    const agentRow = page.getByText("E2E Test Agent").first();
    await agentRow.click();

    // Navigate to phone settings
    await page.getByRole("tab", { name: /phone|voice|settings/i }).click();

    // Configure with test number (mock/Vapi test number)
    await page.getByLabel(/phone number/i).fill("+15555555555");
    await page.getByRole("button", { name: /save|update/i }).click();

    await expect(page.getByText(/updated|success/i)).toBeVisible();
  });
});
