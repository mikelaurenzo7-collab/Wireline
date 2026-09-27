import { expect, test } from "@playwright/test";
import { STRIPE_PLANS } from "../../src/lib/plan-catalog";

const plans = STRIPE_PLANS.filter((plan) => plan.catalogFamily === "channels");
test("all channel capacities retain exact annual signup intent in one readable selector", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({
      json:
        path === "/api/billing/plans"
          ? {
              stripe_configured: true,
              checkout_available: true,
              plans: plans.map((plan) => ({
                ...plan,
                catalog_family: plan.catalogFamily,
                capacity_tier: plan.capacityTier,
                checkout_availability: plan.checkoutAvailability,
                configured: plan.checkoutAvailability === "available",
                annual_configured: plan.checkoutAvailability === "available",
                contact_sales: false,
              })),
            }
          : path === "/api/auth/session"
            ? { user: null }
            : {},
    });
  });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/pricing?interval=year");
  await page.evaluate(async () => {
    document.documentElement.style.fontSize = "200%";
    await document.fonts.ready;
  });
  const privacy = page.getByRole("region", { name: "Privacy choices" });
  await privacy.getByRole("button", { name: "Essential only", exact: true }).click();
  await expect(privacy).toBeHidden();
  const labels = { voice: "Calls", email: "Email", sms: "SMS" } as const;
  for (const plan of plans) {
    await page
      .getByRole("radio", {
        name: new RegExp(
          `^${plan.capacityTier === "light" ? "Light" : plan.capacityTier === "regular" ? "Regular" : "High"}\\b`,
        ),
      })
      .check();
    for (const channel of plan.channels)
      await page.getByRole("checkbox", { name: labels[channel], exact: true }).check();
    for (const channel of ["voice", "email", "sms"] as const)
      if (!plan.channels.includes(channel))
        await page.getByRole("checkbox", { name: labels[channel], exact: true }).uncheck();
    const card = page.getByRole("article", { name: "Selected package" });
    await expect(card).toHaveCount(1);
    await expect(card).toContainText(`$${plan.price_usd_annual.toLocaleString()}`);
    const signup = card.getByRole("link");
    await expect(signup).toHaveAttribute("href", `/signup?plan=${plan.id}&interval=year`);
    if (plan.checkoutAvailability !== "available")
      await expect(card).toContainText("SMS setup is not available yet.");
    const overflow = await card.locator("..").evaluate((element) =>
      [element, ...element.querySelectorAll("*")]
        .filter((node) => node.clientWidth > 0 && node.scrollWidth > node.clientWidth + 2)
        .map((node) => ({
          text: node.textContent,
          width: node.clientWidth,
          scroll: node.scrollWidth,
        })),
    );
    expect(overflow).toEqual([]);
  }
});

test("an existing Calls subscription schedules more capacity without another checkout", async ({
  page,
}) => {
  let posts = 0;
  let checkoutPosts = 0;
  let pending: { plan_id: string; effective_at: string } | null = null;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/billing/capacity-upgrade") {
      if (route.request().method() === "DELETE") {
        pending = null;
        await route.fulfill({ json: { status: "removed" } });
      } else if (route.request().method() === "POST") {
        posts += 1;
        expect(route.request().postDataJSON()).toEqual({ plan_id: "voice-regular" });
        pending = { plan_id: "voice-regular", effective_at: "2026-10-05T12:00:00Z" };
        await route.fulfill({ json: { status: "scheduled", ...pending } });
      } else
        await route.fulfill({
          json: {
            current_plan_id: "voice",
            interval: "month",
            effective_at: "2026-10-05T12:00:00Z",
            eligible_plan_ids: ["voice-regular", "voice-high"],
            available: true,
            pending,
          },
        });
      return;
    }
    if (path === "/api/billing/checkout" && route.request().method() === "POST") checkoutPosts += 1;
    const json =
      path === "/api/auth/session"
        ? {
            user: {
              id: "capacity-owner",
              email: "capacity@example.test",
              full_name: "Capacity Review",
            },
          }
        : path === "/api/billing/plans"
          ? {
              stripe_configured: true,
              checkout_available: true,
              plans: plans.map((plan) => ({
                ...plan,
                capacity_tier: plan.capacityTier,
                catalog_family: plan.catalogFamily,
                checkout_availability: plan.checkoutAvailability,
                configured: plan.checkoutAvailability === "available",
                annual_configured: plan.checkoutAvailability === "available",
                contact_sales: false,
              })),
            }
          : path === "/api/billing/status"
            ? {
                stripe_configured: true,
                email_verified: true,
                agent_count: 1,
                subscription: {
                  plan: "voice",
                  plan_id: "voice",
                  plan_name: "BotBound Calls Light",
                  max_agents: 1,
                  status: "active",
                  has_subscription: true,
                  has_customer: true,
                  current_period_end: "2026-10-05T12:00:00Z",
                  cancel_at_period_end: false,
                },
                channel_entitlements: {
                  plan_id: "voice",
                  subscription_status: "active",
                  channels: ["voice"],
                  is_owner: false,
                },
              }
            : path === "/api/conversation-balance/ledger"
              ? { ledger: [] }
              : { accounts: [], data: [], agents: [], integrations: [], balance_usd: 0 };
    await route.fulfill({ json });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings/billing");
  const capacity = page.getByRole("region", { name: "Plan capacity" });
  await capacity
    .getByRole("button", { name: /^(Increase capacity|Scheduled capacity change)$/ })
    .click();
  await capacity.getByRole("radio", { name: /^Regular\b/ }).check();
  for (const checkbox of await capacity.getByRole("checkbox").all())
    await expect(checkbox).toBeDisabled();
  await expect(capacity).toContainText("after successful renewal payment");
  await capacity.getByRole("button", { name: "Schedule capacity increase", exact: true }).click();
  await expect(capacity).toContainText("BotBound Calls Regular is scheduled for");
  await expect(capacity).toContainText("Your current capacity stays available until then.");
  await page.reload();
  await capacity
    .getByRole("button", { name: /^(Increase capacity|Scheduled capacity change)$/ })
    .click();
  await expect(capacity).toContainText("BotBound Calls Regular is scheduled for");
  expect(posts).toBe(1);
  expect(checkoutPosts).toBe(0);
  await capacity.getByRole("button", { name: "Remove scheduled change", exact: true }).click();
  await expect(
    capacity.getByRole("button", { name: "Schedule capacity increase", exact: true }),
  ).toBeVisible();
  await expect(capacity).not.toContainText("is scheduled for");
  expect(await capacity.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true,
  );
});
