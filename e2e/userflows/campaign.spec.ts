import { test, expect } from "@playwright/test";

/**
 * Campaign Management E2E Tests
 * Critical path: Create campaign → Upload leads → Launch → Verify running state
 *
 * Business value: Outbound campaigns drive revenue. If this flow breaks,
 * the core product fails. These tests catch integration failures before
 * they cost money in production.
 *
 * NOTE: These tests require the dev server running at localhost:3000
 * and proper CORS configuration (CORS_ORIGINS must include http://localhost:3000)
 */

test.describe("Campaign Management Flows", () => {
  test.setTimeout(60000); // 60s timeout for campaign operations

  // Helper: Login with test credentials
  // Uses E2E_USER_EMAIL/E2E_USER_PASSWORD from Vercel env, falls back to E2E_TEST_* variants
  const loginIfCredentials = async (page: any) => {
    const email = process.env.E2E_USER_EMAIL || process.env.E2E_TEST_EMAIL;
    const password = process.env.E2E_USER_PASSWORD || process.env.E2E_TEST_PASSWORD;

    if (!email) {
      test.skip(true, "No E2E test credentials configured");
      return;
    }

    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    // Dismiss cookie consent popup if present (blocks UI)
    const cookieDismiss = page
      .locator('button:has-text("Accept"), button:has-text("OK"), .cookie-banner button')
      .first();
    try {
      await cookieDismiss.click({ timeout: 3000 });
    } catch {
      // Popup not present or already dismissed
    }

    // Wait for auth form with flexible selectors
    await expect(page.locator("input").first()).toBeVisible({ timeout: 10000 });

    // Fill credentials using data-testid or placeholder
    const emailInput = page.locator('[data-testid="email-input"], input[type="email"]').first();
    await emailInput.fill(email);

    const passwordInput = page
      .locator('[data-testid="password-input"], input[type="password"]')
      .first();
    await passwordInput.fill(password || "");

    // Click sign in button (use submit type for reliability)
    await page.locator('button[type="submit"]').click();

    // Wait for navigation away from login page (any authenticated route)
    await page.waitForURL((url: URL) => !url.pathname.includes("/login"), { timeout: 15000 });

    // Verify we're on an authenticated page (sidebar shows user or we see dashboard elements)
    await expect(page.locator('nav, .sidebar, [class*="sidebar"]').first()).toBeVisible({
      timeout: 5000,
    });
  };

  test("outbound dialer page renders correctly", async ({ page }) => {
    await page.goto("/outbound");
    await page.waitForLoadState("networkidle");

    // Check key elements exist with flexible selectors
    const createBtn = page.getByRole("button", { name: /create|new/i });
    await expect(createBtn.or(page.getByText(/campaign/i))).toBeVisible({ timeout: 10000 });
  });

  test("unauthenticated user is redirected to login", async ({ page }) => {
    // Clear any existing auth state
    await page.context().clearCookies();

    await page.goto("/outbound");
    await page.waitForLoadState("networkidle");

    // Should redirect to login or show auth-required state
    await expect(page).toHaveURL(/login|auth|signin/, { timeout: 10000 });
  });

  test("create campaign modal opens and validates", async ({ page }) => {
    test.skip(
      !(process.env.E2E_USER_EMAIL || process.env.E2E_TEST_EMAIL),
      "Requires authentication",
    );

    await loginIfCredentials(page);

    await page.goto("/outbound");
    await page.waitForLoadState("networkidle");

    // Click CAMPAIGNS tab if present
    const campaignsTab = page.getByRole("button", { name: /campaigns/i });
    if (await campaignsTab.isVisible().catch(() => false)) {
      await campaignsTab.click();
    }

    // Open create campaign modal - flexible selector
    const createBtn = page.getByRole("button", { name: /new/i });
    await expect(createBtn).toBeVisible({ timeout: 10000 });
    await createBtn.click();

    // Check modal appears with name input
    const nameInput = page.getByPlaceholder(/campaign name/i);
    await expect(nameInput).toBeVisible({ timeout: 5000 });
  });

  test("upload empty CSV shows error", async ({ page }) => {
    await loginIfCredentials(page);

    await page.goto("/outbound");
    await page.waitForLoadState("networkidle");

    // Switch to bulk upload mode if not already
    const bulkTab = page.getByRole("button", { name: /bulk|upload/i }).first();
    if (await bulkTab.isVisible().catch(() => false)) {
      await bulkTab.click();
    }

    // Upload empty CSV file
    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.isVisible().catch(() => false)) {
      await fileInput.setInputFiles({
        name: "empty.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(""),
      });

      // Should show error about empty or invalid file
      await expect(page.getByText(/error|invalid|empty|no valid/i).first()).toBeVisible({
        timeout: 5000,
      });
    } else {
      test.skip(true, "File upload not available");
    }
  });

  test("full campaign flow: create, upload leads, and launch", async ({ page }) => {
    await loginIfCredentials(page);

    const campaignName = `E2E Test Campaign ${Date.now()}`;

    // 1. Navigate to outbound dialer
    await page.goto("/outbound");

    // 2. Click CAMPAIGNS tab, then create campaign
    const campaignsTab = page.getByRole("button", { name: /campaigns/i });
    await expect(campaignsTab).toBeVisible();
    await campaignsTab.click();

    // Look for create/new button
    const createBtn = page.getByRole("button", { name: /new/i });
    await expect(createBtn).toBeVisible();
    await createBtn.click();

    // Fill campaign name
    const nameInput = page.getByPlaceholder(/campaign name/i);
    await expect(nameInput).toBeVisible();
    await nameInput.fill(campaignName);

    // Save campaign
    const saveBtn = page.getByRole("button", { name: /create|save/i });
    await saveBtn.click();

    // 3. Wait for campaign to appear in list
    await expect(page.getByText(campaignName)).toBeVisible();

    // 4. Upload leads via CSV
    const csvContent = `name,customer_number\nTest Lead,15551234567\n`;
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "leads.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvContent),
    });

    // 5. Select the campaign and launch
    const campaignCard = page.getByText(campaignName).locator("..").locator("..");
    await campaignCard.click();

    // Look for launch button
    const launchBtn = page.getByRole("button", { name: /launch|start|run/i });
    if (await launchBtn.isVisible().catch(() => false)) {
      await launchBtn.click();

      // Verify campaign shows as running or launched
      await expect(page.getByText(/running|launched|started|active/i).first()).toBeVisible();
    }

    // 6. Verify campaign analytics or status is visible
    await expect(page.getByText(/leads|dialed|connected|status/i).first()).toBeVisible();
  });

  test("stop campaign halts dialing", async ({ page }) => {
    await loginIfCredentials(page);

    await page.goto("/outbound");

    // Find a running campaign if exists
    const stopBtn = page.getByRole("button", { name: /stop|pause|halt/i });

    // If there's a running campaign, test stopping it
    if (
      await stopBtn
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await stopBtn.first().click();

      // Verify stop confirmation or state change
      await expect(page.getByText(/stopped|paused|completed/i).first()).toBeVisible();
    } else {
      // Skip if no running campaigns
      test.skip(true, "No running campaigns to stop");
    }
  });

  test("campaign detail shows lead list", async ({ page }) => {
    await loginIfCredentials(page);

    await page.goto("/outbound");

    // Click first campaign if exists
    const campaignItems = page.locator("[data-campaign-item]");
    if ((await campaignItems.count()) > 0) {
      await campaignItems.first().click();

      // Verify lead table or list is visible
      await expect(page.getByText(/leads?|phone|number|status/i).first()).toBeVisible();
    } else {
      test.skip(true, "No campaigns to view");
    }
  });
});
