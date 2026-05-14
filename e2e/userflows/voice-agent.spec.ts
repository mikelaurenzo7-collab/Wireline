import { test, expect } from "@playwright/test";

/**
 * Voice Agent critical user flow
 * Create agent → Configure → Test call
 */
test.describe("Voice Agent Creation Flow", () => {
  test.skip(!process.env.E2E_TEST_EMAIL, "E2E test credentials required");

  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto("/login");
    await page.getByPlaceholder(/email/i).fill(process.env.E2E_TEST_EMAIL!);
    await page.getByPlaceholder(/password/i).fill(process.env.E2E_TEST_PASSWORD!);
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
