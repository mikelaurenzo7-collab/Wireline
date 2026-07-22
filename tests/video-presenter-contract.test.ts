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
    expect(dialog).toContain("Voice, phone, and testing come next in Studio.");
    expect(dialog).not.toMatch(/CreateAgentCatalogFacePicker|AgentPresenceAvatarPicker|avatar/i);
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

  it("seeds business agents with synthetic identity until live video add-on is enabled", () => {
    const routes = source("src/routes/agent-routes-v2.ts");
    expect(routes).toContain("businessAgentVideoPresenterDefaults");
    const defaults = source("src/lib/video-presenter/liveavatar-service.ts");
    expect(defaults).toContain('videoPresenterProvider: "synthetic"');
  });

  it("streams agent voice into LiveAvatar LITE via sample route + SDK audio", () => {
    const routes = source("src/routes/video-presenter-routes-base.ts");
    expect(routes).toContain("/api/agents/:id/video-presenter/sample");
    expect(routes).toContain("generatePresenterSpeech");
    expect(routes).toContain("LIVE_VIDEO_NO_VOICE");
    const live = source("src/components/LiveVideoPresenter.tsx");
    expect(live).toContain("feedPcmDelta");
    const sandbox = source("src/components/LiveVoiceSandbox.tsx");
    expect(sandbox).toContain("onAgentAudioDelta");
  });

  it("offers live video as an explicit opt-in add-on", () => {
    const routes = source("src/routes/video-presenter-routes.ts");
    expect(routes).toContain("/video-presenter/enable");
    expect(source("src/routes/video-presenter-routes-base.ts")).toContain(
      "LIVE_VIDEO_UPGRADE_REQUIRED",
    );
    const preview = source("src/components/AgentPresenceLivePreview.tsx");
    expect(preview).toContain("Add live video");
    expect(preview).toContain("live-video-checkout");
    expect(preview).toContain("liveVideoMeteringNote");
    expect(preview).toContain("catalogReadyForLiveVideo");
    expect(preview).toContain("Checkout stays hidden until Presence Catalog selection returns");
  });

  it("imports catalog listing for the avatar picker route", () => {
    const routes = source("src/routes/video-presenter-routes-base.ts");
    expect(routes).toContain("listPublicAvatars");
  });

  it("pauses catalog presenter pickers until the curated Presence Catalog is ready", () => {
    const picker = source("src/components/AgentPresenceAvatarPicker.tsx");
    expect(picker).toContain("Presence catalog paused");
    expect(picker).not.toContain('provider: "liveavatar"');
    const resolve = source("src/lib/video-presenter/resolve-agent-presenter.ts");
    expect(resolve).toContain("chosenAvatarId");
  });

  it("bridges PSTN call audio from Vapi listenUrl into LiveAvatar lip-sync", () => {
    const schema = source("src/db/schema.ts");
    expect(schema).toContain('listenUrl: text("listen_url")');
    const vapi = source("src/routes/vapi-v2.ts");
    expect(vapi).toContain("listenUrl");
    const bridge = source("src/components/AgentPresencePstnBridge.tsx");
    expect(bridge).toContain("feedPcmDelta");
    expect(bridge).toContain("vapiListenPcmToLiveAvatarBase64");
    expect(bridge).toContain("/api/supervisor/stream");
    const supervisor = source("src/services/supervisor-websocket-service.ts");
    expect(supervisor).toContain("isAllowedVapiListenUrl");
    expect(supervisor).not.toContain("verifyCallOwnership");
    expect(source("src/lib/vapi-listen-gate.ts")).toContain("speech-update");
    expect(supervisor).toContain("isVapiAssistantSpeaking");
  });

  it("exposes Stripe live video add-on checkout", () => {
    const billing = source("src/routes/billing-routes.ts");
    expect(billing).toContain("/billing/live-video-checkout");
    expect(billing).toContain("live_video_addon");
    expect(source("scripts/lib/stripe-founder-catalog.mjs")).toContain(
      "STRIPE_LIVE_VIDEO_ADDON_PRICE_ID",
    );
    expect(source("src/components/StripeBillingCard.tsx")).toContain("live-video-checkout");
  });

  it("streams call-floor presence via SSE with polling fallback", () => {
    const hook = source("src/hooks/usePresenceSignals.ts");
    expect(hook).toContain("/api/Assistants/presence/stream");
    expect(hook).toContain("/api/Assistants/presence");
    const calls = source("src/components/CallLogsClaude.tsx");
    expect(calls).toContain("usePresenceSignals");
    expect(calls).not.toContain("setInterval(loadPresence");
  });
});
