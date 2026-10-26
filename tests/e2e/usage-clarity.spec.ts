import { expect, test } from "@playwright/test";
import { STRIPE_PLANS } from "../../src/lib/plan-catalog";

const accountSpendResponses: Record<string, unknown> = {
  "/api/audit/summary": {
    window_days: 30,
    totals: {
      calls: 1,
      cost: 0.12,
      input: 100,
      output: 20,
      cache_read: 0,
      cache_create: 0,
      cache_savings_usd: 0,
      avg_cost_per_call: 0.12,
      avg_latency: 200,
    },
    latency: { p50_ms: 200, p95_ms: 200, sample_count: 1 },
    by_day: [{ day: "2026-09-27", calls: 1, cost: 0.12 }],
    by_action: [{ action: "agent-test", calls: 1, cost: 0.12, avg_latency_ms: 200 }],
    by_model: [{ model: "unknown", calls: 1, cost: 0.12 }],
  },
  "/api/spend/status": {
    period: "2026-09",
    monthly_limit_usd: 2,
    maximum_limit_usd: 2,
    month_to_date_usd: 0.12,
    warn_threshold_pct: 80,
    guard_scope: "free_simulation_allowance",
    alerts_fired: [],
  },
  "/api/spend/budget": { budget: { monthly_limit_usd: "2", warn_threshold_pct: 80 } },
};

for (const width of [1440, 390]) {
  test(`recent balance activity is readable and links to separate AI spend at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const json =
        accountSpendResponses[path] ??
        (path === "/api/auth/session"
          ? { user: { id: "usage-owner", email: "owner@example.test", full_name: "Usage Review" } }
          : path === "/api/billing/plans"
            ? {
                checkout_available: false,
                stripe_configured: true,
                plans: STRIPE_PLANS.map((plan) => ({
                  ...plan,
                  configured: true,
                  annual_configured: true,
                })),
              }
            : path === "/api/billing/status"
              ? { stripe_configured: true, subscription: null, agent_count: 0 }
              : path === "/api/conversation-balance"
                ? {
                    balance_usd: 4.78,
                    ledger: [
                      {
                        id: "usage",
                        deltaUsd: -0.22,
                        balanceAfterUsd: 4.78,
                        customerReason: "Additional voice minute",
                        reason: "internal-voice-reference",
                        entryKind: "burn",
                        createdAt: "2026-09-27T15:00:00Z",
                      },
                      {
                        id: "credit",
                        deltaUsd: 5,
                        balanceAfterUsd: 5,
                        customerReason: "Monthly plan allowance",
                        reason: "internal-grant-reference",
                        entryKind: "grant",
                        createdAt: "2026-09-01T00:00:00Z",
                      },
                    ],
                  }
                : { agents: [], accounts: [], numbers: [], integrations: [] });
      await route.fulfill({ json });
    });
    await page.goto("/settings/billing");
    const activity = page
      .locator("details")
      .filter({ has: page.locator("summary", { hasText: "Recent Activity" }) });
    const summary = activity.locator("summary");
    await expect(summary).toBeVisible();
    await expect(activity.getByRole("list")).toBeHidden();
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(
      activity.getByRole("list", { name: "Recent Runtime Balance activity" }),
    ).toBeVisible();
    await expect(activity.getByText("−$0.22", { exact: true })).toBeVisible();
    await expect(activity.getByText("+$5.00", { exact: true })).toBeVisible();
    await expect(activity.getByText("Balance $4.78", { exact: true })).toBeVisible();
    await expect(activity).not.toContainText("internal-");
    await expect(activity.getByRole("link", { name: "AI spend", exact: true })).toHaveAttribute(
      "href",
      "/insights?tab=revenue&view=spend",
    );
    await page.evaluate(() => document.fonts.ready);
    const screenshotPath = testInfo.outputPath(`balance-activity-${width}.png`);
    await activity.screenshot({ path: screenshotPath });
    await testInfo.attach(`balance-activity-${width}`, {
      path: screenshotPath,
      contentType: "image/png",
    });
    const geometry = await activity.evaluate((element) => ({
      width: element.clientWidth,
      scroll: element.scrollWidth,
      overflow: [...element.querySelectorAll("*")]
        .filter((child) => child.scrollWidth > child.clientWidth + 1)
        .map((child) => ({
          text: child.textContent,
          width: child.clientWidth,
          scroll: child.scrollWidth,
        })),
    }));
    expect(geometry.scroll, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.width + 1);
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(activity.getByRole("list")).toBeHidden();

    // The account has no Bots, but its prior spend and current allowance still belong to it.
    await page.keyboard.press("Enter");
    await activity.getByRole("link", { name: "AI spend", exact: true }).click();
    await expect(page).toHaveURL(/\/insights\?tab=revenue&view=spend$/);
    await expect(page.getByText("Simulation allowance", { exact: true })).toBeVisible();
    await expect(page.getByRole("spinbutton", { name: "Monthly Safety Limit (USD)" })).toHaveValue(
      "2",
    );
    await expect(page.getByText("Recorded AI Cost", { exact: true })).toBeVisible();
    await expect(page.getByText("$0.12", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("No Conversations Yet", { exact: true })).toHaveCount(0);

    await page.goto("/insights");
    await expect(page.getByText("No Conversations Yet", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Create Bot", exact: true })).toBeVisible();
    await expect(page.getByText("Simulation allowance", { exact: true })).toHaveCount(0);
  });
}
