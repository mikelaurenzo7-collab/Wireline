import { expect, test } from "@playwright/test";

const publicRoutes = [
  "/",
  "/features",
  "/pricing",
  "/showcase",
  "/compare",
  "/for/personal",
  "/for/home-services",
  "/for/medical",
  "/for/legal",
  "/for/real-estate",
  "/for/insurance",
  "/for/restaurants",
  "/for/sales",
  "/about",
  "/blog",
  "/security",
  "/status",
  "/support",
  "/contact",
  "/privacy",
  "/terms",
] as const;

const authRoutes = ["/signup", "/signin"] as const;

const workspaceRoutes = [
  "/overview",
  "/studio",
  "/knowledge",
  "/templates",
  "/inbox",
  "/call-logs",
  "/connections",
  "/settings",
  "/settings/apps",
  "/settings/billing",
  "/settings/phone",
  "/settings/team",
] as const;

const launchRoutes = [...publicRoutes, ...authRoutes, ...workspaceRoutes] as const;

const fatalShellText = /Cannot GET|Application error|Internal Server Error|Unhandled Runtime Error/i;

test.describe("launch route health", () => {
  for (const path of launchRoutes) {
    test(`${path} returns a live app shell`, async ({ page }) => {
      const response = await page.goto(path, { waitUntil: "domcontentloaded" });

      expect(response, `${path} produced a response`).toBeTruthy();
      expect(response!.status(), `${path} should not server-error`).toBeLessThan(500);

      await expect(page.locator("body")).toBeVisible();
      await expect(page.locator("body")).not.toContainText(fatalShellText);
    });
  }
});
