import { expect, test } from "@playwright/test";

/**
 * Fast Start activation spine: sign-up is reachable, and the old onboarding
 * link opens the Workspace, where a new account meets its Bot.
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

test("onboarding route resolves to the Workspace", async ({ page }) => {
  const response = await page.goto("/onboarding", {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  expect(response?.status()).toBeLessThan(500);
  await page.waitForURL(/\/(studio|signin)/, { timeout: 20_000 });
  const url = page.url();
  expect(url).toMatch(/\/studio(?:\?|$)|\/signin/);
  expect(url).not.toContain("create=1");
});
