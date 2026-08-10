import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8").replace(/\r\n/g, "\n");
}

describe("authenticated agent flow", () => {
  /*
   * Agent tools reach live calls through `resolveAgentTools`, and until now only
   * `POST /api/mobile/agents/:id/tools` could change them — an owner on the web
   * could see what their agent was permitted to do and had no way to alter it.
   * The web route must not become a second, laxer door onto the same column, so
   * it is pinned to the mobile route's guards.
   */
  it("lets the web edit agent tools under the same guards as mobile", () => {
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
    // Ownership is checked before anything is written, and a miss is a 404 so
    // the route cannot be used to probe which agent ids exist.
    expect(web.indexOf("owned(req.params.id, req.user.id)")).toBeLessThan(web.indexOf("drizzle"));
    expect(web).toContain('throw AppError.fromHttpStatus(404, "Agent not found");');

    /*
     * A null selection is not an empty one: the server resolves null to the full
     * catalog, so seeding the editor with [] would make the first save a silent
     * capability wipe. The UI must seed from the same resolver the runtime uses.
     */
    expect(permissions).toContain("resolveAgentTools(undefined, config.enabledTools)");
  });

  /*
   * Review findings on the tool editor, each one a way the panel could lie about
   * or discard the operator's intent.
   */
  it("keeps the tool editor from discarding edits or overstating what is live", () => {
    const permissions = read("src/components/AgentToolPermissions.tsx");

    // Keying the load on `open` meant collapse + reopen refetched and replaced
    // unsaved toggles with the stored set, silently.
    expect(permissions).toContain("if (loadedAgentRef.current === agentId) return;");
    expect(permissions).toContain("loadedAgentRef.current = agentId;");
    expect(permissions).toContain("loadedAgentRef.current = null;");

    // The fetch is gated on `open`, so the expand render lands first. Starting
    // `loading` false painted every action unchecked and every count 0/N.
    expect(permissions).toMatch(/const \[loading, setLoading\] = useState\(true\)/);

    // A posture endpoint answering 200 with non-JSON must not blank the editor.
    expect(permissions).toContain("return response.json().catch(() => null);");

    /*
     * Live assistants are built through buildRoleToolDefsForTenant, which drops
     * tools whose integration the tenant has not connected. Without this hint an
     * unconnected integration looked identical to a connected one.
     */
    expect(permissions).toContain("Not connected — these stay off in live calls until");
    expect(permissions).toContain("to={playbook.connectPath}");
    expect(read("src/lib/vapi-helpers.ts")).toContain("filterToolsByTenantConnections");

    /*
     * The component survives agent switches in place, so an in-flight save for
     * agent A can resolve while agent B is on screen. Unguarded, the response
     * replaced B's loaded selection with A's tools — and the next save
     * persisted them onto B. The save captures its agent at call time and a
     * response applies only while that agent is still the active one.
     */
    expect(permissions).toContain("const savedFor = agentId;");
    expect(permissions).toMatch(/if \(loadedAgentRef\.current !== savedFor\) return;/);
    expect(permissions).toContain("encodeURIComponent(savedFor)");
  });

  it("routes fresh signups into the real create flow", () => {
    const authPortal = read("src/components/AuthPortal.tsx");
    const authRedirect = read("src/lib/auth-redirect.ts");
    const onboardingFlow = read("src/pages/OnboardingFlow.tsx");
    const appShell = read("src/components/layout/AppShell.tsx");
    const workspaceShell = read("src/components/WorkspaceShell.tsx");

    // Workspace mode drives signup intent through the canonical catalog-backed
    // billing-label helper, including the visitor's selected annual term.
    expect(authPortal).toContain("function signupPlanLabel(");
    expect(authPortal).toContain("STRIPE_PLANS.find");
    expect(authPortal).toContain("plan.price_usd_annual");
    expect(authPortal).toContain("plan.price_usd_monthly");
    expect(authPortal).not.toContain("const SIGNUP_PLAN_LABELS");
    expect(authPortal).toContain('nextMode === "personal"');
    expect(authPortal).toContain('import WirelineMark from "./brand/WirelineMark"');
    // The auth funnel stays minimal (PR #738): product promise, not a decorative loop grid.
    expect(authPortal).toContain("customerAgentLanguage(workspaceMode)");
    expect(authPortal).not.toContain('<span className="wl-auth-brand-badge">W</span>');
    expect(workspaceShell).toContain('import WirelineMark from "./brand/WirelineMark"');
    expect(workspaceShell).not.toMatch(/>\s*W\s*<\/span>/);
    expect(authRedirect).toContain(
      'workspaceMode === "business" ? "/studio?create=1&posture=business" : "/studio?create=1"',
    );
    expect(authPortal.match(/navigate\(resolvePostAuthDestination/g)).toHaveLength(1);
    expect(onboardingFlow).toContain("Opening your first ${language.singular}");
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
    expect(overview).toContain('primaryHref: "/approvals"');
    expect(overview).toContain("<Link to={state.primaryHref}");
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
    const studioHome = read("src/pages/AgentStudioHome.tsx");

    expect(appRoutes).toContain('path="/studio" element={<AgentStudioHome');
    expect(createDialog).toContain("{language.setupPrompt}");
    expect(createDialog).toContain("{language.setupLabel}");
    // Create is a single brief-first screen; voice, phone, and testing
    // are deliberately deferred into Studio.
    expect(createDialog).toContain("Not now");
    expect(createDialog).not.toContain("VoicePickerField");
    expect(createDialog).not.toContain("CreateAgentCatalogFacePicker");
    expect(productCopy).toContain('createHeadline: "Build your next voice agent."');
    expect(productCopy).toContain(
      'emptyCue: "Brief it. Train it once. Connect calls, texts, and email."',
    );

    expect(mobileUtilities).toContain('pathname === "/studio"');
    expect(mobileUtilities).toContain('pathname.startsWith("/studio/")');
    expect(mobileUtilities).toContain('pathname.startsWith("/settings")');

    expect(studioHome).toContain('params.get("brief")');
    expect(studioHome).toContain('params.get("posture")');
    expect(studioHome).toContain('requestedPosture !== "personal" && accountType === "business"');
    expect(studioHome).toContain("PostCreateActivationWizard");
    expect(studioHome).toContain("readPostCreateWizard");
    expect(studioHome).not.toContain("mode=workroom");
  });

  it("keeps Fast Start broad enough for sales, support, personal, and call coverage", () => {
    const createDialog = read("src/components/CreateAgentDialog.tsx");

    expect(createDialog).toContain("Revenue Desk");
    expect(createDialog).toContain("Support Desk");
    expect(createDialog).toContain('value: "scheduler"');
    expect(createDialog).toContain('value: "sales"');
    // Breadth used to be asserted against the brief the composer was pre-filled
    // with. That pre-fill is gone — the box opens empty so the customer writes
    // their own job — so the same promise is checked where it still lives: the
    // placeholder, which suggests the range without occupying the field.
    expect(createDialog).toContain("Qualify inbound demos, answer support questions");
    expect(createDialog).toContain("route urgent calls");
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
      'aria-label={`${alreadyDeployed ? "Use again" : "Use"} ${template.name} template`}',
    );
    expect(templates).not.toContain("hidden hidden");
  });

  it("launches post-create Train → Channels → Wire → Test wizard after Fast Start", () => {
    const createDialog = read("src/components/CreateAgentDialog.tsx");
    const studioHome = read("src/pages/AgentStudioHome.tsx");
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
    // The composition itself lives in the shared create-defaults helper so web,
    // template deploy, and mobile all seed identically — assert the delegation
    // here and the composition where it actually happens.
    expect(routes).toContain("resolveCreatePersonality({");
    expect(routes).toContain("resolveCreateEnabledTools(role, isBusinessAgent)");
    const createDefaults = read("src/lib/agent-create-defaults.ts");
    expect(createDefaults).toContain("composeAgentPersonality");
    expect(createDefaults).toContain("TEMPLATE_OVERLAYS[opts.templateId]");
    expect(templates).toContain("voice_id: values.voiceId");
    expect(deployModal).toContain("VAPI_CURATED_VOICES");
    expect(deployModal).toContain("MANAGED_VOICE_BY_GENDER");
    expect(deployModal).not.toMatch(/PREMIUM_VOICES|\/api\/voices\/|VoicePreviewButton/);
  });

  it("surfaces the create warning even though Studio is already mounted", () => {
    const studioHome = read("src/pages/AgentStudioHome.tsx");
    const createDialog = read("src/components/CreateAgentDialog.tsx");

    // Applying the first brief is best-effort, and on failure the dialog stashes
    // a warning for Studio to raise. But Fast Start opens from
    // `/studio?create=1`, so Studio is already mounted when that happens — a
    // mount-only effect never ran again and the message sat unread in session
    // storage, leaving the single case the warning exists for silent.
    expect(createDialog).toContain("stashCreateWarning(");

    // Only the effect that consumes the warning — the wizard effect below it
    // legitimately keeps mount-only deps, and a wider window would read its
    // dependency array instead of this one's.
    const start = studioHome.indexOf("consumeCreateWarning()");
    const consumeEffect = studioHome.slice(start, studioHome.indexOf("]);", start) + 3);
    // The post-create redirect swaps `create=1` for `agent=<id>`, so the search
    // params are the signal that the flow finished.
    expect(consumeEffect).toMatch(/\}, \[toast, params\]\);$/);
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

  it("routes every PSTN call through the governed managed voice runtime", () => {
    const schema = read("src/db/schema.ts");
    const factory = read("src/lib/vapi-assistant-factory-v2.ts");
    const managedRuntime = read("src/lib/managed-voice-runtime.ts");
    const routes = read("src/routes/agent-routes-v2.ts");

    // Dual phone-voice columns remain persisted for continuity. The live
    // factory admits only curated ElevenLabs voices or tenant-owned approved
    // clones, and the shared runtime always carries a managed Vapi fallback.
    expect(schema).toContain("phoneVoiceId");
    expect(schema).toContain("phoneVoiceProvider");
    expect(factory).toContain("buildManagedVoiceRuntime");
    expect(factory).toContain('schema.clonedVoices.status, "approved"');
    expect(managedRuntime).toContain("isManagedVapiVoiceId");
    expect(managedRuntime).toContain("DEFAULT_MANAGED_VOICE_ID");
    expect(managedRuntime).toContain("fallbackPlan");
    expect(factory).not.toContain("configured.phoneVoiceProvider");
    expect(routes).toContain("phoneVoiceId");
  });

  it("surfaces custom presence consent FTUX for business agents", () => {
    const preview = read("src/components/AgentPresenceLivePreview.tsx");
    const panel = read("src/components/video-presenter/CustomPresenceConsentPanel.tsx");

    expect(preview).toContain("CustomPresenceConsentPanel");
    expect(preview).toContain("consentStatus");
    expect(panel).toContain("Custom likeness review is coming soon");
    expect(panel).toContain("confirm rights");
    expect(panel).not.toContain("Submit for review");
  });
});
