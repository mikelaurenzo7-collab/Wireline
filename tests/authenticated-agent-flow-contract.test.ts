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
    expect(permissions).toContain("resolveAgentTools(config.enabledTools)");
  });

  it("keeps the tool editor from discarding edits or overstating live capability", () => {
    const permissions = read("src/components/AgentToolPermissions.tsx");
    expect(permissions).toContain("if (loadedAgentRef.current === agentId) return;");
    expect(permissions).toContain("loadedAgentRef.current = agentId;");
    expect(permissions).toContain("loadedAgentRef.current = null;");
    expect(permissions).toMatch(/const \[loading, setLoading\] = useState\(true\)/);
    expect(permissions).toContain("return response.json().catch(() => null);");
    expect(permissions).toContain("Not connected. These stay off in live calls until");
    expect(permissions).toMatch(
      /to=\{\s*playbook\.integration === "calendar"\s*\? "\/calendar\?tab=availability"\s*:\s*playbook\.connectPath\s*\}/,
    );
    expect(read("src/lib/agent-runtime-helpers.ts")).toContain("filterToolsByTenantConnections");
    expect(permissions).toContain("const savedFor = agentId;");
    expect(permissions).toMatch(/if \(loadedAgentRef\.current !== savedFor\) return;/);
    expect(permissions).toContain("encodeURIComponent(savedFor)");
  });

  it("keeps the signup form focused and sends every new owner to meet Bo, keeping a picked plan", () => {
    const authPortal = read("src/components/AuthPortal.tsx");
    const authAccess = read("src/components/auth/AuthAccessPanel.tsx");
    const authRedirect = read("src/lib/auth-redirect.ts");
    const onboardingFlow = read("src/pages/OnboardingFlow.tsx");
    const appShell = read("src/components/layout/AppShell.tsx");
    const workspaceShell = read("src/components/WorkspaceShell.tsx");

    expect(authPortal).toContain("AuthAccessPanel");
    // Account creation precedes plan review.
    expect(authAccess).not.toContain("function signupPlanLabel(");
    expect(authAccess).not.toContain("plan.price_usd_annual");
    expect(authAccess).not.toContain("plan.price_usd_monthly");
    expect(authAccess).not.toContain("const SIGNUP_PLAN_LABELS");
    expect(authAccess).toContain("WirelineLockup");
    expect(authAccess).not.toContain('<span className="wl-auth-brand-badge">W</span>');
    expect(workspaceShell).toContain('import { BotBoundWordmark } from "./brand/BotBoundBrand"');
    expect(workspaceShell).toContain('import BotBoundMark from "./brand/BotBoundMark"');
    expect(workspaceShell).not.toContain("WirelineMark");
    expect(workspaceShell).not.toMatch(/>\s*W\s*<\/span>/);
    // Every fresh sign-up meets Bo in Studio, even with a paid plan picked on
    // Pricing: the plan is remembered for going live instead of opening Billing first.
    expect(authRedirect).toContain('return "/studio";');
    expect(authRedirect).toContain("return `/studio?template=${encodeURIComponent(template)}`;");
    expect(authRedirect).toContain(
      "if (currentIntent?.preferredPlanId && intent) persistSignupIntent(intent);",
    );
    expect(authRedirect).not.toContain("&onboarding=1");
    expect(authRedirect).not.toContain("create=1");
    expect(authAccess.match(/navigate\(resolvePostAuthDestination/g)).toHaveLength(1);
    // The old /onboarding link opens the Workspace with its query intact.
    expect(onboardingFlow).toContain("`/studio${search}`");
    expect(onboardingFlow).not.toContain("create=1");
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

  it("mounts operating truth on Studio, Inbox, approvals, and analytics routes", () => {
    const appRoutes = read("src/routes/AppRoutes.tsx");
    const nav = read("src/constants/navigation.ts");
    const registry = read("src/server/register-api-routes.ts");

    expect(appRoutes).toContain('path="/overview" element={<ToStudioRedirect />}');
    expect(appRoutes).toContain('path="/insights" element={<InsightsPage');
    expect(appRoutes).toContain('path="/inbox"');
    expect(appRoutes).toContain('path="/approvals"');
    expect(nav).toMatch(/href:\s*["']\/insights["']/);
    expect(registry).not.toContain("overviewOperatingMetricsRouter");
    expect(appRoutes).not.toContain("OverviewPage");
    expect(appRoutes).not.toContain("DailyBriefPanel");
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
    const boOnboarding = read("src/components/onboarding/BoOnboarding.tsx");
    const productCopy = read("src/lib/product-copy.ts");
    const mobileUtilities = read("src/components/MobileBrowserUtilities.tsx");
    const studioHome = read("src/pages/AgentStudioHome.tsx");
    const studioWorkspace = read("src/components/StudioWorkspaceV2.tsx");

    expect(appRoutes).toContain('path="/studio" element={<AgentStudioHome');
    // Bo's first conversation is the create surface, and it renders in Studio.
    expect(studioHome).toMatch(/<StudioPageShell>\s*<BoOnboarding /);
    expect(boOnboarding).not.toContain("BOT_ROLE_TEMPLATES");
    expect(boOnboarding).toContain("{COPY.finishLater}");
    expect(boOnboarding).not.toContain("VoicePickerField");
    expect(boOnboarding).not.toContain("CreateAgentCatalogFacePicker");
    expect(productCopy).toContain('createHeadline: "Create Your Bot"');
    const emptyCue = productCopy.match(/emptyCue:\s*"([^"]+)"/)?.[1] ?? "";
    expect(emptyCue).toMatch(/Describe the job/i);
    for (const capability of ["calls", "email", "knowledge", "computer tasks"]) {
      expect(emptyCue.toLowerCase()).toContain(capability);
    }

    expect(mobileUtilities).toContain('pathname === "/studio"');
    expect(mobileUtilities).toContain('pathname.startsWith("/studio/")');
    expect(mobileUtilities).toContain('pathname.startsWith("/settings")');

    expect(studioHome).toContain('params.get("brief")');
    expect(boOnboarding).toContain('params.get("template")');
    expect(studioHome).not.toContain('params.get("posture")');
    expect(boOnboarding).not.toContain('params.get("posture")');
    expect(studioHome).toContain("<BoOnboarding");
    expect(studioHome).toContain("readBoOnboarding(user?.id)");
    expect(studioWorkspace).toContain('type InspectorSection = "details" | "setup" | "review"');
    expect(studioWorkspace).toContain('type WorkroomMode = "configure" | "test"');
    expect(studioWorkspace).not.toContain("useAccount");
    expect(studioWorkspace).not.toContain("posture=");
  });

  it("keeps the starter catalog broad while a starter only sets Bo's posture", () => {
    const boOnboarding = read("src/components/onboarding/BoOnboarding.tsx");
    const boState = read("src/lib/bo-onboarding.ts");
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
    // Starter links still name a role, but Bo is never built from one: a
    // starter only decides whether Bo starts as a personal assistant.
    expect(boState).toContain(
      'const PERSONAL_TEMPLATE_IDS = new Set(["personal-assistant", "family-concierge"]);',
    );
    expect(boOnboarding).toMatch(
      /isPersonalStarter\(\s*params\.get\("template"\),\s*getStoredSignupIntent\(\)\?\.preferredTemplateId,?\s*\)/,
    );
    expect(boOnboarding).toContain("name: FIRST_BOT_NAME,");
    expect(boOnboarding).toContain("is_business_agent: !personal,");
    expect(boOnboarding).not.toMatch(
      /BOT_ROLE_TEMPLATES|Bot role starters|Choose one personal job/,
    );
  });

  it("keeps the retired template gallery from coming back as a create surface", () => {
    // One Bot means nothing to browse: Bo's first conversation replaced the
    // create dialog, and the gallery, its search, its category filter, and the
    // dialog's row of starting briefs are gone rather than hidden.
    const boOnboarding = read("src/components/onboarding/BoOnboarding.tsx");
    expect(existsSync("src/components/AgentTemplates.tsx")).toBe(false);
    expect(existsSync("src/pages/TemplatesPage.tsx")).toBe(false);
    expect(existsSync("src/components/CreateAgentDialog.tsx")).toBe(false);
    expect(boOnboarding).not.toMatch(/searchableTemplateText|Search templates|activeCategory/);
    expect(boOnboarding).not.toContain("Starting briefs");
  });

  it("meets Bo in a resumable four-question conversation that ends on Hear, Voice, Number, Chat", () => {
    const boOnboarding = read("src/components/onboarding/BoOnboarding.tsx");
    const studioHome = read("src/pages/AgentStudioHome.tsx");
    const boState = read("src/lib/bo-onboarding.ts");
    const copy = read("src/lib/wireline-onboarding-copy.ts");

    // Bo is created once per account; another tab that asks too gets the same Bot.
    expect(copy).toContain('export const FIRST_BOT_NAME = "Bo";');
    expect(boOnboarding).toContain("only_if_none: true,");
    // The conversation is the only create surface, so it owns the whole
    // handoff the create dialog and the post-create guide used to split.
    expect(boOnboarding).toContain("isBotMarkKey(body.mark_key)");
    expect(boOnboarding).toContain("setPostSignupFlowActive(true)");
    expect(boOnboarding).toContain("setPostSignupFlowActive(false)");
    expect(boOnboarding).toContain('event: "agent_created"');
    // A reload continues at the same question for the same Bot.
    expect(boState).toContain('const STATE_PREFIX = "wireline:bo-onboarding:v1:";');
    expect(boState).toContain("export function readBoOnboarding");
    expect(boState).toContain("export function writeBoOnboarding");
    expect(boState).toContain("export function clearBoOnboarding");
    expect(studioHome).toContain("agents.some((agent) => agent.id === onboarding?.agentId)");
    expect(boOnboarding).toContain(
      'const QUESTION_STEPS = ["about", "website", "questions", "checks"] as const;',
    );
    // It ends on the four next steps: rehearse, voice, a number, and chat.
    expect(boOnboarding).toContain("finish(`/studio?agent=${id}&workroom=test`)");
    expect(boOnboarding).toContain("finish(`/studio?agent=${id}&section=setup#voice`)");
    expect(boOnboarding).toContain("`/phone?tab=lines&agent=${id}`");
    expect(boOnboarding).toContain("choosePlanHref()");
    for (const action of [
      'hear: "Hear Me"',
      'voice: "Pick My Voice"',
      'number: "Get a Number"',
      'chat: "Start Chatting"',
    ]) {
      expect(copy).toContain(action);
    }
    expect(copy).toContain("export const BO_ONBOARDING_COPY");
    expect(copy).not.toContain("POST_CREATE_WIZARD_COPY");
  });

  it("keeps the retired presence live preview deleted", () => {
    // Live Video retirement itself is owned by tests/video-presenter-contract.test.ts.
    expect(existsSync("src/components/AgentPresenceLivePreview.tsx")).toBe(false);
  });

  it("persists a new Bot's identity, voice, channel, greeting, and personality", () => {
    const routes = read("src/routes/agent-routes-v2.ts");

    expect(routes).toContain("cleanText(req.body?.voice_id, 160)");
    expect(routes).toContain("normalizeManagedOpenAIVoiceId(requestedVoiceId)");
    expect(routes).toContain('voiceProvider: "openai"');
    expect(routes).not.toContain('voiceProvider: "11labs"');
    expect(routes).toContain('req.body?.channel === "email"');
    expect(routes).toContain("resolveCreateFirstMessage(req.body?.firstMessage, name)");
    expect(existsSync("src/components/DeployAgentModal.tsx")).toBe(false);
  });
});
