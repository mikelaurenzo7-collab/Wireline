import { expect, test } from "@playwright/test";
import { USAGE_PLAN } from "../../src/lib/plan-catalog";

const user = { id: "new-plan-owner", email: "plan-owner@example.test" };

for (const selectedPlan of [false, true]) {
  test(`a fresh ${selectedPlan ? "Lite" : "ordinary"} signup goes directly to plan review`, async ({
    page,
  }) => {
    let signedIn = false;
    let planConfirmed = false;
    const checkoutRequests: unknown[] = [];
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      switch (path) {
        case "/api/auth/signup":
          signedIn = true;
          return route.fulfill({ status: 201, json: { user } });
        case "/api/auth/session":
          return route.fulfill({ json: { user: signedIn ? user : null } });
        case "/api/billing/plans":
          return route.fulfill({
            json: {
              stripe_configured: true,
              checkout_available: true,
              usage_checkout_available: true,
              usage_tiers: ["lite", "standard", "plus"],
              billing_model: "usage",
              plans: [
                {
                  ...USAGE_PLAN,
                  configured: true,
                  annual_configured: false,
                  contact_sales: false,
                  checkout_availability: "available",
                  pricing_model: "usage",
                },
              ],
            },
          });
        case "/api/billing/status":
          return route.fulfill({
            json: {
              stripe_configured: true,
              email_verified: true,
              agent_count: 0,
              phone_lines_used: 0,
              channel_entitlements: { channels: planConfirmed ? ["voice", "email"] : [] },
              subscription: planConfirmed
                ? { plan_id: "usage", status: "active", has_subscription: true }
                : null,
            },
          });
        case "/api/billing/usage-spend":
          return route.fulfill({ json: { enabled: true, usage_account: false } });
        case "/api/billing/checkout":
          checkoutRequests.push(request.postDataJSON());
          return route.fulfill({
            json: { url: "/settings/billing?billing=success&session_id=cs_test_plan_setup" },
          });
        case "/api/billing/checkout/verify":
          planConfirmed = true;
          return route.fulfill({ json: { synced: true, payment_status: "paid" } });
        default:
          return route.fulfill({
            json: {
              accounts: [],
              agents: [],
              balance_usd: 0,
              data: [],
              ledger: [],
              numbers: [],
            },
          });
      }
    });

    await page.setViewportSize({ width: selectedPlan ? 390 : 320, height: 844 });
    await page.goto(
      selectedPlan
        ? "/signup?plan=usage&tier=lite&number=0&email_address=1&template=front-desk"
        : "/signup",
    );
    await page.getByRole("checkbox", { name: /I agree to the Terms and Privacy Policy/ }).check();
    await page.getByLabel("Email", { exact: true }).fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill("E2E-Plan-Selection-72!");
    await page.locator('form button[type="submit"]').click();

    await expect(page).toHaveURL(/\/settings\/billing\?.*onboarding=1/);
    await expect(page.getByRole("heading", { name: "Choose a Plan", exact: true })).toBeVisible();
    const offer = page.getByRole("region", { name: "Subscription Plans" });
    await expect(offer).toBeVisible();
    await expect(offer.getByRole("radio", { name: /^Lite/ })).toBeAttached();
    await expect(offer.getByRole("radio", { name: /^Starter/ })).toBeAttached();
    await expect(offer.getByRole("radio", { name: /^Plus/ })).toBeAttached();
    await expect(
      offer.getByRole("radio", { name: selectedPlan ? /^Lite/ : /^Starter/ }),
    ).toBeChecked();
    expect(checkoutRequests).toEqual([]);

    if (selectedPlan) {
      await expect(offer.getByRole("checkbox", { name: /^Extra Email Address/ })).toBeChecked();
      await expect(offer.getByRole("checkbox", { name: /^Extra Number/ })).not.toBeChecked();
      await offer.getByRole("button", { name: "Review Plan", exact: true }).click();
      await expect(page.getByText("Plan Confirmed", { exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "Choose Your Number" })).toHaveCount(0);
      await page.getByRole("link", { name: "Create Your Bot", exact: true }).click();
      await expect(page).toHaveURL(/\/studio\?create=1&template=front-desk$/);
      expect(checkoutRequests).toEqual([
        {
          plan_id: "usage",
          interval: "month",
          usage_tier: "lite",
          addons: { number: 0, email_address: 1 },
        },
      ]);
    } else {
      await page.getByRole("link", { name: "Set Up a Bot First", exact: true }).click();
      await expect(page).toHaveURL(/\/studio\?create=1$/);
      expect(checkoutRequests).toEqual([]);
    }
    await expect(page.getByRole("dialog", { name: "What Should Your Bot Do?" })).toBeVisible();
  });
}
