import { expect, test } from "@playwright/test";
import { USAGE_PLAN } from "../../src/lib/plan-catalog";

test("a retired signup link adopts shared usage without losing its use case", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({
      json:
        path === "/api/billing/plans"
          ? {
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
            }
          : { user: null },
    });
  });
  await page.goto(
    "/signup?plan=personal&interval=year&template=personal-assistant&utm_source=returning",
  );
  await expect(page.getByRole("heading", { name: "Create Account", exact: true })).toBeVisible();
  await expect(page.getByText(/\$24\/month plus usage/)).toBeVisible();
  await expect(page.getByText(/\$12\/month/)).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem("wireline_signup_intent_v1") || "{}")),
    )
    .toMatchObject({
      preferredPlanId: "usage",
      preferredBillingInterval: "month",
      preferredTemplateId: "personal-assistant",
      utmSource: "returning",
    });
  await page.reload();
  await expect(page.getByText(/\$24\/month plus usage/)).toBeVisible();
});

for (const [tier, name, price] of [
  ["lite", "Lite", 12],
  ["standard", "Starter", 24],
  ["plus", "Plus", 49],
] as const) {
  test(`${name} and its extra identities survive signup and reach checkout`, async ({ page }) => {
    let authenticated = false;
    const purchases: unknown[] = [];
    // All API traffic is synthetic. This proves the browser handoff, not a
    // real account creation, payment, or Stripe invoice.
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/billing/checkout") {
        purchases.push(route.request().postDataJSON());
        await route.fulfill({ status: 400, json: { error: "Synthetic checkout stopped." } });
        return;
      }
      const json =
        path === "/api/auth/session"
          ? {
              user: authenticated
                ? { id: "usage-owner", email: "usage@example.test", full_name: "Usage Owner" }
                : null,
            }
          : path === "/api/billing/plans"
            ? {
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
              }
            : path === "/api/billing/status"
              ? {
                  stripe_configured: true,
                  email_verified: true,
                  agent_count: 0,
                  subscription: null,
                }
              : path === "/api/billing/usage-spend"
                ? { enabled: true, usage_account: false }
                : {
                    accounts: [],
                    data: [],
                    agents: [],
                    integrations: [],
                    ledger: [],
                    balance_usd: 0,
                  };
      await route.fulfill({ json });
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/pricing");
    const privacy = page.getByRole("region", { name: "Privacy Choices" });
    await privacy.getByRole("button", { name: "Essential Only", exact: true }).click();
    await page.getByRole("button", { name: new RegExp(`^${name}\\s`) }).click();
    const estimate = page.getByRole("article", { name: "Monthly estimate" });
    await expect(estimate.getByText(`$${price}.00`, { exact: true })).toBeVisible();
    await estimate.getByRole("checkbox", { name: /^Extra Number/i }).uncheck();
    await estimate.getByRole("checkbox", { name: /^Extra Email Address/i }).check();
    await estimate.getByRole("link", { name: `Get ${name}`, exact: true }).click();
    await expect(page).toHaveURL(
      new RegExp(`/signup\\?plan=usage&interval=month&tier=${tier}&number=0&email_address=1$`),
    );
    await expect(page.getByRole("heading", { name: "Create Account", exact: true })).toBeVisible();

    authenticated = true;
    // No query parameters here: Billing must recover the signup choice.
    await page.goto("/settings/billing");
    const offer = page.getByRole("region", { name: "Pay for what you use" });
    await expect(offer.getByRole("checkbox", { name: /^Extra Number/ })).not.toBeChecked();
    await expect(offer.getByRole("checkbox", { name: /^Extra Email Address/ })).toBeChecked();
    await offer.getByRole("button", { name: "Review Plan", exact: true }).click();
    await expect
      .poll(() => purchases)
      .toEqual([
        {
          plan_id: "usage",
          usage_tier: tier,
          interval: "month",
          addons: { number: 0, email_address: 1 },
        },
      ]);
    await expect(offer).toContainText("Synthetic checkout stopped.");
  });
}
