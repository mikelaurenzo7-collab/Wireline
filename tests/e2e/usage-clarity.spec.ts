import { expect, test } from "@playwright/test";
import { STRIPE_PLANS } from "../../src/lib/plan-catalog";

for (const width of [1440, 390]) {
  test(`recent balance activity is readable and links to separate AI spend at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const json =
        path === "/api/auth/session"
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
                : { agents: [], accounts: [], numbers: [], integrations: [] };
      await route.fulfill({ json });
    });
    await page.goto("/settings/billing");
    const activity = page
      .locator("details")
      .filter({ has: page.locator("summary", { hasText: "Recent activity" }) });
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
  });
}
