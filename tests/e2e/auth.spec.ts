import { test, expect } from "@playwright/test";

test.describe("Authentication Flows", () => {
  test("Sign-in page loads and has correct title", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/Wireline/);

    const emailInput = page.getByPlaceholder(/operator@company.io/i).first();
    await expect(emailInput).toBeVisible();

    const submitBtn = page.locator("form").getByRole("button", { name: /sign in/i });
    await expect(submitBtn).toBeVisible();
  });

  test("Signup page captures pricing and wedge intent", async ({ page }) => {
    await page.goto("/signup?plan=pro&wedge=medical&utm_source=linkedin");

    const emailInput = page.getByPlaceholder(/operator@company.io/i).first();
    await expect(emailInput).toBeVisible();

    await expect(page.getByText(/matched from your visit.*pro plan.*medical/i)).toBeVisible();

    const submitBtn = page.getByRole("button", { name: /create account/i });
    await expect(submitBtn).toBeVisible();
  });
});
