import { test, expect } from "@playwright/test";

test.describe("Authentication Flows", () => {
  test("Landing page loads and links to auth", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/Wireline/);
    await expect(page.getByRole("link", { name: /start free trial/i }).first()).toBeVisible();

    const headerSignIn = page.locator("header").getByRole("link", { name: /^sign in$/i });
    if (await headerSignIn.isVisible()) {
      await expect(headerSignIn).toBeVisible();
    } else {
      await page.getByRole("button", { name: /open menu/i }).click();
      await expect(
        page
          .getByRole("dialog", { name: "Site navigation" })
          .getByRole("link", { name: /^sign in$/i }),
      ).toBeVisible();
    }
  });

  test("Sign-in page loads and has correct title", async ({ page }) => {
    await page.goto("/signin");

    await expect(page).toHaveTitle(/Wireline/);

    const emailInput = page.getByPlaceholder(/you@company/i).first();
    await expect(emailInput).toBeVisible();

    const submitBtn = page.locator("form").getByRole("button", { name: /sign in/i });
    await expect(submitBtn).toBeVisible();
  });

  test("Signup page captures pricing and wedge intent", async ({ page }) => {
    await page.goto("/signup?plan=pro&wedge=medical&utm_source=linkedin");

    const emailInput = page.getByPlaceholder(/you@company.com/i).first();
    await expect(emailInput).toBeVisible();

    await expect(page.getByText(/from your visit.*pro plan.*medical/i)).toBeVisible();

    const submitBtn = page.getByRole("button", { name: /create account/i });
    await expect(submitBtn).toBeVisible();
  });
});
