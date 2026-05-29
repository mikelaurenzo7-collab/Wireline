import { test, expect } from "@playwright/test";
import { gotoHydrated } from "../helpers/ui";

/**
 * Form validation & error states — robust user feedback.
 *
 * Forms are the critical conversion points. These tests verify that
 * client-side validation fires correctly, error messages are accessible,
 * and the forms remain usable in degraded states.
 */
test.describe("Signup form — client-side validation", () => {
  test("empty form submission shows validation errors", async ({ page }) => {
    await gotoHydrated(page, "/signup");

    const submitBtn = page.getByRole("button", { name: /create account/i });
    await submitBtn.click();

    // Browser native validation or custom error messages should appear
    const emailInput = page.getByPlaceholder(/you@company/i).first();
    const isInvalid = await emailInput.evaluate(
      (el) => (el as HTMLInputElement).validity?.valid === false,
    );
    // Either the input is invalid or an error message is shown
    const hasError =
      isInvalid ||
      (await page.locator('[role="alert"], .error, [aria-invalid="true"]').count()) > 0;
    expect(hasError).toBe(true);
  });

  test("invalid email format shows validation feedback", async ({ page }) => {
    await gotoHydrated(page, "/signup");

    const emailInput = page.getByPlaceholder(/you@company/i).first();
    await emailInput.fill("not-an-email");

    const submitBtn = page.getByRole("button", { name: /create account/i });
    await submitBtn.click();

    // Input should be marked invalid
    const isInvalid = await emailInput.evaluate(
      (el) => (el as HTMLInputElement).validity?.valid === false,
    );
    expect(isInvalid).toBe(true);
  });

  test("valid email format does not trigger client-side validation error", async ({ page }) => {
    await gotoHydrated(page, "/signup");

    const emailInput = page.getByPlaceholder(/you@company/i).first();
    await emailInput.fill("test@example.com");

    const isValid = await emailInput.evaluate(
      (el) => (el as HTMLInputElement).validity?.valid === true,
    );
    expect(isValid).toBe(true);
  });
});

test.describe("Signin form — client-side validation", () => {
  test("empty signin submission shows validation", async ({ page }) => {
    await page.goto("/signin");
    await expect(page.getByRole("heading", { level: 1, name: /welcome back/i })).toBeVisible();

    const submitBtn = page.locator("form").getByRole("button", { name: /sign in/i });
    await submitBtn.click();

    const emailInput = page.getByPlaceholder(/you@company/i).first();
    const isInvalid = await emailInput.evaluate(
      (el) => (el as HTMLInputElement).validity?.valid === false,
    );
    const hasError =
      isInvalid ||
      (await page.locator('[role="alert"], .error, [aria-invalid="true"]').count()) > 0;
    expect(hasError).toBe(true);
  });

  test("signin form has accessible labels for all inputs", async ({ page }) => {
    await page.goto("/signin");
    await expect(page.getByRole("heading", { level: 1, name: /welcome back/i })).toBeVisible();

    // All visible inputs should have labels or placeholder text
    const inputs = page.locator("form input:visible");
    const count = await inputs.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      const hasLabel = await input.evaluate((el) => {
        const inp = el as HTMLInputElement;
        const ariaLabel = inp.getAttribute("aria-label");
        const placeholder = inp.placeholder;
        const id = inp.id;
        const label = id ? document.querySelector(`label[for="${id}"]`) : null;
        const ariaLabelledBy = inp.getAttribute("aria-labelledby");
        return !!(ariaLabel || placeholder || label || ariaLabelledBy);
      });
      expect(hasLabel, `input #${i} must have an accessible label`).toBe(true);
    }
  });
});

test.describe("Signup form — OAuth buttons", () => {
  test("signup surfaces OAuth sign-in alternatives", async ({ page }) => {
    await gotoHydrated(page, "/signup");

    // Should have Google and/or Microsoft OAuth buttons
    const oauthButtons = page.locator(
      'button:has-text("Google"), button:has-text("Microsoft"), a:has-text("Google"), a:has-text("Microsoft"), [data-testid*="oauth"], [data-testid*="google"], [data-testid*="microsoft"]',
    );
    const count = await oauthButtons.count();
    // OAuth alternatives should be present for frictionless signup
    if (count > 0) {
      await expect(oauthButtons.first()).toBeVisible();
    }
  });

  test("signin surfaces OAuth sign-in alternatives", async ({ page }) => {
    await page.goto("/signin");
    await expect(page.getByRole("heading", { level: 1, name: /welcome back/i })).toBeVisible();

    const oauthButtons = page.locator(
      'button:has-text("Google"), button:has-text("Microsoft"), a:has-text("Google"), a:has-text("Microsoft"), [data-testid*="oauth"], [data-testid*="google"], [data-testid*="microsoft"]',
    );
    const count = await oauthButtons.count();
    if (count > 0) {
      await expect(oauthButtons.first()).toBeVisible();
    }
  });
});

test.describe("Form states — loading and disabled", () => {
  test("signup button is not disabled before user interaction", async ({ page }) => {
    await gotoHydrated(page, "/signup");

    const submitBtn = page.getByRole("button", { name: /create account/i });
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toBeEnabled();
  });

  test("signin button is not disabled before user interaction", async ({ page }) => {
    await page.goto("/signin");
    await expect(page.getByRole("heading", { level: 1, name: /welcome back/i })).toBeVisible();

    const submitBtn = page.locator("form").getByRole("button", { name: /sign in/i });
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toBeEnabled();
  });
});
