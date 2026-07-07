import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("authenticated agent flow", () => {
  it("routes fresh signups into the real create flow", () => {
    const authPortal = read("src/components/AuthPortal.tsx");
    const authRedirect = read("src/lib/auth-redirect.ts");
    const onboardingFlow = read("src/pages/OnboardingFlow.tsx");
    const appShell = read("src/components/layout/AppShell.tsx");

    expect(authPortal).toContain(
      'preferredPlanId: nextMode === "business" ? "business" : "personal"',
    );
    expect(authRedirect).toContain(
      'workspaceMode === "business" ? "/studio?create=1&posture=business" : "/studio?create=1"',
    );
    expect(onboardingFlow).toContain("Opening your first agent");
    expect(onboardingFlow).not.toContain("Link your phone");
    expect(appShell).not.toContain("ActivationCheckpoint");
  });

  it("gates live work on phone provision, not agent draft create", () => {
    const trialGate = read("src/lib/trial-gate.ts");
    const agentRoutes = read("src/routes/agent-routes-v2.ts");
    const carrierRoutes = read("src/routes/carrier-routes.ts");

    expect(trialGate).toContain("enforceLiveWorkActivation");
    expect(trialGate).toContain("POST /api/agents` is not gated here");
    expect(agentRoutes).not.toContain("enforceLiveWorkActivation");
    expect(carrierRoutes).toContain("enforceLiveWorkActivation");
    expect(carrierRoutes).toContain('"/api/phone-numbers/provision"');
  });

  it("mounts insights and daily brief on active workspace routes", () => {
    const appRoutes = read("src/routes/AppRoutes.tsx");
    const overview = read("src/pages/OverviewPage.tsx");

    expect(appRoutes).toContain('path="/insights" element={<InsightsPage');
    expect(overview).toContain("DailyBriefPanel");
    expect(overview).toContain('href: "/insights"');
  });

  it("keeps studio as the authenticated run surface entry", () => {
    const appRoutes = read("src/routes/AppRoutes.tsx");
    const createDialog = read("src/components/CreateAgentDialog.tsx");
    const productCopy = read("src/lib/product-copy.ts");
    const mobileUtilities = read("src/components/MobileBrowserUtilities.tsx");
    const studioHome = read("src/pages/AgentStudioHomeClaude.tsx");

    expect(appRoutes).toContain('path="/studio" element={<AgentStudioHome');
    expect(createDialog).toContain("Fast Start");
    expect(createDialog).toContain("~3 minutes to your first agent");
    expect(createDialog).toContain("VoicePickerField");
    expect(createDialog).toContain("CreateAgentCatalogFacePicker");
    expect(productCopy).toContain('createHeadline: "Wire an agent."');
    expect(productCopy).toContain('emptyCue: "Brief it. Train it.');

    expect(mobileUtilities).toContain('pathname === "/studio"');
    expect(mobileUtilities).toContain('pathname.startsWith("/studio/")');
    expect(mobileUtilities).toContain('pathname.startsWith("/settings")');

    expect(studioHome).toContain('params.get("brief")');
    expect(studioHome).toContain("PostCreateActivationWizard");
    expect(studioHome).toContain("readPostCreateWizard");
    expect(studioHome).not.toContain("mode=workroom");
  });

  it("keeps Fast Start broad enough for sales, support, personal, and call coverage", () => {
    const createDialog = read("src/components/CreateAgentDialog.tsx");

    expect(createDialog).toContain("Revenue Desk");
    expect(createDialog).toContain("Support Desk");
    expect(createDialog).toContain("Sales, support, scheduling, overflow");
    expect(createDialog).toContain("Qualify inbound demand, answer support questions");
    expect(createDialog).toContain("Provision Wireline number");
    expect(createDialog).not.toContain("Handle pharmacy calls");
  });

  it("launches post-create Train → Channels → Wire → Test wizard after Fast Start", () => {
    const createDialog = read("src/components/CreateAgentDialog.tsx");
    const createFlow = read("src/lib/wireline-create-flow.ts");
    const wizard = read("src/components/onboarding/PostCreateActivationWizard.tsx");
    const copy = read("src/lib/wireline-onboarding-copy.ts");

    expect(createDialog).toContain("stashPostCreateWizard");
    expect(createFlow).toContain("POST_CREATE_WIZARD_KEY");
    expect(createFlow).toContain("readPostCreateWizard");
    expect(createFlow).toContain("clearPostCreateWizard");
    expect(createFlow).toContain("POST_CREATE_WIZARD_STEP_KEY");
    expect(wizard).toContain("RoleplaySandbox");
    expect(wizard).toContain('step === "train"');
    expect(wizard).toContain('step === "channels"');
    expect(wizard).toContain('step === "wire"');
    expect(wizard).toContain('step === "test"');
    expect(wizard).toContain("clearPostCreateWizard");
    expect(wizard).toContain("stashPostCreateWizardStep");
    expect(copy).toContain("POST_CREATE_WIZARD_COPY");
    expect(copy).toContain("channels:");
  });

  it("routes presenter lip-sync samples through HeyGen speech", () => {
    const routes = read("src/routes/video-presenter-routes.ts");
    const heygen = read("src/lib/video-presenter/heygen-voice-service.ts");
    const preview = read("src/components/AgentPresenceLivePreview.tsx");
    const decode = read("src/lib/voice/decode-browser-audio.ts");

    expect(heygen).toContain("generatePresenterSpeech");
    expect(heygen).toContain("assertTrustedHeyGenMediaUrl");
    expect(routes).toContain('format: "mp3"');
    expect(routes).toContain('voiceProvider === "presenter"');
    expect(preview).toContain("mp3Base64ChunksToPcmBinary");
    expect(decode).toContain("LIVEAVATAR_PCM_RATE_HZ");
  });

  it("provisions on Fast Start when the user opts in", () => {
    const createDialog = read("src/components/CreateAgentDialog.tsx");
    const createFlow = read("src/lib/wireline-create-flow.ts");

    expect(createDialog).toContain('"/api/phone-numbers/provision"');
    expect(createDialog).toContain("phoneProvisioned");
    expect(createDialog).not.toContain("deferPhoneProvision");
    expect(createFlow).toContain("phoneProvisioned");
  });

  it("scopes wizard phone state to the created agent only", () => {
    const wizard = read("src/components/onboarding/PostCreateActivationWizard.tsx");

    expect(wizard).toContain("row.agent_id === payload.agentId");
    expect(wizard).not.toContain("numbers[0]");
    expect(wizard).toContain("ACTIVATION_REQUIRED");
  });

  it("rate-limits public curated voice previews", () => {
    const voices = read("src/routes/voices-routes.ts");

    expect(voices).toContain("curatedPreviewRateLimiter");
    expect(voices).toContain('"/api/voices/curated/preview"');
  });

  it("routes presenter PSTN through dual phone voice columns", () => {
    const schema = read("src/db/schema.ts");
    const factory = read("src/lib/vapi-assistant-factory-v2.ts");
    const routes = read("src/routes/agent-routes-v2.ts");
    const createDialog = read("src/components/CreateAgentDialog.tsx");

    expect(schema).toContain("phoneVoiceId");
    expect(schema).toContain("phoneVoiceProvider");
    expect(factory).toContain("configured.phoneVoiceProvider");
    expect(factory).toContain("configured.phoneVoiceId");
    expect(routes).toContain("phoneVoiceId");
    expect(createDialog).toContain("phoneVoiceId");
    expect(createDialog).toContain("defaultPresenterPhoneVoicePayload");
  });

  it("surfaces custom presence consent FTUX for business agents", () => {
    const preview = read("src/components/AgentPresenceLivePreview.tsx");
    const panel = read("src/components/video-presenter/CustomPresenceConsentPanel.tsx");

    expect(preview).toContain("CustomPresenceConsentPanel");
    expect(preview).toContain("consentStatus");
    expect(panel).toContain("Submit for review");
    expect(panel).toContain("rights to use this likeness");
  });
});
