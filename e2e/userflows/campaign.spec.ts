import { test, expect, type Page } from "@playwright/test";
import { hasE2eCredentials, loginAsTestUser } from "../fixtures/auth";

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

  const loginIfCredentials = async (page: Page) => {
    if (!hasE2eCredentials()) {
      test.skip(true, "No E2E test credentials configured");
      return;
    }
    await loginAsTestUser(page);
    await expect(page.locator("nav, aside").first()).toBeVisible({ timeout: 10_000 });
  };

  test("outbound dialer page renders for signed-in operator", async ({ page }) => {
    test.skip(!hasE2eCredentials(), "Requires authentication");
    await loginIfCredentials(page);
    await page.goto("/outbound");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByText(/outbound|campaign|dial|lead/i).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test("unauthenticated outbound URL shows auth shell", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/outbound");
    await page.waitForLoadState("domcontentloaded");

    await expect(page).toHaveURL("/outbound");
    await expect(page.getByText(/welcome back|sign in/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("create campaign modal opens and validates", async ({ page }) => {
    test.skip(!hasE2eCredentials(), "Requires authentication");

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

    // Check modal appears with name input (placeholder is "Q4 Win-Back Drive")
    const nameInput = page.locator("input").first();
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

    // Fill campaign name (placeholder shows "Q4 Win-Back Drive")
    const nameInput = page.locator("input").first();
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
