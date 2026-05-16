import { test, expect } from "@playwright/test";
import { dismissCookieNotice } from "../helpers/auth";

/**
 * Visual regression for the authenticated dashboard (requires E2E creds + setup project).
 */
test.describe("Dashboard visual @auth-desktop", () => {
  test.beforeEach(async ({ page }) => {
    await dismissCookieNotice(page);
  });

  test("dashboard layout - desktop", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle").catch(() => {});

    await expect(page.locator("main").first()).toBeVisible({ timeout: 20_000 });
    if (!process.env.CI) {
      await expect(page).toHaveScreenshot("dashboard-desktop.png", {
        fullPage: false,
        clip: { x: 0, y: 0, width: 1280, height: 800 },
        maxDiffPixelRatio: 0.04,
      });
    }
  });

  test("dashboard layout - mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle").catch(() => {});

    await expect(page.locator("main").first()).toBeVisible({ timeout: 20_000 });
    if (!process.env.CI) {
      await expect(page).toHaveScreenshot("dashboard-mobile.png", {
        fullPage: false,
        clip: { x: 0, y: 0, width: 375, height: 812 },
        maxDiffPixelRatio: 0.04,
      });
    }
  });
});
