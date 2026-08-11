import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Live Video dependent billing lifecycle", () => {
  const helpers = read("src/lib/stripe-helpers.ts");
  const entitlements = read("src/lib/video-presenter/live-video-entitlements.ts");

  it("schedules standalone Live Video billing to end when the base stops renewing", () => {
    expect(helpers).toContain("reconcileLiveVideoAddonWithBasePlan");
    expect(helpers).toContain('candidate.metadata?.purpose === "live_video_addon"');
    expect(helpers).toContain("baseCancelAtPeriodEnd");
    expect(helpers).toContain("baseTerminal");
    expect(helpers).toContain("baseUnpaid");
    expect(helpers).toContain('const baseUnpaid = stripeStatus === "unpaid"');
    expect(helpers).toContain("cancel_at_period_end: true");
    expect(helpers).toContain('wireline_base_plan_cascade: "true"');
  });

  it("restores only Wireline-cascaded cancellation after base recovery", () => {
    expect(helpers).toContain("restoreCascade");
    expect(helpers).toContain("priorBaseRequiredCascade");
    expect(helpers).toContain('existing.status === "unpaid"');
    expect(helpers).toContain(
      'addon.metadata?.wireline_base_plan_cascade === "true"',
    );
    expect(helpers).toContain("cancel_at_period_end: false");
    expect(helpers).toContain('metadata: { wireline_base_plan_cascade: "" }');
  });

  it("preserves an already-paid add-on period after terminal base cancellation", () => {
    expect(entitlements).toContain("TERMINAL_BASE_SUBSCRIPTION_STATUSES");
    expect(entitlements).toContain("terminalPaidPeriodGrace");
    expect(entitlements).toContain("existingAddonEntitled");
    expect(entitlements).toContain(
      "const billingEntitled = addonOffered && workspaceFlag && existingAddonEntitled",
    );
    expect(entitlements).toContain(
      "const checkoutAvailable = addonOffered && baseSubscriptionActive && priceConfigured",
    );
    expect(entitlements).toContain("`unpaid` is intentionally excluded");
  });

  it("runs Stripe reconciliation before persisting the new local base-plan mirror", () => {
    const call = helpers.indexOf("await reconcileLiveVideoAddonWithBasePlan({");
    const persistence = helpers.indexOf("await drizzle\n    .insert(schema.subscriptions)", call);
    expect(call).toBeGreaterThan(-1);
    expect(persistence).toBeGreaterThan(call);
  });
});