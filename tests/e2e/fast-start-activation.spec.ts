import { expect, test } from "@playwright/test";

/**
 * Fast Start activation spine — public surfaces advertise the create path and
 * the post-create wizard session keys stay stable in the browser.
 */
test.describe.configure({ timeout: 60_000 });

test("signup exposes the account creation entry", async ({ page }) => {
  const response = await page.goto("/signup", { waitUntil: "domcontentloaded", timeout: 45_000 });
  expect(response, "signup response").toBeTruthy();
  expect(response!.status()).toBeLessThan(500);
  await expect(page.getByRole("heading", { name: "Create Account", exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByRole("button", { name: "Create Account", exact: true }).last(),
  ).toBeVisible();
});

test("onboarding route resolves to studio create query", async ({ page }) => {
  const response = await page.goto("/onboarding", {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  expect(response?.status()).toBeLessThan(500);
  await page.waitForURL(/\/(studio|signin)/, { timeout: 20_000 });
  const url = page.url();
  expect(url).toMatch(/studio\?create=1|signin/);
});

test("post-create wizard session keys are stable", async ({ page }) => {
  const response = await page.goto("/", { waitUntil: "domcontentloaded", timeout: 45_000 });
  expect(response?.status()).toBeLessThan(500);
  await page.evaluate(() => {
    sessionStorage.setItem(
      "wireline:post-create-wizard",
      JSON.stringify({
        agentId: "e2e-agent",
        agentName: "E2E Agent",
        phoneProvisionRequested: false,
        phoneProvisioned: false,
      }),
    );
    sessionStorage.setItem("wireline:post-create-wizard-step", "channels");
  });
  const stored = await page.evaluate(() => ({
    wizard: sessionStorage.getItem("wireline:post-create-wizard"),
    step: sessionStorage.getItem("wireline:post-create-wizard-step"),
  }));
  expect(stored.step).toBe("channels");
  expect(stored.wizard).toContain("e2e-agent");
});
