import { test, expect } from "@playwright/test";
import { dismissCookieNotice, signInSubmitButton } from "../helpers/auth";
import { expectNoViewCrash } from "../helpers/shell";

test.describe("Campaign & outbound (unauthenticated)", () => {
  test("outbound dialer shows sign-in when logged out", async ({ page }) => {
    await page.context().clearCookies();
    await page.addInitScript(() => {
      try {
        localStorage.removeItem("wireline_session");
      } catch {
        /* ignore */
      }
    });

    await page.goto("/outbound");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 15_000 });
    await expect(signInSubmitButton(page)).toBeVisible();
  });
});

test.describe("Campaign & outbound @auth-desktop", () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(90_000);
    await dismissCookieNotice(page);
  });

  test("outbound page loads authenticated shell", async ({ page }) => {
    await page.goto("/outbound");
    await page.waitForLoadState("domcontentloaded");
    await expectNoViewCrash(page);
    await expect(page.getByText(/outbound|campaign|dial|WIRELINE/i).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test("create campaign modal opens", async ({ page }) => {
    await page.goto("/outbound");
    await page.waitForLoadState("networkidle").catch(() => {});

    const campaignsTab = page.getByRole("button", { name: /campaigns/i });
    if (await campaignsTab.isVisible().catch(() => false)) {
      await campaignsTab.click();
    }

    const createBtn = page.getByRole("button", { name: /new/i }).first();
    await expect(createBtn).toBeVisible({ timeout: 15_000 });
    await createBtn.click();

    const nameInput = page.locator("input").first();
    await expect(nameInput).toBeVisible({ timeout: 10_000 });
  });

  test("upload empty CSV shows error", async ({ page }) => {
    await page.goto("/outbound");
    await page.waitForLoadState("networkidle").catch(() => {});

    const bulkTab = page.getByRole("button", { name: /bulk|upload/i }).first();
    if (await bulkTab.isVisible().catch(() => false)) {
      await bulkTab.click();
    }

    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.isVisible().catch(() => false)) {
      await fileInput.setInputFiles({
        name: "empty.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(""),
      });
      await expect(page.getByText(/error|invalid|empty|no valid/i).first()).toBeVisible({
        timeout: 10_000,
      });
    } else {
      test.skip(true, "File upload control not visible");
    }
  });

  test("full campaign flow: create, upload leads", async ({ page }) => {
    const campaignName = `E2E Campaign ${Date.now()}`;

    await page.goto("/outbound");
    const campaignsTab = page.getByRole("button", { name: /campaigns/i });
    await expect(campaignsTab).toBeVisible({ timeout: 15_000 });
    await campaignsTab.click();

    const createBtn = page.getByRole("button", { name: /new/i }).first();
    await expect(createBtn).toBeVisible();
    await createBtn.click();

    const nameInput = page.locator("input").first();
    await expect(nameInput).toBeVisible();
    await nameInput.fill(campaignName);

    const saveBtn = page.getByRole("button", { name: /create|save/i });
    await saveBtn.click();

    await expect(page.getByText(campaignName)).toBeVisible({ timeout: 20_000 });

    const csvContent = `name,customer_number\nTest Lead,15551234567\n`;
    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.isVisible().catch(() => false)) {
      await fileInput.setInputFiles({
        name: "leads.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(csvContent),
      });
    }
  });
});
