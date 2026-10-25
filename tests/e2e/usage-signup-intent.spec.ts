import { expect, test } from "@playwright/test";
import { USAGE_PLAN } from "../../src/lib/plan-catalog";

test("selected usage identities survive the signup page and reach checkout", async ({ page }) => {
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
            ? { stripe_configured: true, email_verified: true, agent_count: 0, subscription: null }
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
  const estimate = page.getByRole("article", { name: "Monthly estimate" });
  await estimate.getByRole("checkbox", { name: /^BotBound number/ }).uncheck();
  await estimate.getByRole("checkbox", { name: /^BotBound email address/ }).check();
  await estimate.getByRole("link", { name: "Get Started", exact: true }).click();
  await expect(page).toHaveURL(/\/signup\?plan=usage&interval=month&number=0&email_address=1$/);
  await expect(page.getByRole("heading", { name: "Create Account", exact: true })).toBeVisible();

  authenticated = true;
  // No query parameters here: Billing must recover the signup choice.
  await page.goto("/settings/billing");
  const offer = page.getByRole("region", { name: "Pay for what you use" });
  await expect(offer.getByRole("checkbox", { name: /^BotBound number/ })).not.toBeChecked();
  await expect(offer.getByRole("checkbox", { name: /^BotBound email address/ })).toBeChecked();
  await offer.getByRole("button", { name: "Get Started", exact: true }).click();
  await expect
    .poll(() => purchases)
    .toEqual([{ plan_id: "usage", interval: "month", addons: { number: 0, email_address: 1 } }]);
  await expect(offer).toContainText("Synthetic checkout stopped.");
});
