import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Live Video dependent billing lifecycle", () => {
  const helpers = read("src/lib/stripe-helpers.ts");
  const entitlements = read("src/lib/video-presenter/live-video-entitlements.ts");
  const authority = read("src/lib/stripe-live-video-addon.ts");

  it("schedules standalone Live Video billing to end when the base stops renewing", () => {
    expect(helpers).toContain("reconcileLiveVideoAddonWithBasePlan");
    expect(helpers).toContain('candidate.metadata?.purpose === "live_video_addon"');
    expect(helpers).toContain("baseCancelAtPeriodEnd");
    expect(helpers).toContain("baseTerminal");
    expect(helpers).toContain("baseUnpaid");
    expect(helpers).toContain("basePaused");
    expect(helpers).toContain('const baseUnpaid = stripeStatus === "unpaid"');
    expect(helpers).toContain('const basePaused = stripeStatus === "paused"');
    expect(helpers).toContain("cancel_at_period_end: true");
    expect(helpers).toContain('wireline_base_plan_cascade: "true"');
  });

  it("restores only Wireline-cascaded cancellation after base recovery", () => {
    expect(helpers).toContain("restoreCascade");
    expect(helpers).toContain("priorBaseRequiredCascade");
    expect(helpers).toContain('existing.status === "unpaid"');
    expect(helpers).toContain('existing.status === "paused"');
    expect(helpers).toContain('addon.metadata?.wireline_base_plan_cascade === "true"');
    expect(helpers).toContain("cancel_at_period_end: false");
    expect(helpers).toContain('metadata: { wireline_base_plan_cascade: "" }');
  });

  it("preserves leftover Stripe add-on records without authorizing live video", () => {
    expect(entitlements).toContain("addonOffered: false");
    expect(entitlements).toContain("billingEntitled: false");
    expect(entitlements).toContain("liveVideoCheckoutAvailable: false");
    expect(entitlements).toContain("must not");
    expect(entitlements).toContain("authorize a provider session");
    expect(authority).toContain('subscription.metadata?.purpose === "live_video_addon"');
    expect(authority).toContain("LIVE_VIDEO_ADDON_NON_ENTITLING_STATUSES");
    expect(authority).toContain("isCurrentLiveVideoAddon(subscription)");
    expect(helpers).toContain("reconcileLiveVideoAddonWithBasePlan");
  });

  it("runs Stripe reconciliation before persisting the new local base-plan mirror", () => {
    // Whitespace-tolerant: the mutation phase moved inside tenantStore.run,
    // which re-indented the upsert without changing the ordering invariant.
    const call = helpers.indexOf("await reconcileLiveVideoAddonWithBasePlan({");
    const persistence = helpers.indexOf(".insert(schema.subscriptions)", call);
    expect(call).toBeGreaterThan(-1);
    expect(persistence).toBeGreaterThan(call);
  });
});
