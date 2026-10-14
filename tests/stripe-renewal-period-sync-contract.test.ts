import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const billing = readFileSync(resolve(process.cwd(), "src/routes/billing-routes.ts"), "utf8");

function webhookArm(event: string): string {
  const start = billing.indexOf(`case "${event}"`);
  expect(start).toBeGreaterThan(-1);
  const ends = ["case ", "default:"]
    .map((marker) => billing.indexOf(marker, start + event.length + 8))
    .filter((index) => index > -1);
  return billing.slice(start, ends.length ? Math.min(...ends) : undefined);
}

describe("renewal paid-period sync", () => {
  it("re-syncs every plan subscription when its invoice is paid, not only scheduled capacity", () => {
    const arm = webhookArm("invoice.payment_succeeded");

    // A renewal's customer.subscription.updated arrives while the invoice is a
    // draft, so this arm is the only place the new paid period can be recorded.
    expect(arm).toContain("stripeSubscriptionIdForInvoice(inv)");
    expect(arm).toContain("await stripe.subscriptions.retrieve(renewedSubscriptionId)");
    expect(arm).toContain("await syncSubscriptionFromStripe(renewed)");
    expect(arm).not.toMatch(/if\s*\(\s*renewed\.metadata\.wireline_capacity_target_plan\s*\)/);
  });

  it("never lets the standalone Live Video add-on overwrite the plan row", () => {
    const arm = webhookArm("invoice.payment_succeeded");

    expect(arm).toContain('renewed.metadata?.purpose !== "live_video_addon"');
  });
});
