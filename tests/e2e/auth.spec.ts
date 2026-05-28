import { test, expect } from "@playwright/test";

test.describe("Authentication Flows", () => {
  test("Landing page loads and links to sign-in", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/Wireline/);
    await expect(page.getByTestId("landing-hero")).toBeVisible();
    await expect(page.getByTestId("landing-sign-in")).toBeVisible();
  });

  test("Sign-in page loads and has correct title", async ({ page }) => {
    await page.goto("/login");

    await expect(page).toHaveTitle(/Sign In/i);

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
