import { existsSync, readFileSync } from "node:fs";
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
    expect(dialog).toContain("Not now");
    expect(dialog).not.toMatch(/CreateAgentCatalogFacePicker|AgentPresenceAvatarPicker|avatar/i);
  });

  it("starts bounded LiveAvatar LITE sessions on the server", () => {
    const service = source("src/lib/video-presenter/liveavatar-service.ts");
    const routes = source("src/routes/video-presenter-routes-base.ts");
    expect(service).toContain('mode: "LITE"');
    expect(service).toContain("/v1/sessions/token");
    expect(service).toContain("mintLiveAvatarLiteSessionToken");
    expect(routes).toContain("LIVE_VIDEO_MAX_SESSION_SECONDS");
    expect(routes).toContain("maxSessionDurationSeconds: LIVE_VIDEO_MAX_SESSION_SECONDS");
  });

  it("uses the official LiveAvatar Web SDK in the browser", () => {
    const live = source("src/components/LiveVideoPresenter.tsx");
    expect(live).toContain("@heygen/liveavatar-web-sdk");
    expect(live).toContain("LiveAvatarSession");
    expect(live).toContain("repeatAudio");
    expect(live).toContain("stop: () => Promise<void>");
    expect(live).toContain("await session.stop().catch(() => undefined)");
    expect(existsSync(resolve(root, "src/components/AgentPresenceLivePreview.tsx"))).toBe(false);
  });

  it("mounts a reachable consumption surface for the paid add-on", () => {
    const page = source("src/pages/LiveVideoStudioPage.tsx");
    expect(page).toContain('from "../components/AgentPresenceAvatarPicker"');
    expect(page).toContain('from "../components/LiveVideoPresenter"');
    expect(page).toContain("/video-presenter/enable");
    expect(page).toContain("/video-presenter/session");
    expect(page).toContain("consentAcknowledged: true");

    const routes = source("src/routes/AppRoutes.tsx");
    const liveVideoMount = routes.indexOf('path="/studio/live-video"');
    const studioWildcard = routes.indexOf('path="/studio/*"');
    expect(liveVideoMount).toBeGreaterThan(-1);
    expect(studioWildcard).toBeGreaterThan(-1);
    expect(liveVideoMount).toBeLessThan(studioWildcard);

    const billingCard = source("src/components/StripeBillingCard.tsx");
    expect(billingCard).toContain('to="/studio/live-video"');
  });

  it("uses authoritative paid entitlement instead of the webhook cache across product surfaces", () => {
    const page = source("src/pages/LiveVideoStudioPage.tsx");
    expect(page).toContain("const entitled = addon?.billingEntitled === true");
    expect(page).not.toContain("billingEntitled || addon?.liveVideoAddonEnabled");
    expect(page).toContain("liveVideoCheckoutAvailable === true");
    expect(page).toContain("addon.reason");
    expect(page).toContain('to="/settings/billing"');
    expect(page).toContain("liveVideoMinutesIncluded");
    expect(page).toContain("liveVideoSessionMinutes");

    const billingCard = source("src/components/StripeBillingCard.tsx");
    expect(billingCard).toContain("liveVideoAddon.billingEntitled ?");
    expect(billingCard).not.toContain(
      "liveVideoAddon.liveVideoAddonEnabled || liveVideoAddon.billingEntitled",
    );
    expect(billingCard).toContain("liveVideoAddon.reason");

    const types = source("src/lib/video-presenter/types.ts");
    expect(types).toContain("never use this alone as payment proof");
    expect(types).toContain("liveVideoMinutesIncluded?: number");
    expect(types).toContain("liveVideoSessionMinutes?: number");
  });

  it("shows reserved usage before spend and lets an account holder disable one agent", () => {
    const routes = source("src/routes/video-presenter-routes.ts");
    expect(routes).toContain('"/api/video-presenter/usage"');
    expect(routes).toContain("getLiveVideoUsageSnapshot(req.user.id)");
    expect(routes).toContain('"/api/agents/:id/video-presenter/disable"');
    expect(routes).toContain('videoPresenterProvider: "synthetic"');
    expect(routes).toContain('videoPresenterConsentStatus: "not_started"');
    expect(routes).not.toMatch(/videoPresenterProvider: "synthetic"[\s\S]{0,180}videoPresenterAvatarId/);

    const page = source("src/pages/LiveVideoStudioPage.tsx");
    expect(page).toContain('authFetch("/api/video-presenter/usage")');
    expect(page).toContain("remainingMinutes");
    expect(page).toContain("sessionReservationMinutes");
    expect(page).toContain("Turn off for this agent");
    expect(page).toContain("/video-presenter/disable");
    expect(page).toContain("presenter choice is saved for later");
  });

  it("seeds business agents with synthetic identity until live video is explicitly enabled", () => {
    const routes = source("src/routes/agent-routes-v2.ts");
    expect(routes).toContain("businessAgentVideoPresenterDefaults");
    const defaults = source("src/lib/video-presenter/liveavatar-service.ts");
    expect(defaults).toContain('videoPresenterProvider: "synthetic"');
  });

  it("keeps the legacy presenter speech sample separate from the mounted Live Video session path", () => {
    const routes = source("src/routes/video-presenter-routes-base.ts");
    expect(routes).toContain("/api/agents/:id/video-presenter/sample");
    expect(routes).toContain("generatePresenterSpeech");
    expect(routes).toContain("LIVE_VIDEO_NO_VOICE");
    expect(existsSync(resolve(root, "src/components/AgentPresenceLivePreview.tsx"))).toBe(false);
    expect(existsSync(resolve(root, "src/lib/voice/decode-browser-audio.ts"))).toBe(false);
    const page = source("src/pages/LiveVideoStudioPage.tsx");
    expect(page).not.toContain("/video-presenter/sample");
    const live = source("src/components/LiveVideoPresenter.tsx");
    expect(live).toContain("feedPcmDelta");
    const sandbox = source("src/components/OpenAILiveVoiceSandbox.tsx");
    expect(sandbox).toContain("onAgentAudioDelta");
  });

  it("offers live video as an explicit paid opt-in add-on with an operator kill switch", () => {
    const entitlements = source("src/lib/video-presenter/live-video-entitlements.ts");
    expect(entitlements).toContain("WIRELINE_LIVE_VIDEO_DISABLED");
    expect(entitlements).toContain("terminalPaidPeriodGrace");
    expect(entitlements).toContain(
      "const billingEntitled = addonOffered && workspaceFlag && existingAddonEntitled",
    );
    expect(entitlements).toContain(
      "const checkoutAvailable = addonOffered && baseSubscriptionActive && priceConfigured",
    );
    expect(entitlements).not.toContain("workspaceFlag ||");

    const routes = source("src/routes/video-presenter-routes.ts");
    expect(routes).toContain("/video-presenter/enable");
    expect(source("src/routes/video-presenter-routes-base.ts")).toContain(
      "LIVE_VIDEO_UPGRADE_REQUIRED",
    );
    expect(existsSync(resolve(root, "src/components/AgentPresenceLivePreview.tsx"))).toBe(false);
  });

  it("loads and saves public presenter catalog choices through authenticated Wireline routes", () => {
    const routes = source("src/routes/video-presenter-routes-base.ts");
    expect(routes).toContain("listPublicAvatars");
    expect(routes).toContain('"/api/video-presenter/avatars"');
    const picker = source("src/components/AgentPresenceAvatarPicker.tsx");
    expect(picker).toContain('authFetch("/api/video-presenter/avatars")');
    expect(picker).toContain("JSON.stringify({ avatarId })");
    expect(picker).toContain("aria-pressed={selected}");
    expect(picker).not.toContain("Presence catalog paused");
    const resolve = source("src/lib/video-presenter/resolve-agent-presenter.ts");
    expect(resolve).toContain("chosenAvatarId");
  });

  it("bridges PSTN call audio from Vapi listenUrl into LiveAvatar lip-sync", () => {
    const schema = source("src/db/schema.ts");
    expect(schema).toContain('listenUrl: text("listen_url")');
    const vapi = source("src/routes/vapi-v2.ts");
    expect(vapi).toContain("listenUrl");
    expect(existsSync(resolve(root, "src/components/AgentPresencePstnBridge.tsx"))).toBe(false);
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
    expect(billing).toContain("LIVE_VIDEO_CATALOG_UNAVAILABLE");
    expect(billing).toContain("LIVE_VIDEO_BASE_PLAN_REQUIRED");
    expect(billing).toContain("...stripeCheckoutTaxConfig()");
    const manifest = source("scripts/lib/stripe-founder-catalog.mjs");
    expect(manifest).toContain("STRIPE_LIVE_VIDEO_ADDON_PRICE_ID");
    expect(manifest).toContain('session_reservation_minutes: "5"');
    expect(manifest).toContain('wireline_catalog_state: "launch_active"');
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
