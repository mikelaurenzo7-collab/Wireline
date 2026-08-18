import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("retired Live Video economics", () => {
  it("removes Live Video from the active commercial catalog", () => {
    const manifest = read("scripts/lib/stripe-founder-catalog.mjs");
    const catalogContract = read("scripts/check-stripe-catalog-contract.mjs");

    expect(manifest).not.toContain('key: "live_video"');
    expect(manifest).not.toContain('key: "live_video_monthly"');
    expect(manifest).not.toContain("STRIPE_LIVE_VIDEO_ADDON_PRICE_ID");
    expect(manifest).not.toContain("included_live_video_minutes");
    expect(manifest).not.toContain("session_reservation_minutes");
    expect(catalogContract).toContain(
      "Retired Live Video must stay out of the active Founder Stripe manifest",
    );
    expect(catalogContract).toContain("FOUNDER_PRODUCTS.length !== 7");
    expect(catalogContract).toContain("FOUNDER_PRICES.length !== 13");
  });

  it("keeps customer entitlement and new-session behavior closed", () => {
    const entitlement = read("src/lib/video-presenter/live-video-entitlements.ts");
    const routes = read("src/routes/video-presenter-routes-base.ts");
    const registry = read("src/server/register-api-routes.ts");

    expect(entitlement).toContain("addonOffered: false");
    expect(routes).toContain("LIVE_VIDEO_RETIRED");
    expect(routes).not.toContain("await mintLiveAvatarSessionToken");
    expect(routes).not.toContain("reserveLiveVideoSessionMinutes");
    expect(registry).not.toContain("app.use(videoPresenterRouter)");
    expect(registry).toContain('app.all("/api/billing/live-video-checkout"');
    expect(registry).toContain("res.status(410)");
  });

  it("retains historical usage accounting only for old records and reversals", () => {
    const usage = read("src/lib/video-presenter/live-video-usage.ts");
    const entitlement = read("src/lib/video-presenter/live-video-entitlements.ts");

    // Historical rows can still be reconciled safely after the product is
    // retired. These constants are not an offer and must not leak into the
    // active Stripe manifest.
    expect(usage).toContain("drizzle.transaction");
    expect(usage).toContain("live_video_reserved_minutes_monthly");
    expect(entitlement).toContain("LIVE_VIDEO_INCLUDED_MINUTES_MONTHLY");
    expect(read("scripts/lib/stripe-founder-catalog.mjs")).not.toContain(
      "LIVE_VIDEO_INCLUDED_MINUTES_MONTHLY",
    );
  });

  it("keeps retired marketing components out of the routed product", () => {
    const appRoutes = read("src/routes/AppRoutes.tsx");
    const spotlight = read("src/components/marketing/LiveVideoSpotlight.tsx");
    const stage = read("src/components/marketing/LiveVideoStage.tsx");

    // The files remain as archival design/source material for now, but no
    // authenticated route can activate them.
    expect(appRoutes).not.toContain("LiveVideoSpotlight");
    expect(appRoutes).not.toContain("LiveVideoStage");
    expect(appRoutes).not.toContain('lazy(() => import("../pages/LiveVideoStudioPage"))');
    expect(appRoutes).toContain(
      '<Route path="/studio/live-video" element={<Navigate to="/studio" replace />} />',
    );
    expect(spotlight).toContain("LiveVideoStage");
    expect(stage.length).toBeGreaterThan(0);
  });

  it("keeps founder launch spend on customer proof rather than premature brand media", () => {
    const campaign = read("docs/WIRELINE_LAUNCH_CAMPAIGN_2026-07-26.md");

    expect(campaign).toContain("3–5 consented design partners");
    expect(campaign).toContain("not authorized founder-launch spend");
    expect(campaign).toContain("## Post-proof Brand Concepts");
    expect(campaign).not.toContain("## Out of Home");
    expect(campaign).not.toContain('## Hero Film — "The Second Ring"');
  });

  it("keeps the retired browser audio bridge deleted", () => {
    expect(existsSync("src/lib/voice/decode-browser-audio.ts")).toBe(false);
    expect(existsSync("src/components/AgentPresenceLivePreview.tsx")).toBe(false);
  });
});