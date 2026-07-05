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
    expect(studioHome).not.toContain("mode=workroom");
  });

  it("launches post-create Train → Wire → Test wizard after Fast Start", () => {
    const createDialog = read("src/components/CreateAgentDialog.tsx");
    const createFlow = read("src/lib/wireline-create-flow.ts");
    const wizard = read("src/components/onboarding/PostCreateActivationWizard.tsx");
    const copy = read("src/lib/wireline-onboarding-copy.ts");

    expect(createDialog).toContain("stashPostCreateWizard");
    expect(createFlow).toContain("POST_CREATE_WIZARD_KEY");
    expect(wizard).toContain("RoleplaySandbox");
    expect(wizard).toContain('step === "train"');
    expect(wizard).toContain('step === "wire"');
    expect(wizard).toContain('step === "test"');
    expect(copy).toContain("POST_CREATE_WIZARD_COPY");
  });

  it("routes presenter lip-sync samples through HeyGen speech", () => {
    const routes = read("src/routes/video-presenter-routes.ts");
    const heygen = read("src/lib/video-presenter/heygen-voice-service.ts");
    const preview = read("src/components/AgentPresenceLivePreview.tsx");
    const decode = read("src/lib/voice/decode-browser-audio.ts");

    expect(heygen).toContain("generatePresenterSpeech");
    expect(routes).toContain('format: "mp3"');
    expect(routes).toContain('voiceProvider === "presenter"');
    expect(preview).toContain("mp3Base64ChunksToPcmBinary");
    expect(decode).toContain("LIVEAVATAR_PCM_RATE_HZ");
  });
});
