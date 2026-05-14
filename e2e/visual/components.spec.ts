import { test, expect } from "@playwright/test";

/**
 * Component-level visual regression tests
 * Isolated component rendering
 */
test.describe("Component Visual Tests", () => {
  test("login form component", async ({ page }) => {
    await page.goto("/login");

    // Focus on just the login form area
    const loginForm = page.locator("form").first();
    await expect(loginForm).toHaveScreenshot("login-form.png");
  });

  test("navigation sidebar - expanded", async ({ page }) => {
    await page.goto("/dashboard");

    const sidebar = page.locator("[data-testid='sidebar'], nav, aside").first();
    if (await sidebar.isVisible()) {
      await expect(sidebar).toHaveScreenshot("sidebar-expanded.png");
    }
  });

  test("modal/dialog styling", async ({ page }) => {
    await page.goto("/dashboard");

    // Try to trigger a modal (e.g., settings or confirmation)
    const settingsButton = page.getByRole("button", { name: /settings/i });
    if (await settingsButton.isVisible().catch(() => false)) {
      await settingsButton.click();
      const modal = page.locator("[role='dialog'], .modal, [data-testid='modal']").first();
      await expect(modal).toBeVisible();
      await expect(modal).toHaveScreenshot("modal-default.png");
    }
  });
});
