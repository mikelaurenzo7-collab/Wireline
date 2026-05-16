import { test, expect } from "@playwright/test";
import { hasE2eCredentials, loginAsTestUser } from "../fixtures/auth";

/**
 * Thin navigation smoke: authenticated shells render without runtime errors.
 * Catches broken routes, lazy-import failures, and auth/session regressions.
 */
test.describe("Authenticated hub navigation", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!hasE2eCredentials(), "Set E2E_USER_EMAIL + E2E_USER_PASSWORD (or E2E_TEST_*)");
    await loginAsTestUser(page);
  });

  test("dashboard shell", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText(/dashboard|overview|metrics/i).first()).toBeVisible({
      timeout: 25_000,
    });
  });

  test("call logs shell", async ({ page }) => {
    await page.goto("/logs");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText(/call|log|history|transcript/i).first()).toBeVisible({
      timeout: 25_000,
    });
  });

  test("outbound hub shell", async ({ page }) => {
    await page.goto("/outbound");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText(/outbound|campaign|dial|lead/i).first()).toBeVisible({
      timeout: 25_000,
    });
  });

  test("admin settings opens carrier voice panel", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForLoadState("domcontentloaded");
    await page.getByRole("tab", { name: /^carrier$/i }).click();
    await expect(
      page.getByText(/wireline phone numbers|wireline voice network/i).first(),
    ).toBeVisible({
      timeout: 25_000,
    });
  });
});
