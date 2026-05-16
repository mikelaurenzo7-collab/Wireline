import { test, expect } from "@playwright/test";
import { dismissCookieNotice } from "../helpers/auth";
import { expectNoViewCrash } from "../helpers/shell";

/**
 * Agents / fleet flows against the real FleetSettings UI (no /agents/new route).
 */
test.describe("Voice & fleet @auth-desktop", () => {
  test.beforeEach(async ({ page }) => {
    await dismissCookieNotice(page);
  });

  test("Agents page loads templates and fleet tabs", async ({ page }) => {
    await page.goto("/agents");
    await expectNoViewCrash(page);
    await expect(page.getByRole("tab", { name: /Templates/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /My Fleet/i })).toBeVisible();
  });

  test("My Fleet shows create-agent panel", async ({ page }) => {
    await page.goto("/agents");
    await page.getByRole("tab", { name: /My Fleet/i }).click();
    await expectNoViewCrash(page);
    await expect(page.getByText(/Create a new agent/i)).toBeVisible({ timeout: 15_000 });
  });
});
