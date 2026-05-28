import { test, expect } from "@playwright/test";

/**
 * Signup intent capture — purposeful userflows.
 *
 * Outbound campaigns and pricing CTAs hand the signup form a plan and a
 * vertical "wedge" via query params; the form must reflect that intent back
 * to the prospect ("From your visit · pro plan · medical") so the flow feels
 * personalised and continuous rather than a cold restart.
 */

const PLANS = ["personal", "starter", "pro", "business"] as const;
const WEDGES = [
  "home-services",
  "medical",
  "legal",
  "real-estate",
  "insurance",
  "restaurants",
  "sales",
] as const;

test.describe("Signup — intent reflection", () => {
  test("plan + wedge are echoed back on the signup card", async ({ page }) => {
    await page.goto("/signup?plan=pro&wedge=medical&utm_source=linkedin");

    await expect(page.getByRole("heading", { level: 1, name: /create account/i })).toBeVisible();
    await expect(page.getByText(/from your visit/i)).toBeVisible();
    await expect(page.getByText(/pro plan/i)).toBeVisible();
    await expect(page.getByText(/medical/i)).toBeVisible();

    await expect(page.getByPlaceholder(/you@company\.com/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /create account/i })).toBeVisible();
  });

  for (const plan of PLANS) {
    test(`plan=${plan} is reflected in the intent label`, async ({ page }) => {
      await page.goto(`/signup?plan=${plan}`);
      await expect(page.getByText(new RegExp(`${plan} plan`, "i"))).toBeVisible();
    });
  }

  for (const wedge of WEDGES) {
    test(`wedge=${wedge} is reflected in the intent label`, async ({ page }) => {
      await page.goto(`/signup?wedge=${wedge}`);
      const spaced = wedge.replace(/-/g, " ");
      await expect(page.getByText(new RegExp(spaced, "i")).first()).toBeVisible();
    });
  }

  test("a bare signup (no intent) still presents the create-account form", async ({ page }) => {
    await page.goto("/signup");

    await expect(page.getByRole("heading", { level: 1, name: /create account/i })).toBeVisible();
    await expect(page.getByText(/from your visit/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /create account/i })).toBeVisible();
  });
});

test.describe("Signin — surface", () => {
  test("signin renders the welcome-back form", async ({ page }) => {
    await page.goto("/signin");

    await expect(page.getByRole("heading", { level: 1, name: /welcome back/i })).toBeVisible();
    await expect(page.getByPlaceholder(/you@company/i).first()).toBeVisible();
    await expect(page.locator("form").getByRole("button", { name: /sign in/i })).toBeVisible();
  });
});

test.describe("Pricing → signup continuity", () => {
  test("clicking a pricing tier CTA lands on signup carrying that plan", async ({ page }) => {
    await page.goto("/pricing");

    const cta = page.getByRole("link", { name: /start free trial/i }).first();
    const href = await cta.getAttribute("href");
    expect(href).toMatch(/\/signup\?plan=/);

    await cta.click();
    await expect(page).toHaveURL(/\/signup\?plan=(personal|starter|pro|business)/);
    await expect(page.getByText(/from your visit/i)).toBeVisible();
  });
});
