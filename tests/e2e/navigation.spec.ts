import { test, expect } from "@playwright/test";
import { openPublicMobileNav } from "../helpers/ui";

/**
 * Public navigation — comfortable, predictable wayfinding.
 *
 * The marketing header is the spine of the prospect journey. These tests
 * assert the desktop nav routes correctly, the logo always returns home,
 * and the mobile hamburger overlay opens, navigates, and closes cleanly.
 */
const NAV = [
  { label: "Pricing", path: "/pricing" },
  { label: "Demos", path: "/showcase" },
  { label: "Compare", path: "/compare" },
  { label: "About", path: "/about" },
] as const;

test.describe("Desktop navigation", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const item of NAV) {
    test(`header link "${item.label}" routes to ${item.path}`, async ({ page }) => {
      await page.goto("/");
      const nav = page.locator("nav[aria-label='Site']");
      await nav.getByRole("link", { name: new RegExp(`^${item.label}$`, "i") }).click();
      await expect(page).toHaveURL((url) => url.pathname === item.path);
    });
  }

  test("logo returns to the landing page", async ({ page }) => {
    await page.goto("/pricing");
    await page.getByTestId("header-logo").click();
    await expect(page).toHaveURL(/\/$|\/\?/);
  });
});

test.describe("Mobile navigation", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("hamburger opens an accessible nav dialog", async ({ page }) => {
    await page.goto("/");

    const toggle = page.getByTestId("mobile-menu-toggle");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    await openPublicMobileNav(page);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  test("mobile nav navigates and the overlay dismisses", async ({ page }) => {
    await page.goto("/");
    await openPublicMobileNav(page);

    const dialog = page.getByRole("dialog", { name: "Site navigation" });
    await dialog.getByRole("link", { name: /^pricing$/i }).click();

    await expect(page).toHaveURL(/\/pricing/);
    await expect(page.getByRole("dialog", { name: "Site navigation" })).toBeHidden();
  });

  test("mobile nav exposes both sign-in and start-trial", async ({ page }) => {
    await page.goto("/");
    await openPublicMobileNav(page);

    const dialog = page.getByRole("dialog", { name: "Site navigation" });
    await expect(dialog.getByRole("link", { name: /^sign in$/i })).toBeVisible();
    await expect(dialog.getByRole("link", { name: /start free trial/i })).toBeVisible();
  });
});
