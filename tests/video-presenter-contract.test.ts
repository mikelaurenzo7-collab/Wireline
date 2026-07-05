import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("video presenter integration", () => {
  it("registers live video providers without making them the default identity", () => {
    const identity = source("src/lib/agent-identity.ts");
    expect(identity).toContain('"liveavatar"');
    expect(identity).toContain('surfaceLabel: "Live video"');
    expect(identity).toContain('providerPreference: VideoPresenterProviderId = "synthetic"');
  });

  it("starts LiveAvatar LITE sessions on the server", () => {
    const service = source("src/lib/video-presenter/liveavatar-service.ts");
    expect(service).toContain('mode: "LITE"');
    expect(service).toContain("/v1/sessions/token");
    expect(service).toContain("mintLiveAvatarLiteSessionToken");
  });

  it("uses the official LiveAvatar Web SDK in the browser", () => {
    const live = source("src/components/LiveVideoPresenter.tsx");
    expect(live).toContain("@heygen/liveavatar-web-sdk");
    expect(live).toContain("LiveAvatarSession");
    expect(live).toContain("repeatAudio");
  });

  it("seeds business agents with synthetic presenter until live video add-on is enabled", () => {
    const routes = source("src/routes/agent-routes-v2.ts");
    expect(routes).toContain("businessAgentVideoPresenterDefaults");
    const defaults = source("src/lib/video-presenter/liveavatar-service.ts");
    expect(defaults).toContain('videoPresenterProvider: "synthetic"');
  });

  it("streams agent voice into LiveAvatar LITE via sample route + SDK audio", () => {
    const routes = source("src/routes/video-presenter-routes.ts");
    expect(routes).toContain("/api/agents/:id/video-presenter/sample");
    expect(routes).toContain("generateSamplePcm24");
    expect(routes).toContain("LIVE_VIDEO_NO_VOICE");
    const live = source("src/components/LiveVideoPresenter.tsx");
    expect(live).toContain("feedPcmDelta");
    const sandbox = source("src/components/LiveVoiceSandbox.tsx");
    expect(sandbox).toContain("onAgentAudioDelta");
  });

  it("offers live video as an explicit opt-in add-on", () => {
    const routes = source("src/routes/video-presenter-routes.ts");
    expect(routes).toContain("/video-presenter/enable");
    expect(routes).toContain("LIVE_VIDEO_UPGRADE_REQUIRED");
    const preview = source("src/components/AgentPresenceLivePreview.tsx");
    expect(preview).toContain("Add live video");
    expect(preview).toContain("liveVideoMeteringNote");
    const readiness = source("src/components/fleet-settings/agent-readiness.ts");
    expect(readiness).toContain("softNudges");
  });

  it("imports catalog listing for the avatar picker route", () => {
    const routes = source("src/routes/video-presenter-routes.ts");
    expect(routes).toContain("listPublicAvatars");
  });

  it("keeps catalog face picks included before live video add-on", () => {
    const preview = source("src/components/AgentPresenceLivePreview.tsx");
    expect(preview).toContain("platformConfigured && presenter");
    const picker = source("src/components/AgentPresenceAvatarPicker.tsx");
    expect(picker).not.toContain('provider: "liveavatar"');
    const resolve = source("src/lib/video-presenter/resolve-agent-presenter.ts");
    expect(resolve).toContain("chosenAvatarId");
  });

  it("bridges PSTN call audio from Vapi listenUrl into LiveAvatar lip-sync", () => {
    const schema = source("src/db/schema.ts");
    expect(schema).toContain('listenUrl: text("listen_url")');
    const vapi = source("src/routes/vapi/index.ts");
    expect(vapi).toContain("listenUrl");
    const bridge = source("src/components/AgentPresencePstnBridge.tsx");
    expect(bridge).toContain("feedPcmDelta");
    expect(bridge).toContain("/api/supervisor/stream");
    const supervisor = source("src/services/supervisor-websocket-service.ts");
    expect(supervisor).toContain("isAllowedVapiListenUrl");
  });
});
