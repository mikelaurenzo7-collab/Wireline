import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("live video economics contract", () => {
  it("keeps the add-on paused until an explicit catalog release", () => {
    const env = read(".env.example");
    const billing = read("src/routes/billing-routes.ts");
    const manifest = read("scripts/lib/stripe-founder-catalog.mjs");

    expect(env).toContain("WIRELINE_LIVE_VIDEO_CATALOG_READY=false");
    expect(billing).toContain("if (!isLiveVideoCatalogReady())");
    expect(manifest).toContain('wireline_catalog_state: "launch_paused"');
    expect(manifest).toContain('included_live_video_minutes: "60"');
    expect(manifest).toContain('session_reservation_minutes: "10"');
    expect(manifest).toContain('overage_policy: "none_pause_at_limit"');
  });

  it("serializes monthly reservations before minting any provider token", () => {
    const usage = read("src/lib/video-presenter/live-video-usage.ts");
    const routes = read("src/routes/video-presenter-routes-base.ts");

    expect(usage).toContain("drizzle.transaction");
    expect(usage).toContain("pg_advisory_xact_lock");
    expect(usage).toContain("live_video_reserved_minutes_monthly");
    expect(usage).toContain(".onConflictDoUpdate");
    expect(routes).toContain("LIVE_VIDEO_MONTHLY_LIMIT_REACHED");

    const reservation = routes.indexOf(
      "const reservation = await reserveLiveVideoSessionMinutes",
    );
    const mint = routes.indexOf(
      "await mintLiveAvatarLiteSessionToken",
      reservation,
    );
    const release = routes.indexOf(
      "await releaseLiveVideoSessionReservation",
      mint,
    );
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
    expect(catalog).toContain('session_reservation_minutes: "10"');
  });
});
