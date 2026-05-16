import { test, expect } from "@playwright/test";
import { dismissCookieNotice } from "../helpers/auth";

test.describe("Component visual (login)", () => {
  test("login form component", async ({ page }) => {
    await page.goto("/login");
    await dismissCookieNotice(page);

    const loginForm = page.locator("form").first();
    await expect(loginForm).toBeVisible();
    if (!process.env.CI) {
      await expect(loginForm).toHaveScreenshot("login-form.png", { maxDiffPixelRatio: 0.04 });
    }
  });
});

test.describe("Component visual @auth-desktop", () => {
  test.beforeEach(async ({ page }) => {
    await dismissCookieNotice(page);
  });

  test("main shell on dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle").catch(() => {});

    const main = page.locator("main").first();
    await expect(main).toBeVisible({ timeout: 20_000 });
    if (!process.env.CI) {
      await expect(main).toHaveScreenshot("main-dashboard.png", { maxDiffPixelRatio: 0.04 });
    }
  });

  test("keyboard shortcuts overlay", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("domcontentloaded");
    await page.keyboard.press("?");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5000 });
    if (!process.env.CI) {
      await expect(dialog).toHaveScreenshot("shortcuts-dialog.png", { maxDiffPixelRatio: 0.04 });
    }
    await page.keyboard.press("Escape");
  });
});
