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
    const workspaceShell = read("src/components/WorkspaceShell.tsx");

    // Workspace mode drives signup intent into the current 5-tier commercial model.
    expect(authPortal).toContain("const SIGNUP_PLAN_LABELS");
    expect(authPortal).toContain('nextMode === "personal"');
    expect(authPortal).toContain('import WirelineMark from "./brand/WirelineMark"');
    // The auth funnel stays minimal (PR #738): product promise, not a decorative loop grid.
    expect(authPortal).toContain("Build your first AI employee.");
    expect(authPortal).not.toContain('<span className="wl-auth-brand-badge">W</span>');
    expect(workspaceShell).toContain('import WirelineMark from "./brand/WirelineMark"');
    expect(workspaceShell).not.toMatch(/>\s*W\s*<\/span>/);
    expect(authRedirect).toContain(
      'workspaceMode === "business" ? "/studio?create=1&posture=business" : "/studio?create=1"',
    );
    expect(authPortal.match(/navigate\(resolvePostAuthDestination/g)).toHaveLength(1);
    expect(onboardingFlow).toContain("Opening your first agent");
    expect(onboardingFlow).not.toContain("Link your phone");
    expect(appShell).not.toContain("ActivationCheckpoint");
  });

  it("gates live work on phone provision, not agent draft create", () => {
    const trialGate = read("src/lib/trial-gate.ts");
    const agentRoutes = read("src/routes/agent-routes-v2.ts");
    const carrierRoutes = read("src/routes/carrier-routes.ts");

    expect(trialGate).toContain("enforceLiveWorkActivation");
    expect(trialGate).toContain("other provider-spending live actions until verified");
    expect(agentRoutes).not.toContain("enforceLiveWorkActivation");
    expect(carrierRoutes).toContain("enforceLiveWorkActivation");
    expect(carrierRoutes).toContain('"/api/phone-numbers/provision"');
  });

  it("mounts insights and outcome review on active workspace routes", () => {
    const appRoutes = read("src/routes/AppRoutes.tsx");
    const overview = read("src/pages/OverviewPage.tsx");
    const nav = read("src/constants/navigation.ts");

    expect(appRoutes).toContain('path="/insights" element={<InsightsPage');
    expect(nav).toMatch(/href:\s*["']\/insights["']/);
    // The daily-brief panel was retired with the demand-driven Overview;
    // outcomes surface through the ledger and follow-up review paths instead.
    expect(overview).not.toContain("DailyBriefPanel");
    expect(overview).toContain("OutcomeLedger");
    expect(overview).toContain('to="/approvals"');
  });

  it("gives first-time users real mailbox connection actions", () => {
    const connections = read("src/pages/ConnectionsPage.tsx");
    const mailboxes = read("src/components/MailboxConnectionCard.tsx");
    expect(connections).toContain("MailboxConnectionCard");
    expect(connections.indexOf("<MailboxConnectionCard")).toBeLessThan(
      connections.indexOf("<IntegrationOperatingMap"),
    );
    expect(mailboxes).toContain("/api/oauth/${provider}/url");
    expect(mailboxes).toContain("/api/emails/accounts");
    expect(mailboxes).toContain("OAUTH_AUTH_SUCCESS");
    expect(mailboxes).toContain("EMAIL_OAUTH_SUCCESS");
    expect(mailboxes).toContain('authFetch("/api/emails/sync"');
  });

  it("keeps studio as the authenticated run surface entry", () => {
    const appRoutes = read("src/routes/AppRoutes.tsx");
    const createDialog = read("src/components/CreateAgentDialog.tsx");
    const productCopy = read("src/lib/product-copy.ts");
    const mobileUtilities = read("src/components/MobileBrowserUtilities.tsx");
    const studioHome = read("src/pages/AgentStudioHomeClaude.tsx");

    expect(appRoutes).toContain('path="/studio" element={<AgentStudioHome');
    expect(createDialog).toContain("Fast Start");
    expect(createDialog).toContain("AI employee in about a minute");
    // Fast Start is a single brief-first screen; voice, phone, and testing
    // are deliberately deferred into Studio.
    expect(createDialog).toContain("Voice, phone, and testing come next in Studio.");
    expect(createDialog).not.toContain("VoicePickerField");
    expect(createDialog).not.toContain("CreateAgentCatalogFacePicker");
    expect(productCopy).toContain('createHeadline: "Build your best employee."');
    expect(productCopy).toContain(
      'emptyCue: "Brief it. Train it once. Connect calls, texts, and email."',
    );

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
    expect(createDialog).toContain("Sales, support, and scheduling");
    expect(createDialog).toContain("Qualify inbound demand, answer support questions");
    expect(createDialog).not.toContain("Handle pharmacy calls");
  });

  it("keeps template gallery searchable and accessible", () => {
    const templates = read("src/components/AgentTemplates.tsx");

    expect(templates).toContain("searchableTemplateText");
    expect(templates).toContain("template.firstMessage");
    expect(templates).toContain("Search templates, roles, channels…");
    expect(templates).toContain('role="group"');
    expect(templates).toContain('aria-label="Template category filter"');
    expect(templates).toContain("aria-pressed={selected}");
    expect(templates).toContain("Clear search");
    expect(templates).toContain(
      'aria-label={`${alreadyDeployed ? "Deploy another" : "Deploy"} ${template.name} agent`}',
    );
    expect(templates).not.toContain("hidden hidden");
  });

  it("launches post-create Train → Channels → Wire → Test wizard after Fast Start", () => {
    const createDialog = read("src/components/CreateAgentDialog.tsx");
    const studioHome = read("src/pages/AgentStudioHomeClaude.tsx");
    const createFlow = read("src/lib/wireline-create-flow.ts");
    const wizard = read("src/components/onboarding/PostCreateActivationWizard.tsx");
    const copy = read("src/lib/wireline-onboarding-copy.ts");

    expect(createDialog).toContain("stashPostCreateWizard");
    expect(createDialog).toContain("onCreated?.(wizardPayload)");
    expect(studioHome).toContain("onCreated={setPostCreateWizard}");
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
    const routes = read("src/routes/video-presenter-routes-base.ts");
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

  it("persists the deploy modal's template identity on create", () => {
    const routes = read("src/routes/agent-routes-v2.ts");
    const templates = read("src/components/AgentTemplates.tsx");
    const deployModal = read("src/components/DeployAgentModal.tsx");

    // Quick Deploy promises the picked voice, channel, opening line, and
    // template personality — the create route must actually store them.
    expect(routes).toContain("cleanText(req.body?.voice_id, 160)");
    expect(routes).toContain("isManagedVapiVoiceId(requestedVoiceId)");
    expect(routes).toContain('voiceProvider: "vapi"');
    expect(routes).not.toContain('voiceProvider: "11labs"');
    expect(routes).toContain('req.body?.channel === "email"');
    expect(routes).toContain("cleanText(req.body?.firstMessage, 500)");
    // Template personalities stack role methodology + overlay and substitute
    // business tokens; the factory consumes the stored personality verbatim.
    expect(routes).toContain("composeAgentPersonality");
    expect(routes).toContain("TEMPLATE_OVERLAYS[templateId]");
    expect(templates).toContain("voice_id: values.voiceId");
    expect(deployModal).toContain("VAPI_CURATED_VOICES");
    expect(deployModal).toContain("MANAGED_VOICE_BY_GENDER");
    expect(deployModal).not.toMatch(/PREMIUM_VOICES|\/api\/voices\/|VoicePreviewButton/);
  });

  it("defers phone provisioning from Fast Start into the post-create wizard", () => {
    const createDialog = read("src/components/CreateAgentDialog.tsx");
    const wizard = read("src/components/onboarding/PostCreateActivationWizard.tsx");
    const createFlow = read("src/lib/wireline-create-flow.ts");

    expect(createDialog).not.toContain('"/api/phone-numbers/provision"');
    expect(createDialog).toContain("phoneProvisioned: false");
    expect(wizard).toContain('"/api/phone-numbers/provision"');
    expect(createFlow).toContain("phoneProvisioned");
  });

  it("scopes wizard phone state to the created agent only", () => {
    const wizard = read("src/components/onboarding/PostCreateActivationWizard.tsx");

    expect(wizard).toContain("row.agent_id === payload.agentId");
    expect(wizard).not.toContain("numbers[0]");
    expect(wizard).toContain("ACTIVATION_REQUIRED");
  });

  it("authenticates and rate-limits provider-backed voice previews", () => {
    const voices = read("src/routes/voices-routes.ts");

    expect(voices).toContain("curatedPreviewRateLimiter");
    expect(voices).toContain("voicePreviewUserRateLimiter");
    expect(voices).toContain("fetchTrustedPreview");
    // Trusted hosts can serve real audio with text/plain headers (GCS), so
    // previews must be validated by payload magic bytes, not headers alone.
    expect(voices).toContain("sniffAudioContentType");
    expect(voices).toContain('"/api/voices/curated/preview"');
    expect(voices).toContain('"/api/voices/:id/preview"');
  });

  it("routes every PSTN call through the managed Vapi voice runtime", () => {
    const schema = read("src/db/schema.ts");
    const factory = read("src/lib/vapi-assistant-factory-v2.ts");
    const routes = read("src/routes/agent-routes-v2.ts");

    // Dual phone-voice columns remain persisted for continuity, but the live
    // factory clamps every call to a curated managed Vapi voice.
    expect(schema).toContain("phoneVoiceId");
    expect(schema).toContain("phoneVoiceProvider");
    expect(factory).toContain("isManagedVapiVoiceId");
    expect(factory).toContain("DEFAULT_MANAGED_VOICE_ID");
    expect(factory).not.toContain("configured.phoneVoiceProvider");
    expect(routes).toContain("phoneVoiceId");
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
