import { test, expect } from "@playwright/test";

test("marketing home loads", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Wireline/i);
  await expect(page.getByRole("link", { name: /get started|sign up|pricing/i }).first()).toBeVisible();
});
