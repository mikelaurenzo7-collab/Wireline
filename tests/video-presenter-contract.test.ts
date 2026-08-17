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

  it("uses the official LiveAvatar Web SDK in a stable widescreen stage", () => {
    const live = source("src/components/LiveVideoPresenter.tsx");
    const presenceCss = source("src/styles/agent-presence.css");
    expect(live).toContain("@heygen/liveavatar-web-sdk");
    expect(live).toContain("LiveAvatarSession");
    expect(live).toContain("repeatAudio");
    expect(live).toContain("const minBytes = 19_200");
    // Also covers a session that connects after the stage gave up on it —
    // stop() no-ops while CONNECTING, so it has to be re-issued post-connect.
    expect(live).toContain(
      "if (cancelled || abandonedAfterDeadline) await session.stop().catch(() => undefined)",
    );
    expect(live).toContain('layout?: "portrait" | "stage"');
    expect(live).toContain('"wl-presence-live--stage"');
    expect(live).toContain("onSpeakingChangeRef.current = onSpeakingChange");
    expect(live).toContain("onStreamReadyRef.current = onStreamReadyChange");
    // Session lifetime keys only to the minted token plus the audio-direction
    // flag derived from the same server response — never to parent callbacks,
    // which are kept in refs above so re-renders cannot restart a paid session.
    expect(live).toContain("}, [sessionToken, wirelineDrivesAudio]);");
    expect(live).toContain("stop: () => Promise<void>");
    expect(live).toContain("await session.stop().catch(() => undefined)");
    expect(presenceCss).toContain(".wl-presence-live--stage");
    expect(presenceCss).toContain("aspect-ratio: 16 / 9");
    expect(presenceCss).toContain("max-width: none");
    expect(existsSync(resolve(root, "src/components/AgentPresenceLivePreview.tsx"))).toBe(false);
  });

  it("routes microphone and speaker by session mode so provider-driven presenters work", () => {
    const live = source("src/components/LiveVideoPresenter.tsx");
    // Wireline-driven LITE keeps the SDK off the microphone (the Wireline
    // voice surface owns capture) and keeps the provider track muted (agent
    // audio already plays through that surface). Provider-driven modes invert
    // both: the provider needs the mic and its track is the only speech.
    expect(live).toContain("sessionExpectsWirelineAudio(credentials)");
    expect(live).toContain("voiceChat: !wirelineDrivesAudio");
    expect(live).toContain("element.muted = wirelineDrivesAudio");
    expect(live).toContain("muted={wirelineDrivesAudio}");
    // Blocked unmuted autoplay surfaces a control instead of a silent presenter.
    // ("Turn on sound" rather than "Tap to…": the stage is used on desktop at
    // least as often as on touch.)
    expect(live).toContain("Turn on sound");
    expect(live).toContain("setSoundBlocked(false)");
  });

  it("gives the Studio-voice presenter the agent's phone voice only when PSTN-approved", () => {
    const routes = source("src/routes/video-presenter-routes-base.ts");
    // Exactly the live-call rule: ElevenLabs provider plus curated-or-approved
    // clone, checked against this tenant's own rows. Nothing else passes.
    expect(routes).toContain("approvedAgentElevenLabsVoice");
    expect(routes).toContain('agent.voiceProvider !== "11labs"');
    expect(routes).toContain("isCuratedElevenLabsVoiceId(voiceId)");
    expect(routes).toContain('eq(schema.clonedVoices.status, "approved")');
    expect(routes).toContain("eq(schema.clonedVoices.userId, userId)");
    expect(routes).toContain(
      "agentElevenLabsVoiceId: await approvedAgentElevenLabsVoice(agent, req.user.id)",
    );
  });

  it("offers the voice-engine choice in Studio and reports a degraded mint truthfully", () => {
    const studio = source("src/pages/LiveVideoStudioPage.tsx");
    // The server owns resolution; the client only expresses a preference.
    expect(studio).toContain("JSON.stringify({ voiceEngine })");
    // The picker appears only when the workspace really has a choice.
    expect(studio).toContain("engineChoiceOffered = availableEngines.length > 1");
    expect(studio).toContain("Presenter voice engine");
    // A degraded session says so in the UI instead of silently switching voices.
    expect(studio).toContain("sessionDegraded");
    expect(studio).toContain("This stage opened with the Wireline voice.");
  });

  it("gives the paid add-on quiet discovery from the primary surface", () => {
    // Live Video's only front door used to be inside Studio. The Overview
    // business roster now links it; the target page owns the entitlement
    // story, so the row is truthful for subscribed and unsubscribed accounts.
    const overview = source("src/pages/OverviewPage.tsx");
    expect(overview).toContain('to="/studio/live-video"');
    expect(overview).toContain(">Live Video</span>");
    expect(overview).toContain('kind === "business"');
    expect(overview).toContain("OVERVIEW_AGENT_PREVIEW");
    expect(overview).toContain("more in Studio");
  });

  it("meters FULL-mode sessions at their provider credit rate", () => {
    // A FULL session burns 2 provider credits per wall-clock minute against
    // LITE's 1. If the reservation stays flat, the modeled margin and the
    // pause-at-limit promise silently halve the moment an operator enables
    // FULL mode — so the allowance must draw down at the resolved rate.
    const policy = source("src/lib/video-presenter/live-video-policy.ts");
    expect(policy).toContain("export function liveVideoSessionReservationMinutes");
    const usage = source("src/lib/video-presenter/live-video-usage.ts");
    expect(usage).toContain("liveVideoSessionReservationMinutes(options.creditsPerMinute)");
    expect(usage).toContain("current.remainingMinutes < reservedMinutes");
    const routes = source("src/routes/video-presenter-routes-base.ts");
    // The engine resolves before the reservation so the draw-down rate is the
    // resolved engine's, and a failed mint releases exactly what was reserved.
    expect(routes.indexOf("const engineResolution = resolveLiveVideoEngine")).toBeLessThan(
      routes.indexOf("await reserveLiveVideoSessionMinutes(req.user.id"),
    );
    expect(routes).toContain("creditsPerMinute: engineResolution.creditsPerMinute");
    expect(routes).toContain("reservation.reservedMinutes");
    // The Studio surface tells the truth about the higher draw before minting.
    const studio = source("src/pages/LiveVideoStudioPage.tsx");
    expect(studio).toContain(
      "const reserveMinutes = sessionMinutes * (selectedEngine?.creditsPerMinute ?? 1)",
    );
    expect(studio).toContain("remainingMinutes < reserveMinutes");
  });

  it("keeps operator configuration hints off every tenant-facing payload", () => {
    // The per-engine reasons and degrade reasons name workspace env vars.
    // Tenants get availability and the degrade fact; the hints are served only
    // on the platform-admin health surface and in server logs.
    const service = source("src/lib/video-presenter/liveavatar-service.ts");
    expect(service).toContain("map(({ reason: _reason, ...engine }) => engine)");
    const routes = source("src/routes/video-presenter-routes-base.ts");
    expect(routes).not.toContain("degradeReason: liveSession.degradeReason");
    expect(routes).toContain("{ degradedFrom: liveSession.degradedFrom }");
    const health = source("src/routes/health-routes.ts");
    expect(health).toContain(
      "live_video_engines: describeLiveVideoEngines(readLiveVideoPlatformConfig())",
    );
  });

  it("mounts a reachable, interactive consumption surface for the paid add-on", () => {
    const page = source("src/pages/LiveVideoStudioPage.tsx");
    expect(page).toContain('from "../components/AgentPresenceAvatarPicker"');
    expect(page).toContain('from "../components/LiveVideoPresenter"');
    expect(page).toContain('from "../components/OpenAILiveVoiceSandbox"');
    expect(page).toContain("/video-presenter/enable");
    expect(page).toContain("/video-presenter/session");
    expect(page).toContain("consentAcknowledged: true");
    expect(page).toContain('layout="stage"');
    expect(page).toContain("onStreamReady={() => setPresenterReady(true)}");
    expect(page).toContain("onAgentAudioDelta={(base64Pcm)");
    expect(page).toContain("presenterRef.current?.feedPcmDelta(base64Pcm)");
    expect(page).toContain("onAgentAudioEnd={() => presenterRef.current?.flushPcm()}");

    const sandbox = source("src/components/OpenAILiveVoiceSandbox.tsx");
    expect(sandbox).toContain("const RATE = 24_000");
    expect(sandbox).toContain("floatToBase64Pcm");
    expect(sandbox).toContain("onAgentAudioDelta(floatToBase64Pcm(samples))");

    const routes = source("src/routes/AppRoutes.tsx");
    const liveVideoMount = routes.indexOf('path="/studio/live-video"');
    const studioWildcard = routes.indexOf('path="/studio/*"');
    expect(liveVideoMount).toBeGreaterThan(-1);
    expect(studioWildcard).toBeGreaterThan(-1);
    expect(liveVideoMount).toBeLessThan(studioWildcard);

    const billingCard = source("src/components/StripeBillingCard.tsx");
    expect(billingCard).toContain('to="/studio/live-video"');
    const studioSetup = source("src/components/StudioAgentWorkspacePanel.tsx");
    expect(studioSetup).toContain("/studio/live-video?agent=");
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
    expect(routes).not.toMatch(
      /videoPresenterProvider: "synthetic"[\s\S]{0,180}videoPresenterAvatarId/,
    );

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

  it("retires the incompatible MP3 presenter sample instead of feeding it into LiveAvatar", () => {
    const routes = source("src/routes/video-presenter-routes-base.ts");
    expect(routes).toContain('"/api/agents/:id/video-presenter/sample"');
    expect(routes).toContain('code: "LIVE_VIDEO_SAMPLE_RETIRED"');
    expect(routes).toContain("res.status(410).json");
    expect(routes).not.toContain("generatePresenterSpeech");
    expect(routes).not.toContain('format: "mp3"');
    expect(existsSync(resolve(root, "src/components/AgentPresenceLivePreview.tsx"))).toBe(false);
    expect(existsSync(resolve(root, "src/lib/voice/decode-browser-audio.ts"))).toBe(false);
    const page = source("src/pages/LiveVideoStudioPage.tsx");
    expect(page).not.toContain("/video-presenter/sample");
    expect(page).toContain("OpenAILiveVoiceSandbox");
    const live = source("src/components/LiveVideoPresenter.tsx");
    expect(live).toContain("feedPcmDelta");
    expect(live).toContain("flushPcm");
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

  it("loads and saves a portrait-first public presenter catalog through authenticated routes", () => {
    const routes = source("src/routes/video-presenter-routes-base.ts");
    expect(routes).toContain("listPublicAvatars");
    expect(routes).toContain('"/api/video-presenter/avatars"');
    const picker = source("src/components/AgentPresenceAvatarPicker.tsx");
    expect(picker).toContain('authFetch("/api/video-presenter/avatars")');
    expect(picker).toContain("JSON.stringify({ avatarId })");
    expect(picker).toContain("aria-pressed={selected}");
    expect(picker).toContain("aspect-[4/5]");
    expect(picker).toContain("catalogRequestSerial");
    expect(picker).toContain("onSelectedAvatarChange");
    expect(picker).toContain('placeholder="Search presenters"');
    expect(picker).not.toContain("Presence catalog paused");
    const liveAvatar = source("src/lib/video-presenter/liveavatar-service.ts");
    expect(liveAvatar).toContain("export async function getPublicAvatar");
    expect(liveAvatar).toContain("WIRELINE_LIVE_VIDEO_AVATAR_ALLOWLIST");
    expect(routes).toContain("billingEntitled && !entitlement.liveVideoCheckoutAvailable");
    const resolve = source("src/lib/video-presenter/resolve-agent-presenter.ts");
    expect(resolve).toContain("chosenAvatarId");
  });

  it("settles unused minutes on pagehide and treats any live provider as on", () => {
    const page = source("src/pages/LiveVideoStudioPage.tsx");
    expect(page).toContain('window.addEventListener("pagehide", settleOnHide)');
    expect(page).toContain("keepalive: true");
    expect(page).toContain('credentials: "include"');
    expect(page).toContain("isLiveVideoProvider(presenter?.provider)");
    expect(page).not.toMatch(/presenter\?\.provider === ["']liveavatar["']/);
  });

  it("keeps live-video provider membership client-safe (build-breaking server graph stays out of browser bundles)", () => {
    // LiveVideoStudioPage is a browser bundle. Importing live-video-addon from
    // it drags liveavatar-service -> server-context -> auth-utils (node:crypto)
    // into the Vite client build, which fails with
    // '"createHmac" is not exported by "__vite-browser-external"'.
    const page = source("src/pages/LiveVideoStudioPage.tsx");
    expect(page).toContain('from "../lib/video-presenter/live-video-providers"');
    expect(page).not.toContain('from "../lib/video-presenter/live-video-addon"');

    // The shared membership module must stay pure: type-only imports, no
    // provider services, no server context, no node builtins.
    const providers = source("src/lib/video-presenter/live-video-providers.ts");
    const valueImports = providers
      .split("\n")
      .filter((line) => /^import\s/.test(line) && !/^import\s+type\s/.test(line));
    expect(valueImports).toEqual([]);

    // Server routes keep their single import site; the addon module re-exports
    // membership so the split cannot silently fork the provider list.
    const addon = source("src/lib/video-presenter/live-video-addon.ts");
    expect(addon).toContain(
      'export { agentLiveVideoOptedIn, isLiveVideoProvider } from "./live-video-providers"',
    );
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
