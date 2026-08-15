import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("live video economics contract", () => {
  it("keeps the add-on launch-active with an explicit emergency kill switch", () => {
    const entitlement = read("src/lib/video-presenter/live-video-entitlements.ts");
    const manifest = read("scripts/lib/stripe-founder-catalog.mjs");
    const routes = read("src/routes/video-presenter-routes-base.ts");

    expect(entitlement).toContain('WIRELINE_LIVE_VIDEO_DISABLED !== "true"');
    expect(entitlement).not.toContain('WIRELINE_LIVE_VIDEO_CATALOG_READY === "true"');
    expect(manifest).toContain('wireline_catalog_state: "launch_active"');
    expect(manifest).toContain('included_live_video_minutes: "60"');
    expect(manifest).toContain('session_reservation_minutes: "5"');
    expect(manifest).toContain('overage_policy: "none_pause_at_limit"');
    expect(routes).toContain("maxSessionDurationSeconds: LIVE_VIDEO_MAX_SESSION_SECONDS");
    expect(routes).not.toContain("maxSessionDurationSeconds: 600");
  });

  it("serializes monthly reservations before minting any provider token", () => {
    const usage = read("src/lib/video-presenter/live-video-usage.ts");
    const routes = read("src/routes/video-presenter-routes-base.ts");

    expect(usage).toContain("drizzle.transaction");
    expect(usage).toContain("pg_advisory_xact_lock");
    expect(usage).toContain("live_video_reserved_minutes_monthly");
    expect(usage).toContain(".onConflictDoUpdate");
    expect(routes).toContain("LIVE_VIDEO_MONTHLY_LIMIT_REACHED");

    const reservation = routes.indexOf("const reservation = await reserveLiveVideoSessionMinutes");
    const mint = routes.indexOf("await mintLiveAvatarSessionToken", reservation);
    const release = routes.indexOf("await releaseLiveVideoSessionReservation", mint);
    expect(reservation).toBeGreaterThan(-1);
    expect(mint).toBeGreaterThan(reservation);
    expect(release).toBeGreaterThan(mint);
  });

  it("publishes the same allowance at entitlement and Stripe catalog boundaries", () => {
    const entitlement = read("src/lib/video-presenter/live-video-entitlements.ts");
    const catalog = read("scripts/check-stripe-catalog-contract.mjs");

    expect(entitlement).toContain("LIVE_VIDEO_INCLUDED_MINUTES_MONTHLY");
    expect(entitlement).toContain("LIVE_VIDEO_SESSION_RESERVATION_MINUTES");
    expect(catalog).toContain('included_live_video_minutes: "60"');
    expect(catalog).toContain('session_reservation_minutes: "5"');
  });

  it("keeps the public Live Video spotlight aligned with paid add-on economics", () => {
    const spotlight = read("src/components/marketing/LiveVideoSpotlight.tsx");
    // The allowance and session ceiling moved onto the session stage itself,
    // where they read as part of the product rather than as a caption. Both
    // files must still derive every published number from the policy module —
    // the point of the contract is that no marketing surface can hardcode a
    // limit the runtime does not enforce.
    const stage = read("src/components/marketing/LiveVideoStage.tsx");

    expect(spotlight).toContain('to="/signup?plan=starter"');
    expect(spotlight).not.toContain('to="/signup?plan=personal"');
    expect(spotlight).toContain("paid business agent");
    expect(spotlight).toContain("LIVE_VIDEO_ADDON_PRICE_USD");
    expect(spotlight).toContain("LiveVideoStage");
    expect(spotlight).toContain("same Training and tools");
    expect(spotlight).not.toContain("same Training, tools, and history");
    expect(stage).toContain("LIVE_VIDEO_INCLUDED_MINUTES_MONTHLY");
    expect(stage).toContain("LIVE_VIDEO_MAX_SESSION_SECONDS");
    expect(stage).not.toMatch(/\b(60|19)\s*(min|\/mo)\b/);
  });

  it("stops the public session illustration at the enforced limit", () => {
    const stage = read("src/components/marketing/LiveVideoStage.tsx");

    expect(stage).toContain("const sessionEnded = secondsLeft === 0");
    expect(stage).toContain("Math.max(0, value - 1)");
    expect(stage).not.toContain(
      "value <= 1 ? LIVE_VIDEO_MAX_SESSION_SECONDS : value - 1",
    );
    expect(stage).toContain('{sessionEnded ? "Complete" : "Live"}');
    expect(stage).toContain('role="timer"');
    expect(stage).not.toContain('aria-label="Time left in this session"');
    expect(stage).toContain("0:00 · ended");
    expect(stage).toContain("Session complete");
  });

  it("keeps the retired browser audio bridge deleted", () => {
    // The unmounted preview and its decode bridge were removed 2026-08-13;
    // LiveVideoPresenter's SDK path (video-presenter-contract) is the live
    // browser audio surface.
    expect(existsSync("src/lib/voice/decode-browser-audio.ts")).toBe(false);
    expect(existsSync("src/components/AgentPresenceLivePreview.tsx")).toBe(false);
  });
});
