import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("live video economics contract", () => {
  it("closes talking-head checkout while keeping leftover Stripe SKU metadata", () => {
    const entitlement = read("src/lib/video-presenter/live-video-entitlements.ts");
    const manifest = read("scripts/lib/stripe-founder-catalog.mjs");
    const routes = read("src/routes/video-presenter-routes-base.ts");

    expect(entitlement).toContain("addonOffered: false");
    expect(entitlement).toContain("return false;");
    expect(manifest).toContain('wireline_catalog_state: "launch_active"');
    expect(manifest).toContain('included_live_video_minutes: "60"');
    expect(manifest).toContain('session_reservation_minutes: "5"');
    expect(routes).toContain("LIVE_VIDEO_RETIRED");
    expect(routes).not.toContain("mintLiveAvatarSessionToken");
  });

  it("does not mint a provider token on retired session routes", () => {
    const usage = read("src/lib/video-presenter/live-video-usage.ts");
    const routes = read("src/routes/video-presenter-routes-base.ts");

    expect(usage).toContain("drizzle.transaction");
    expect(usage).toContain("live_video_reserved_minutes_monthly");
    expect(routes).toContain('"LIVE_VIDEO_RETIRED"');
    expect(routes).not.toContain("await mintLiveAvatarSessionToken");
    expect(routes).not.toContain("reserveLiveVideoSessionMinutes");
  });

  it("publishes the same allowance at entitlement and Stripe catalog boundaries", () => {
    const entitlement = read("src/lib/video-presenter/live-video-entitlements.ts");
    const catalog = read("scripts/check-stripe-catalog-contract.mjs");

    expect(entitlement).toContain("LIVE_VIDEO_INCLUDED_MINUTES_MONTHLY");
    expect(entitlement).toContain("LIVE_VIDEO_SESSION_RESERVATION_MINUTES");
    expect(catalog).toContain('included_live_video_minutes: "60"');
    expect(catalog).toContain('session_reservation_minutes: "5"');
  });

  it("keeps public Live Video copy aligned with the runtime that actually ships", () => {
    const spotlight = read("src/components/marketing/LiveVideoSpotlight.tsx");
    const stage = read("src/components/marketing/LiveVideoStage.tsx");
    const campaign = read("docs/WIRELINE_LAUNCH_CAMPAIGN_2026-07-26.md");
    const generator = read("scripts/generate-campaign-vo.mjs");

    expect(spotlight).toContain('to="/signup?plan=starter"');
    expect(spotlight).not.toContain('to="/signup?plan=personal"');
    expect(spotlight).toContain("paid business agent");
    expect(spotlight).toContain("max-w-[24ch]");
    expect(spotlight).toContain("same Training, operating rules, and approved knowledge");
    expect(spotlight).not.toMatch(/\bhistory\b/i);
    expect(spotlight).not.toContain("same Training and tools");
    expect(spotlight).toContain("LIVE_VIDEO_ADDON_PRICE_USD");
    expect(spotlight).toContain("LiveVideoStage");
    expect(stage).toContain("LIVE_VIDEO_INCLUDED_MINUTES_MONTHLY");
    expect(stage).toContain("LIVE_VIDEO_MAX_SESSION_SECONDS");
    expect(stage).not.toMatch(/\b(60|19)\s*(min|\/mo)\b/);

    const campaignSection = campaign.slice(
      campaign.indexOf("### Live Video proof"),
      campaign.indexOf("## Organic and Direct Launch Copy"),
    );
    const generatorSection = generator.slice(
      generator.indexOf('id: "live-video-25s"'),
      generator.indexOf("  },\n];", generator.indexOf('id: "live-video-25s"')),
    );
    for (const source of [spotlight, campaignSection, generatorSection]) {
      expect(source).not.toMatch(/same logged outcome/i);
      expect(source).not.toMatch(/outcome it logs/i);
    }
    // The internal campaign guardrail may name the prohibited claim while
    // documenting that it is not supported. Customer-facing copy and generated
    // narration must not make it.
    for (const source of [spotlight, generatorSection]) {
      expect(source).not.toMatch(/cross-channel history/i);
    }
    expect(campaignSection).toContain("approved knowledge");
    expect(campaignSection).toContain("It does not yet claim");
  });

  it("keeps founder launch spend on customer proof rather than premature brand media", () => {
    const campaign = read("docs/WIRELINE_LAUNCH_CAMPAIGN_2026-07-26.md");

    expect(campaign).toContain("3–5 consented design partners");
    expect(campaign).toContain("not authorized founder-launch spend");
    expect(campaign).toContain("## Post-proof Brand Concepts");
    expect(campaign).not.toContain("## Out of Home");
    expect(campaign).not.toContain('## Hero Film — "The Second Ring"');
  });

  it("depicts the hard session cap as a terminal pause instead of a looping timer", () => {
    const stage = read("src/components/marketing/LiveVideoStage.tsx");

    expect(stage).toContain("Math.max(0, value - 1)");
    expect(stage).not.toContain("value <= 1 ? LIVE_VIDEO_MAX_SESSION_SECONDS : value - 1");
    expect(stage).toContain('sessionEnded ? "Paused" : "Live"');
    expect(stage).toContain('sessionEnded ? "Session paused"');
    expect(stage).not.toContain('aria-label="Time left in this session"');
    expect(stage).toContain("aria-label={`${clock} left in this session");
  });

  it("keeps the retired browser audio bridge deleted", () => {
    expect(existsSync("src/lib/voice/decode-browser-audio.ts")).toBe(false);
    expect(existsSync("src/components/AgentPresenceLivePreview.tsx")).toBe(false);
  });
});
