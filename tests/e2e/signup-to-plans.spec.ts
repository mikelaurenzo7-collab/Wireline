import { expect, test } from "@playwright/test";
import { USAGE_PLAN } from "../../src/lib/plan-catalog";

const user = { id: "new-plan-owner", email: "plan-owner@example.test" };

for (const selectedPlan of [false, true]) {
  test(`a fresh ${selectedPlan ? "Lite signup meets Bo first and keeps its plan for going live" : "ordinary signup meets Bo"}`, async ({
    page,
  }) => {
    let signedIn = false;
    let planConfirmed = false;
    let bots: Array<Record<string, unknown>> = [];
    const checkoutRequests: unknown[] = [];
    const createRequests: unknown[] = [];
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === "/api/agents" && request.method() === "POST") {
        createRequests.push(request.postDataJSON());
        bots = [{ id: "agent-bo", name: "Bo", markKey: "spark-rose", channel: "voice" }];
        return route.fulfill({
          status: 201,
          json: {
            id: "agent-bo",
            name: "Bo",
            mark_key: "spark-rose",
            channel: "voice",
            created: true,
          },
        });
      }
      if (path.endsWith("/managed-identity"))
        return route.fulfill({ status: 402, json: { code: "ACTIVATION_REQUIRED" } });
      switch (path) {
        case "/api/auth/signup":
          signedIn = true;
          return route.fulfill({ status: 201, json: { user } });
        case "/api/auth/session":
          return route.fulfill({ json: { user: signedIn ? user : null } });
        case "/api/agents":
          return route.fulfill({ json: { agents: bots } });
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
              agent_count: bots.length,
              phone_lines_used: 0,
              channel_entitlements: {
                plan_id: planConfirmed ? "usage" : null,
                subscription_status: planConfirmed ? "active" : "none",
                channels: planConfirmed ? ["voice", "email"] : [],
                is_owner: true,
              },
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
              personality: "Clear",
              directives: [],
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

    // Everyone meets Bo first; nobody is asked to pay at sign-up.
    await expect(page).toHaveURL(selectedPlan ? /\/studio\?template=front-desk$/ : /\/studio$/);
    await expect(page.getByRole("log", { name: "Conversation with Bo" })).toContainText(
      "what's your business called?",
    );
    expect(createRequests).toEqual([
      expect.objectContaining({ name: "Bo", only_if_none: true, is_business_agent: true }),
    ]);
    expect(checkoutRequests).toEqual([]);
    if (!selectedPlan) return;

    // Going live is where the plan picked on Pricing comes back, already selected.
    await page.getByRole("button", { name: "Finish Later" }).click();
    await page.goto("/studio?agent=agent-bo&section=review");
    await page.getByRole("link", { name: "Choose a Plan", exact: true }).first().click();
    await expect(page).toHaveURL(/\/settings\/billing\?plan=usage&.*email_address=1.*tier=lite/);
    const offer = page.getByRole("region", { name: "Subscription Plans" });
    await expect(offer.getByRole("radio", { name: /^Lite/ })).toBeChecked();
    await expect(offer.getByRole("checkbox", { name: /^Extra Email Address/ })).toBeChecked();
    await expect(offer.getByRole("checkbox", { name: /^Extra Number/ })).not.toBeChecked();
    await offer.getByRole("button", { name: "Review Plan", exact: true }).click();
    await expect(page.getByText("Plan Confirmed", { exact: true })).toBeVisible();
    expect(checkoutRequests).toEqual([
      {
        plan_id: "usage",
        interval: "month",
        usage_tier: "lite",
        addons: { number: 0, email_address: 1 },
      },
    ]);
  });
}
