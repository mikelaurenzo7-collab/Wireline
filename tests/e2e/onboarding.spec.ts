import { test, expect } from "@playwright/test";

test.describe("Onboarding Flow", () => {
  test("Onboarding route is protected for unauthenticated visitors", async ({ page }) => {
    await page.goto("/onboarding");

    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
    await expect(page.locator("form").getByRole("button", { name: /sign in/i })).toBeVisible();
  });
});
