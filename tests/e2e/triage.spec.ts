import { test, expect } from "@playwright/test";

test.describe("Triage Inbox", () => {
  test("Triage page requires authentication", async ({ page }) => {
    await page.goto("/triage");

    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
    await expect(page.locator("form").getByRole("button", { name: /sign in/i })).toBeVisible();
  });
});
