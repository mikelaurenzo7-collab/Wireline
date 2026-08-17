import { expect, test } from "@playwright/test";

const email = process.env.WIRELINE_E2E_EMAIL?.trim();
const password = process.env.WIRELINE_E2E_PASSWORD;

const GOLD_ROUTES = [
  { path: "/overview", eyebrow: /Overview|Good/i, marker: ".wl-overview-greeting" },
  { path: "/phone?tab=logs", eyebrow: /Place outbound call/i, marker: ".wl-operate-surface" },
  {
    path: "/studio?create=1",
    eyebrow: /Create|Agent|Studio/i,
    marker: ".wl-composer-dock, .wl-paper",
  },
] as const;

const VIEWPORTS = [
  { name: "phone-375", width: 375, height: 812 },
  { name: "desktop-1280", width: 1280, height: 900 },
] as const;

test.describe("Design gold screens", () => {
  test.skip(!email || !password, "Set WIRELINE_E2E_EMAIL and WIRELINE_E2E_PASSWORD");

  test.beforeEach(async ({ page }) => {
    await page.goto("/signin", { waitUntil: "domcontentloaded" });
    await page.getByLabel(/email/i).fill(email!);
    await page.getByLabel(/password/i).fill(password!);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/(overview|studio|onboarding)/, { timeout: 30_000 });
  });

  for (const viewport of VIEWPORTS) {
    for (const route of GOLD_ROUTES) {
      test(`${viewport.name} — ${route.path} carries Letterpress markers`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(route.path, { waitUntil: "domcontentloaded" });
        await expect(page.locator(route.marker).first()).toBeVisible({ timeout: 20_000 });
        await expect(page.getByText(route.eyebrow).first()).toBeVisible({ timeout: 20_000 });
        await expect(page).toHaveScreenshot(
          `gold-${viewport.name}-${route.path.replace(/[^a-z0-9]+/gi, "-")}.png`,
          {
            fullPage: true,
            maxDiffPixelRatio: 0.02,
          },
        );
      });
    }
  }
});
