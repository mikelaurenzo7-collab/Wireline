import { test, expect } from "@playwright/test";
import { hasE2eCredentials, loginAsTestUser } from "../fixtures/auth";

/**
 * Voice / fleet agent flows (real routes: /agents → FleetSettings).
 */
test.describe("Fleet agent flows", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!hasE2eCredentials(), "Set E2E_USER_EMAIL + E2E_USER_PASSWORD (or E2E_TEST_*)");
    await loginAsTestUser(page);
  });

  test("fleet page loads and can switch to My Fleet", async ({ page }) => {
    await page.goto("/agents");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByRole("tab", { name: /my fleet/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("tab", { name: /my fleet/i }).click();

    await expect(page.getByText(/create a new agent/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /create agent/i })).toBeVisible();
  });

  test("create voice agent when subscription allows", async ({ page }) => {
    test.setTimeout(90_000);

    const suffix = `${Date.now()}`.slice(-8);
    const agentId = `e2e-voice-${suffix}`;
    const agentName = `E2E Voice ${suffix}`;

    await page.goto("/agents");
    await page.getByRole("tab", { name: /my fleet/i }).click();

    await page.getByPlaceholder("e.g. sales-bot-1").fill(agentId);
    await page.getByPlaceholder("e.g. Sophie").fill(agentName);

    await page.getByRole("button", { name: /create agent/i }).click();

    const outcome = page.getByText(
      /agent deployed|subscription required|fleet capacity reached|deployment failed|access denied/i,
    );
    await expect(outcome.first()).toBeVisible({ timeout: 25_000 });

    if (
      await page
        .getByText(/subscription required/i)
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "E2E tenant needs active subscription to create agents");
    }
    if (
      await page
        .getByText(/fleet capacity reached/i)
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "E2E tenant at max agents — cannot add another");
    }
    if (
      await page
        .getByText(/deployment failed|access denied/i)
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      throw new Error("Agent creation failed — check API response / entitlements");
    }

    await expect(page.getByText(agentName).first()).toBeVisible({ timeout: 15_000 });
  });
});
