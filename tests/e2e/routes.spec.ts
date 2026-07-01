import { expect, test } from "@playwright/test";

const coreRoutes = [
  "/",
  "/signup",
  "/signin",
  "/for/personal",
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

test.describe("core route health", () => {
  for (const path of coreRoutes) {
    test(`${path} returns a live app shell`, async ({ page }) => {
      const response = await page.goto(path, { waitUntil: "domcontentloaded" });

      expect(response, `${path} produced a response`).toBeTruthy();
      expect(response!.status(), `${path} should not server-error`).toBeLessThan(500);

      await expect(page.locator("body")).toBeVisible();
      await expect(page.locator("body")).not.toContainText(/Cannot GET|Application error|Internal Server Error/i);
    });
  }
});
