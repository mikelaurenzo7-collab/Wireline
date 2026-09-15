import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8").replace(/\r\n/g, "\n");
}

describe("authenticated Bot flow", () => {
  it("lets the web edit agent tools under the same ownership and validation guards as mobile", () => {
    const agentRoutes = read("src/routes/agent-routes-v2.ts");
    const mobileRoutes = read("src/routes/mobile-routes.ts");
    const permissions = read("src/components/AgentToolPermissions.tsx");

    for (const source of [agentRoutes, mobileRoutes]) {
      expect(source).toContain(
        'throw AppError.fromHttpStatus(400, "enabled_tools must contain known agent tools");',
      );
      expect(source).toContain("normalizeEnabledTools(raw as AgentToolName[])");
      expect(source).toContain("eq(schema.agents.userId, req.user.id)");
    }

    const web = agentRoutes.slice(agentRoutes.indexOf('"/api/agents/:id/tools"'));
    expect(web).toContain("authenticateUser");
    expect(web).toContain("agentMutationRateLimit");
    expect(web.indexOf("owned(req.params.id, req.user.id)")).toBeLessThan(web.indexOf("drizzle"));
    expect(web).toContain('throw AppError.fromHttpStatus(404, "Agent not found");');
    expect(permissions).toContain("resolveAgentTools(undefined, config.enabledTools)");
  });

  it("keeps the tool editor from discarding edits or overstating live capability", () => {
    const permissions = read("src/components/AgentToolPermissions.tsx");
    expect(permissions).toContain("if (loadedAgentRef.current === agentId) return;");
    expect(permissions).toContain("loadedAgentRef.current = agentId;");
    expect(permissions).toContain("loadedAgentRef.current = null;");
    expect(permissions).toMatch(/const \[loading, setLoading\] = useState\(true\)/);
    expect(permissions).toContain("return response.json().catch(() => null);");
    expect(permissions).toContain("Not connected. These stay off in live calls until");
    expect(permissions).toContain("to={playbook.connectPath}");
    expect(read("src/lib/agent-runtime-helpers.ts")).toContain("filterToolsByTenantConnections");
    expect(permissions).toContain("const savedFor = agentId;");
    expect(permissions).toMatch(/if \(loadedAgentRef\.current !== savedFor\) return;/);
    expect(permissions).toContain("encodeURIComponent(savedFor)");
  });

  it("routes every fresh signup into the same real Bot create flow", () => {
    const authPortal = read("src/components/AuthPortal.tsx");
    const authAccess = read("src/components/auth/AuthAccessPanel.tsx");
    const authRedirect = read("src/lib/auth-redirect.ts");
    const onboardingFlow = read("src/pages/OnboardingFlow.tsx");
    const appShell = read("src/components/layout/AppShell.tsx");
    const workspaceShell = read("src/components/WorkspaceShell.tsx");

    expect(authPortal).toContain("AuthAccessPanel");
    expect(authAccess).toContain("function signupPlanLabel(");
    expect(authAccess).toContain("STRIPE_PLANS.find");
    expect(authAccess).toContain("plan.price_usd_annual");
    expect(authAccess).toContain("plan.price_usd_monthly");
    expect(authAccess).not.toContain("const SIGNUP_PLAN_LABELS");
    expect(authAccess).toContain("WirelineLockup");
    expect(authAccess).not.toContain('<span className="wl-auth-brand-badge">W</span>');
    expect(workspaceShell).toContain('import { BotBoundWordmark } from "./brand/BotBoundBrand"');
    expect(workspaceShell).toContain('import BotBoundMark from "./brand/BotBoundMark"');
    expect(workspaceShell).not.toContain("WirelineMark");
    expect(workspaceShell).not.toMatch(/>\s*W\s*<\/span>/);
    expect(authRedirect).toContain('return "/studio?create=1"');
    expect(authRedirect).not.toContain("create=1&posture=");
    expect(authAccess.match(/navigate\(resolvePostAuthDestination/g)).toHaveLength(1);
    expect(onboardingFlow).toContain("language.createCta");
    expect(onboardingFlow).not.toContain("Link your phone");
    expect(appShell).not.toContain("ActivationCheckpoint");
  });

  it("gates provider-spending live work on activation, not draft creation", () => {
    const trialGate = read("src/lib/trial-gate.ts");
    const agentRoutes = read("src/routes/agent-routes-v2.ts");
    const carrierRoutes = read("src/routes/native-phone-routing-routes.ts");

    expect(trialGate).toContain("enforceLiveWorkActivation");
    expect(trialGate).toContain("other provider-spending live actions until verified");
    expect(agentRoutes).not.toContain("enforceLiveWorkActivation");
    expect(carrierRoutes).toContain("enforceLiveWorkActivation");
    expect(carrierRoutes).toContain('"/api/phone-numbers/provision"');
  });

  it("mounts operating truth on active Overview, Inbox, approvals, and analytics routes", () => {
    const appRoutes = read("src/routes/AppRoutes.tsx");
    const overview = read("src/pages/OverviewPage.tsx");
    const nav = read("src/constants/navigation.ts");

    expect(appRoutes).toContain('path="/insights" element={<InsightsPage');
    expect(appRoutes).toContain('path="/inbox"');
    expect(appRoutes).toContain('path="/approvals"');
    expect(nav).toMatch(/href:\s*["']\/insights["']/);
    expect(overview).toContain("UnifiedInbox");
    expect(overview).toContain("OutcomeLedger");
    expect(overview).toContain('followUpsHref="/approvals"');
    expect(overview).not.toContain("DailyBriefPanel");
  });

  it("gives first-time users real mailbox connection actions", () => {
    const connections = read("src/pages/ConnectionsPage.tsx");
    const mailboxes = read("src/components/MailboxConnectionCard.tsx");
    expect(connections).toContain("MailboxConnectionCard");
    expect(connections).toContain("CrmConnectionCard");
    expect(connections).not.toContain("IntegrationOperatingMap");
    expect(mailboxes).toContain("/api/oauth/${provider}/url");
    expect(mailboxes).toContain("/api/emails/accounts");
    expect(mailboxes).toContain("OAUTH_AUTH_SUCCESS");
    expect(mailboxes).toContain("EMAIL_OAUTH_SUCCESS");
    expect(mailboxes).toContain('authFetch("/api/emails/sync"');
  });

  it("keeps Studio as the one authenticated Bot configuration and run surface", () => {
    const appRoutes = read("src/routes/AppRoutes.tsx");
    const createDialog = read("src/components/CreateAgentDialog.tsx");
    const productCopy = read("src/lib/product-copy.ts");
    const mobileUtilities = read("src/components/MobileBrowserUtilities.tsx");
    const studioHome = read("src/pages/AgentStudioHome.tsx");
    const studioWorkspace = read("src/components/StudioWorkspaceV2.tsx");

    expect(appRoutes).toContain('path="/studio" element={<AgentStudioHome');
    expect(createDialog).toContain("{language.setupPrompt}");
    expect(createDialog).toContain("BOT_ROLE_TEMPLATES.map");
    expect(createDialog).toContain("BOT_CHANNELS.map");
    expect(createDialog).toContain("Not Now");
    expect(createDialog).not.toContain("VoicePickerField");
    expect(createDialog).not.toContain("CreateAgentCatalogFacePicker");
    expect(productCopy).toContain('createHeadline: "Build Your Bot"');
    const emptyCue = productCopy.match(/emptyCue:\s*"([^"]+)"/)?.[1] ?? "";
    expect(emptyCue).toMatch(/Describe the job/i);
    for (const capability of ["calls", "text", "email", "knowledge", "tools"]) {
      expect(emptyCue.toLowerCase()).toContain(capability);
    }

    expect(mobileUtilities).toContain('pathname === "/studio"');
    expect(mobileUtilities).toContain('pathname.startsWith("/studio/")');
    expect(mobileUtilities).toContain('pathname.startsWith("/settings")');

    expect(studioHome).toContain('params.get("brief")');
    expect(studioHome).toContain('params.get("template")');
    expect(studioHome).not.toContain('params.get("posture")');
    expect(studioHome).toContain("PostCreateActivationWizard");
    expect(studioHome).toContain("readPostCreateWizard");
    expect(studioWorkspace).toContain('type InspectorSection = "setup" | "review"');
    expect(studioWorkspace).toContain('type WorkroomMode = "configure" | "test"');
    expect(studioWorkspace).not.toContain("useAccount");
    expect(studioWorkspace).not.toContain("posture=");
  });

  it("keeps Fast Start broad across proven roles and custom workflows", () => {
    const createDialog = read("src/components/CreateAgentDialog.tsx");
    const botProduct = read("src/lib/bot-product.ts");

    for (const phrase of [
      "Front Desk",
      "Sales Rep",
      "Appointment Setter",
      "Customer Support",
      "Lead Qualifier",
      "Recruiter",
      "Property Manager",
      "Personal Assistant",
      "Family Concierge",
      "Create Your Own",
    ]) {
      expect(botProduct).toContain(`name: "${phrase}"`);
    }
    expect(botProduct).not.toContain('name: "Collections"');
    expect(createDialog).toContain("BOT_ROLE_TEMPLATES.map");
    expect(createDialog).toContain("BOT_CHANNELS.map");
    expect(createDialog).toContain("Choose a starting point, then make it yours.");
    expect(createDialog).not.toContain("Choose one personal job");
  });

  it("keeps the template gallery searchable and accessible", () => {
    const templates = read("src/components/AgentTemplates.tsx");
    expect(templates).toContain("searchableTemplateText");
    expect(templates).toContain("template.firstMessage");
    expect(templates).toContain("Search templates, roles, channels…");
    expect(templates).toContain('role="group"');
    expect(templates).toContain('aria-label="Template category filter"');
    expect(templates).toContain("aria-pressed={selected}");
    expect(templates).toContain("Clear search");
    expect(templates).not.toContain("hidden hidden");
  });

  it("launches a resumable Train, Test, Launch wizard after Fast Start", () => {
    const createDialog = read("src/components/CreateAgentDialog.tsx");
    const templates = read("src/components/AgentTemplates.tsx");
    const studioHome = read("src/pages/AgentStudioHome.tsx");
    const createFlow = read("src/lib/wireline-create-flow.ts");
    const wizard = read("src/components/onboarding/PostCreateActivationWizard.tsx");
    const copy = read("src/lib/wireline-onboarding-copy.ts");

    expect(createDialog).toContain("stashPostCreateWizard");
    expect(createDialog).toContain("onCreated?.(wizardPayload)");
    expect(templates).toContain("stashPostCreateWizard");
    expect(templates).toContain("isBotMarkKey(data.mark_key)");
    expect(templates).toContain("setPostSignupFlowActive(true)");
    expect(templates).toContain("&section=setup");
    expect(studioHome).toContain("onCreated={setPostCreateWizard}");
    expect(createFlow).toContain("POST_CREATE_WIZARD_KEY");
    expect(createFlow).toContain("readPostCreateWizard");
    expect(createFlow).toContain("clearPostCreateWizard");
    expect(wizard).toContain("RoleplaySandbox");
    expect(wizard).toContain('value === "train"');
    expect(wizard).toContain('value === "test"');
    expect(wizard).toContain('value === "launch"');
    expect(wizard).toContain(
      'const stepOrder: WizardStep[] = ["train", "test", "launch", "complete"]',
    );
    expect(wizard).toContain("clearPostCreateWizard");
    expect(wizard).toContain("stashPostCreateWizardStep");
    expect(copy).toContain("POST_CREATE_WIZARD_COPY");
  });

  it("keeps Live Video retired to a redirect plus BotMark-only compatibility shell", () => {
    const routes = read("src/routes/video-presenter-routes-base.ts");
    const page = read("src/pages/LiveVideoStudioPage.tsx");
    const presenter = read("src/components/LiveVideoPresenter.tsx");

    expect(routes).toContain('code: "LIVE_VIDEO_SAMPLE_RETIRED"');
    expect(routes).toContain("res.status(410).json");
    expect(page).toContain("Live talking-head lip-sync is retired");
    expect(page).toContain('<Navigate to="/studio" replace />');
    expect(page).not.toContain("AgentFace");
    expect(page).not.toContain("OpenAILiveVoiceSandbox");
    expect(presenter).toContain("LiveAvatar / HeyGen WebRTC lip-sync is retired");
    expect(presenter).toContain('import BotMark from "./BotMark"');
    expect(presenter).toContain("<BotMark");
    expect(presenter).not.toContain("AgentFace");
    expect(existsSync("src/components/AgentPresenceLivePreview.tsx")).toBe(false);
  });

  it("persists deploy-modal identity, voice, channel, greeting, and personality", () => {
    const routes = read("src/routes/agent-routes-v2.ts");
    const templates = read("src/components/AgentTemplates.tsx");
    const deployModal = read("src/components/DeployAgentModal.tsx");

    expect(routes).toContain("cleanText(req.body?.voice_id, 160)");
    expect(routes).toContain("normalizeManagedOpenAIVoiceId(requestedVoiceId)");
    expect(routes).toContain('voiceProvider: "openai"');
    expect(routes).not.toContain('voiceProvider: "11labs"');
    expect(routes).toContain('req.body?.channel === "email"');
    expect(routes).toContain("resolveCreateFirstMessage(req.body?.firstMessage, name)");
    expect(templates).toContain("template.firstMessage");
    expect(deployModal).toContain("firstMessage");
  });
});
