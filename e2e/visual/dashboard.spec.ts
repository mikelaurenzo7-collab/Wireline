import { test, expect } from "@playwright/test";

/**
 * Visual regression tests for Dashboard
 * Screenshots compared against baseline
 */
test.describe("Dashboard Visual Regression", () => {
  test.beforeEach(async ({ page }) => {
    // Mock auth or login before each test
    await page.goto("/login");
    // Add auth mocking here if needed
  });

  test("dashboard layout - desktop", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveScreenshot("dashboard-desktop.png", {
      fullPage: false,
      clip: { x: 0, y: 0, width: 1280, height: 800 },
    });
  });

  test("dashboard layout - mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveScreenshot("dashboard-mobile.png", {
      fullPage: false,
    });
  });
});
