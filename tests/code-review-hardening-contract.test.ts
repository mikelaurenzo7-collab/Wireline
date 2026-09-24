import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("code review hardening contracts", () => {
  it("runs TypeScript build checks without the TSX CLI IPC server", () => {
    for (const path of [
      "scripts/check-csp-drift.mjs",
      "scripts/check-openapi-implementation.mjs",
    ]) {
      const source = read(path);
      expect(source, path).toContain('"--import"');
      expect(source, path).toContain('"tsx"');
      expect(source, path).toContain('"--input-type=module"');
      expect(source, path).not.toContain("tsx/dist/cli.mjs");
    }

    const scripts = (
      JSON.parse(read("package.json")) as {
        scripts: Record<string, string>;
      }
    ).scripts;
    for (const name of ["dev", "build", "authz:check", "db:health", "recap:preview"]) {
      expect(scripts[name], name).toContain("node --import tsx");
    }
  });

  it("routes unauthenticated browser handoffs through ?redirect=", () => {
    const bridge = read("src/pages/BrowserHandoffBridge.tsx");
    expect(bridge).toContain("?redirect=");
    expect(bridge).not.toMatch(/signin\?next=/);
  });

  it("starts supervisor websocket upgrades from the canonical server entrypoint", () => {
    const server = read("server.ts");
    expect(server).toContain("import { initSupervisorWebSocketServer }");
    expect(server).toContain("initSupervisorWebSocketServer(server)");
  });

  it("fails CORS closed in production when no allowlist is configured", () => {
    const server = read("server.ts");
    expect(server).toContain("IS_PROD && origins.length === 0");
  });

  it("serializes agent capacity checks inside a transaction", () => {
    const routes = read("src/routes/agent-routes-v2.ts");
    expect(routes).toContain("pg_advisory_xact_lock");
    expect(routes).toContain("drizzle.transaction");
  });

  it("rejects OpenAI SIP routing that does not resolve a tenant from the called number", () => {
    const routes = read("src/routes/openai-sip-routes.ts");
    expect(routes).toContain("sipHeader(payload, OPENAI_INBOUND_SIP_TOKEN_HEADER)");
    expect(routes).toContain("verifyOpenAIInboundToken(inboundToken)");
    expect(routes).toContain("inboundVerification.claims.calledNumber");
    expect(routes).toContain("eq(schema.phoneNumbers.phoneNumber, calledNumber)");
    expect(routes).toContain("if (!line?.userId || !line.agentId) return null;");
    expect(routes).toContain("await rejectCall(callId, 404)");
    expect(routes).not.toMatch(/req\.(?:body|query)\.(?:userId|agentId)/);
  });

  it("deduplicates inbound Twilio SMS by MessageSid before thread writes", () => {
    const twilio = read("src/routes/twilio-webhook-base.ts");
    expect(twilio).toContain("twilioSid: input.messageSid || null");
    expect(twilio).toContain(".onConflictDoNothing()");
    expect(twilio).toContain("if (!insertedMessage) return;");
    expect(twilio).toContain("tenantStore.run(tenantUserId");
    expect(read("src/db/schema-base.ts")).toContain("idx_sms_messages_user_twilio_sid");
  });

  it("never lets an SMS START reply remove manual or legal DNC records", () => {
    const twilio = read("src/routes/twilio-webhook.ts");
    expect(twilio).toContain("LEGACY_OPT_IN_KEYWORDS");
    expect(twilio).toContain('eq(schema.dncList.source, "twilio_advanced_opt_out")');
    expect(twilio).toContain('eq(schema.dncList.source, "sms_opt_out")');
    expect(twilio).toContain('eq(schema.dncList.reason, "opt-out")');
    expect(twilio).toContain("if (!legacy) return res.status(200).send(emptyTwiml());");
    expect(twilio).toContain("const confirmation =");
    expect(twilio).toContain('control === "stop"');
    expect(twilio).toContain("helpConfirmationTwiml()");
    expect(twilio).toContain(".send(productionReply(confirmation))");
  });

  it("purges every credential and tenant-data surface found in the live schema audit", () => {
    const deletion = read("src/lib/account-deletion.ts");
    for (const table of [
      "wireline_browser_handoffs",
      "wireline_call_reliability_staging",
      "wireline_deletion_queue",
      "wireline_design_integrations",
      "wireline_design_profiles",
      "wireline_mcp_access_tokens",
      "wireline_mcp_oauth_codes",
      "wireline_mcp_refresh_tokens",
      "wireline_memberships",
      "wireline_oauth_pending_codes",
      "wireline_organizations",
      "wireline_training_backup_20260609",
      "wireline_webhook_health",
    ]) {
      expect(deletion).toContain(`table: "${table}"`);
    }
    expect(deletion).toContain('organizationColumns: ["organization_id"]');
    expect(deletion).toContain('userColumns: ["user_id", "tenant_id"]');
    expect(deletion).toContain("sql.join(predicates, sql` OR `)");
  });

  it("uses one canonical Stripe catalog version for price validation and checkout metadata", () => {
    const checkout = read("src/routes/launch-billing-checkout-routes.ts");
    expect(checkout).toContain("FOUNDER_CATALOG_VERSION");
    expect(checkout).not.toContain('wireline_catalog_version === "founder_early_access_2026_07"');
    expect(checkout).not.toContain('wireline_catalog_version: "founder_early_access_2026_07"');
  });

  it("propagates credit wallet failures instead of swallowing them", () => {
    const wallet = read("src/lib/credit-wallet.ts");
    expect(wallet).toContain("export interface CreditMutationResult");
    expect(wallet).not.toMatch(
      /export async function addCredit[\s\S]*catch \(err\)[\s\S]*return getCreditBalanceUsd/,
    );
  });

  it("scopes tenant webhook DB work through tenantStore.run", () => {
    const openai = read("src/routes/openai-sip-routes.ts");
    const session = read("src/lib/voice/openai-sip-session.ts");
    const billing = read("src/routes/billing-routes.ts");
    expect(openai).toContain("tenantStore.run(line.userId");
    expect(session).toContain("return tenantStore.run(input.userId");
    expect(billing).toContain("tenantStore.run(userId");
  });

  it("compensates and rethrows OpenAI call-accept failures so the provider can retry", () => {
    const routes = read("src/routes/openai-sip-routes.ts");
    // Worker admission adds an outer try/finally; compensation is independent
    // of indentation. Keep the slice bounded by the actual provider operations.
    const acceptStart = routes.indexOf("await acceptCall(callId");
    const commitStart = routes.indexOf("await commitRealtimeSessionSpend", acceptStart);
    expect(acceptStart).toBeGreaterThan(-1);
    expect(commitStart).toBeGreaterThan(acceptStart);
    const accept = routes.slice(acceptStart, commitStart);
    expect(accept).toContain("releaseAccountOperationLease");
    expect(accept).toContain("releaseRealtimeSessionSpendAfterFailure");
    expect(accept).toContain("hangupCall(callId)");
    expect(routes).toContain("const results = await Promise.allSettled(");
    expect(accept).toContain("throw error;");
  });

  it("keeps duplicate OpenAI incoming-call deliveries side-effect free", () => {
    const session = read("src/lib/voice/openai-sip-session.ts");
    const routes = read("src/routes/openai-sip-routes.ts");
    const claim = session.slice(
      session.indexOf("async function claimCall"),
      session.indexOf("async function updatePresence"),
    );
    expect(claim).toContain("sourceId: schema.callLogs.openaiSipSourceId");
    expect(claim).toContain("openaiSipSourceId: sourceId");
    expect(claim).toContain('.for("update")');
    expect(claim).toContain("openaiSipOwnerToken, existing.ownerToken!");
    expect(claim).toContain("openaiSipLeaseExpiresAt} <= now()");
    expect(claim).toContain('return existing.phase === "claimed" ? ("retry" as const) : null');

    const duplicateGuard = routes.indexOf("if (callClaim === null)");
    const spendStart = routes.indexOf("await reserveRealtimeSessionSpend(");
    expect(duplicateGuard).toBeGreaterThan(-1);
    expect(routes.slice(duplicateGuard, spendStart)).toContain(
      "Duplicate OpenAI incoming-call webhook suppressed",
    );
    expect(routes.indexOf("return;", duplicateGuard)).toBeLessThan(spendStart);
  });

  it("tracks post-create roleplay starts only from a connected live voice test", () => {
    const wizard = read("src/components/onboarding/PostCreateActivationWizard.tsx");
    const roleplay = read("src/components/RoleplaySandbox.tsx");
    const liveVoice = read("src/components/OpenAILiveVoiceSandbox.tsx");

    expect(wizard).not.toContain("onFocusCapture");
    expect(wizard).toContain("onTestStarted={() =>");
    expect(roleplay).toContain("onTestStarted?: () => void");
    expect(liveVoice).toContain("onTestStarted?: () => void");
    expect(liveVoice).toContain("reportedStarted.current = true");
    expect(liveVoice).toContain("onTestStarted?.()");
  });

  it("defensively handles unavailable browser storage in activation nudges", () => {
    const nudge = read("src/components/ActivationNudge.tsx");
    expect(nudge).toContain("function readDismissed(scopeId: string | null)");
    expect(nudge).toContain("function writeDismissed(scopeId: string | null)");
    expect(nudge).toContain("catch");
  });

  it("tears down OAuth popup-close polls on unmount instead of leaking them", () => {
    // Both cards start a 500ms popup-close poll from a click handler, so nothing
    // else tears it down. Unmounting mid-consent left it running for the life of
    // the tab — and the mailbox card's callback calls loadAccounts(), so a dead
    // component kept issuing authenticated requests.
    for (const path of [
      "src/components/CrmConnectionCard.tsx",
      "src/components/MailboxConnectionCard.tsx",
    ] as const) {
      const source = read(path);
      expect(source, path).toContain("const popupPollRef = useRef<number | null>(null)");
      expect(source, path).toContain("popupPollRef.current = window.setInterval(");
      // The unmount cleanup is the whole point; asserting only the ref would
      // pass with the teardown deleted.
      expect(source, path).toContain("useEffect(() => stopPopupPoll, [stopPopupPoll])");
      // Cleared before starting, so retrying or switching providers cannot stack
      // intervals that only their own popup's close can stop.
      //
      // Assert ADJACENCY, not position. The previous check was
      // `lastIndexOf("stopPopupPoll();", startIndex) > -1`, which scans backwards
      // over the whole file — and both components already call stopPopupPoll()
      // in their OAuth-success message handler, above connect(). Deleting the
      // clear-before-start call left the gate green because the search simply
      // resolved to that earlier occurrence.
      expect(source, path).toMatch(
        /stopPopupPoll\(\);\s*popupPollRef\.current = window\.setInterval\(/,
      );
    }
  });

  it("cancels a superseded thread fetch instead of racing it onto the reading pane", () => {
    // Both inboxes load a detail pane from a selected id. Selecting thread A
    // then B fires overlapping requests, and last-writer-wins means an
    // A-resolves-last ordering renders one conversation's messages under
    // another conversation's header.
    const email = read("src/components/EmailInbox.tsx");
    const emailLoader = email.slice(
      email.indexOf("const loadThreadDetail = useCallback("),
      email.indexOf("useEffect(() =>", email.indexOf("const loadThreadDetail = useCallback(")),
    );
    expect(emailLoader).toContain("detailAbortRef.current?.abort()");
    expect(emailLoader).toContain("detailOperationRef.current === operation");
    expect(emailLoader).toContain("selectedIdRef.current === threadId");
    expect(emailLoader).toContain("signal: controller.signal");
    const detailGuard = emailLoader.indexOf("if (!isCurrentRequest()) return false;");
    expect(detailGuard).toBeGreaterThan(-1);
    expect(detailGuard).toBeLessThan(emailLoader.indexOf("setDetail({"));
    expect(emailLoader).toContain("if (isCurrentRequest()) setDetailLoading(false);");
    const emailListLoader = email.slice(
      email.indexOf("const loadThreads = useCallback("),
      email.indexOf("const loadThreadDetail = useCallback("),
    );
    expect(emailListLoader).toContain("threadListAbortRef.current?.abort()");
    expect(emailListLoader).toContain("threadListOperationRef.current === operation");
    expect(emailListLoader).toContain("signal: controller.signal");
    expect(emailListLoader).toContain("if (!isCurrentRequest()) return false;");
    expect(emailListLoader).toMatch(
      /if \(isCurrentRequest\(\)\) \{\s*setLoading\(false\);\s*setLoadingMore\(false\);/,
    );

    const sms = read("src/components/SmsThreads.tsx");
    expect(sms).toContain("signal?: AbortSignal");
    expect(sms).toContain("{ signal }");
    expect(sms).toContain("const isCurrentRequest = () =>");
    expect(sms).toContain("activeIdRef.current === threadId");
    expect(sms).toContain("messageOperationRef.current === operation");
    expect(sms).toMatch(/return \(\) => \{\s*controller\.abort\(\);/);
    const smsLoader = sms.slice(
      sms.indexOf("const fetchMessages = useCallback("),
      sms.indexOf("useEffect(() =>", sms.indexOf("const fetchMessages = useCallback(")),
    );
    expect(smsLoader.indexOf("if (!isCurrentRequest()) return;")).toBeLessThan(
      smsLoader.indexOf("setMessages("),
    );
    expect(smsLoader).toContain("if (isCurrentRequest()) setMessagesLoading(false);");
  });

  it("keeps public purchase, consent, and sticky-CTA promises internally consistent", () => {
    const pricing = read("src/pages/Pricing.tsx");
    const terms = read("src/components/LegalPage.tsx");
    const support = read("src/components/SupportPage.tsx");
    const contact = read("src/components/ContactPage.tsx");
    const activation = read("src/components/ActivationChecklist.tsx");
    const demoSeed = read("src/lib/demo-account-seed.ts");
    const supportPersona = read("src/lib/wireline-agent-personas.ts");
    const escalation = read("src/lib/wireline-agent-escalation.ts");
    const founderFleet = read("src/lib/founder-fleet-seed.ts");
    const founderBootstrap = read("src/lib/founder-bootstrap.ts");
    const canonicalDemoKnowledge = demoSeed.slice(
      demoSeed.indexOf("const SAMPLE_KNOWLEDGE"),
      demoSeed.indexOf("const LEGACY_DEMO_KNOWLEDGE_REPLACEMENTS"),
    );
    const auth = read("src/components/AuthPortal.tsx");
    const authAccess = read("src/components/auth/AuthAccessPanel.tsx");
    const marketingCss = read("src/styles/public-marketing-polish.css");
    const safeAreaCss = read("src/styles/safe-area-ownership.css");

    expect(pricing).toContain("within 30 days of your first paid invoice");
    expect(pricing).toContain("verify the account and transaction");
    expect(pricing).not.toContain("within 14 days of a first paid charge");
    expect(terms).toContain("30-day money-back guarantee");
    expect(terms).toContain("verifies the account and transaction");
    expect(terms).not.toContain("No forms, no escalation");
    expect(terms).not.toContain("coordinates that registration through Twilio");
    expect(support).toContain("We'll follow up at");
    expect(support).not.toContain("within one business day");
    expect(contact).toContain("We'll follow up at");
    expect(contact).not.toContain("within one business day");
    expect(activation).toContain("Define the work, boundaries, and successful outcomes.");
    expect(activation).not.toContain("one clear customer-facing responsibility");
    expect(canonicalDemoKnowledge).toContain("within 30 days");
    expect(canonicalDemoKnowledge).not.toContain("Refund window: 14 days");
    expect(canonicalDemoKnowledge).toContain("HIPAA and BAA support are not currently available");
    expect(canonicalDemoKnowledge).not.toContain("we accept SCC, DPA, BAA on request");
    expect(canonicalDemoKnowledge).not.toContain("Scale customers get a dedicated CSM");
    expect(demoSeed).toContain("LEGACY_DEMO_KNOWLEDGE_REPLACEMENTS");
    expect(demoSeed).toContain(".set({ content: replacement.current })");
    expect(supportPersona).toContain("SUPPORT_REFUND_REVIEW_INSTRUCTION");
    expect(supportPersona).not.toContain("Auto-issue refunds");
    expect(escalation).toContain("Every refund request");
    expect(escalation).toContain('id: "refund_review_required"');
    expect(escalation).toContain('action: "create_support_ticket"');
    expect(escalation).not.toContain("SUPPORT_AUTO_REFUND_MAX_USD");
    expect(founderFleet).toContain("systemPrompt: persona.systemPrompt");
    expect(founderFleet).toContain("FOUNDER_FLEET_SEED_CONTRACT_VERSION");
    expect(founderBootstrap).toContain("currentManagedContracts");
    expect(auth).toContain('<AuthAccessPanel initialMode={isSignupRoute ? "signup" : "signin"} />');
    expect(authAccess).toContain('const termsId = embedded ? "landing-auth-terms" : "auth-terms";');
    expect(authAccess).toContain("const termsLabelId = `${termsId}-label`;");
    expect(authAccess).toContain("aria-labelledby={termsLabelId}");
    expect(authAccess).toMatch(/<label\s+id=\{termsLabelId\}\s+htmlFor=\{termsId\}/);
    expect(authAccess).toContain("if (isSignUp && !agreedToTerms)");
    expect(authAccess).toContain("TERMS_CONSENT_ERROR");
    expect(auth).toContain("min-h-full");
    expect(auth).toContain("overflow-y-auto");
    expect(safeAreaCss).toContain(".wl-stitch-auth-shell .wl-auth-form-panel");
    expect(safeAreaCss).toContain("min-height: 100% !important");
    expect(safeAreaCss).toContain(".wl-ui-caps.wl-ui-caps--document > .wl-stitch-auth-shell");
    expect(safeAreaCss).toContain("min-height: 100dvh");
    expect(marketingCss).toContain(".marketing-footer-above-sticky");
    expect(marketingCss).toContain("env(safe-area-inset-bottom, 0px)");
  });

  it("only logs the global API error handler at error level for 5xx, keeping 4xx as warn-level noise", () => {
    const server = read("server.ts");
    // The handler must branch on status before choosing a log level: 5xx is a
    // real server fault (error + external alerting), 4xx is an expected
    // client/validation/not-found outcome that should not pollute Vercel's
    // runtime-error view or trigger Sentry alerting.
    expect(server).toContain('log.error("API error", logFields)');
    expect(server).toContain('log.warn("API client error", logFields)');
    // Window covers the headersSent delegation guard that now precedes the
    // status classification.
    const handlerStart = server.indexOf("(error: unknown, req: express.Request");
    const handlerBody = server.slice(handlerStart, handlerStart + 2200);
    expect(handlerBody).toContain("if (status >= 500) {");
    expect(handlerBody.indexOf("log.error(")).toBeLessThan(handlerBody.indexOf("} else {"));
    expect(handlerBody.indexOf("reportError(")).toBeLessThan(handlerBody.indexOf("} else {"));
    expect(handlerBody.indexOf("log.warn(")).toBeGreaterThan(handlerBody.indexOf("} else {"));
  });
});
