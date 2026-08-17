import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("video presenter integration", () => {
  it("keeps historical provider ids as identity badges, not live sessions", () => {
    const identity = source("src/lib/agent-identity.ts");
    expect(identity).toContain('"liveavatar"');
    expect(identity).toContain('surfaceLabel: "Identity badge"');
    expect(identity).toContain('providerPreference: VideoPresenterProviderId = "synthetic"');
    expect(source("src/lib/video-presenter/liveavatar-service.ts")).toContain(
      'videoPresenterProvider: "synthetic"',
    );
  });

  it("treats synthetic avatars as app identity badges, not video presenters", () => {
    const identity = source("src/lib/agent-identity.ts");
    expect(identity).toContain('surfaceLabel: "Identity badge"');
    expect(identity).toContain('headline: "Agent identity badge"');
    expect(identity).toContain("Not a video presenter");
    const face = source("src/components/AgentFace.tsx");
    expect(face).toContain("deterministic in-app identity badge");
    expect(face).toContain('aria-label={title || "Agent identity badge"}');
  });

  it("keeps Fast Start free of avatar and presenter pickers", () => {
    const dialog = source("src/components/CreateAgentDialog.tsx");
    expect(dialog).toContain("Not now");
    expect(dialog).not.toMatch(/CreateAgentCatalogFacePicker|AgentPresenceAvatarPicker|avatar/i);
  });

  it("retires LiveAvatar sessions and the Web SDK", () => {
    const service = source("src/lib/video-presenter/liveavatar-service.ts");
    const live = source("src/components/LiveVideoPresenter.tsx");
    const routes = source("src/routes/video-presenter-routes-base.ts");
    expect(service).toContain("retired: true");
    expect(service).not.toContain("https://api.liveavatar.com");
    expect(service).not.toContain("mintLiveAvatarLiteSessionToken");
    expect(live).not.toContain("@heygen/liveavatar-web-sdk");
    expect(live).toContain("AgentFace");
    expect(routes).toContain('"LIVE_VIDEO_RETIRED"');
    expect(existsSync(resolve(root, "src/components/AgentPresenceLivePreview.tsx"))).toBe(false);
  });

  it("gives identity and clips discovery from Overview without selling live talking-head", () => {
    const overview = source("src/pages/OverviewPage.tsx");
    expect(overview).toContain('to="/studio/live-video"');
    expect(overview).toContain("Identity and clips");
    expect(overview).not.toContain(">Live Video</span>");
  });

  it("closes checkout and entitlement for the retired talking-head add-on", () => {
    const entitlements = source("src/lib/video-presenter/live-video-entitlements.ts");
    expect(entitlements).toContain("addonOffered: false");
    expect(entitlements).toContain("liveVideoCheckoutAvailable: false");
    expect(entitlements).toContain("return false;");
    expect(source("src/lib/video-presenter/live-video-addon.ts")).toContain("return false;");
    expect(source("src/routes/billing-routes.ts")).toContain("/billing/live-video-checkout");
    expect(source("src/routes/billing-routes.ts")).toContain("LIVE_VIDEO_CATALOG_UNAVAILABLE");
    expect(source("scripts/lib/stripe-founder-catalog.mjs")).toContain(
      "STRIPE_LIVE_VIDEO_ADDON_PRICE_ID",
    );
  });

  it("mounts identity and clip-script studio without a live session mint", () => {
    const page = source("src/pages/LiveVideoStudioPage.tsx");
    expect(page).toContain("Identity and clips");
    expect(page).toContain("Draft clip script");
    expect(page).toContain('kind: "video_clip"');
    expect(page).not.toContain("/video-presenter/session");
    expect(page).not.toContain("@heygen/liveavatar-web-sdk");
    const routes = source("src/routes/AppRoutes.tsx");
    const liveVideoMount = routes.indexOf('path="/studio/live-video"');
    const studioWildcard = routes.indexOf('path="/studio/*"');
    expect(liveVideoMount).toBeGreaterThan(-1);
    expect(studioWildcard).toBeGreaterThan(-1);
    expect(liveVideoMount).toBeLessThan(studioWildcard);
  });

  it("keeps live-video provider membership client-safe", () => {
    const page = source("src/pages/LiveVideoStudioPage.tsx");
    expect(page).not.toContain('from "../lib/video-presenter/live-video-addon"');
    const providers = source("src/lib/video-presenter/live-video-providers.ts");
    const valueImports = providers
      .split("\n")
      .filter((line) => /^import\s/.test(line) && !/^import\s+type\s/.test(line));
    expect(valueImports).toEqual([]);
    expect(source("src/lib/video-presenter/live-video-addon.ts")).toContain(
      'export { agentLiveVideoOptedIn, isLiveVideoProvider } from "./live-video-providers"',
    );
  });

  it("retires the presenter sample and reports no live engines", () => {
    const routes = source("src/routes/video-presenter-routes-base.ts");
    expect(routes).toContain('"/api/agents/:id/video-presenter/sample"');
    expect(routes).toContain('code: "LIVE_VIDEO_SAMPLE_RETIRED"');
    expect(source("src/routes/health-routes.ts")).toContain("live_video_engines: []");
    expect(source("src/routes/health-routes.ts")).toContain("live_video_retired: true");
  });

  it("seeds business agents with synthetic identity", () => {
    expect(source("src/routes/agent-routes-v2.ts")).toContain(
      "businessAgentVideoPresenterDefaults",
    );
    expect(source("src/lib/video-presenter/liveavatar-service.ts")).toContain(
      'videoPresenterProvider: "synthetic"',
    );
  });
});
