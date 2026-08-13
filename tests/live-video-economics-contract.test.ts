import { readFileSync } from "node:fs";
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

    const reservation = routes.indexOf(
      "const reservation = await reserveLiveVideoSessionMinutes",
    );
    const mint = routes.indexOf("await mintLiveAvatarLiteSessionToken", reservation);
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

    expect(spotlight).toContain('to="/signup?plan=starter"');
    expect(spotlight).not.toContain('to="/signup?plan=personal"');
    expect(spotlight).toContain("paid business agent");
    expect(spotlight).toContain("LIVE_VIDEO_ADDON_PRICE_USD");
    expect(spotlight).toContain("LIVE_VIDEO_INCLUDED_MINUTES_MONTHLY");
    expect(spotlight).toContain("LIVE_VIDEO_SESSION_RESERVATION_MINUTES");
    expect(spotlight).toContain("LIVE_VIDEO_FACTS");
  });

  it("keeps the browser audio bridge compatible with LiveAvatar LITE repeatAudio", () => {
    const browserAudio = read("src/lib/voice/decode-browser-audio.ts");
    const presenter = read("src/components/AgentPresenceLivePreview.tsx");

    expect(browserAudio).toContain("PCM16 LE @ 24 kHz");
    expect(browserAudio).toContain("mp3Base64ChunksToPcmBinary");
    expect(presenter).toContain("mp3Base64ChunksToPcmBinary(payload.chunks)");
    expect(presenter).toContain("streamSampleBinary(pcmBinary, payload.eventId)");
  });
});
