import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("code review hardening contracts", () => {
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

  it("rejects production Vapi routing that did not resolve a tenant from a provisioned number", () => {
    // Strengthened from the original `IS_PROD && !phoneNumberId` presence check:
    // a present-but-unregistered phoneNumberId also fails to establish a tenant,
    // and must not fall back to trusting a bare ?agentId= under no tenant fence.
    const resolver = read("src/lib/vapi-webhook-agent.ts");
    expect(resolver).toContain("IS_PROD && !enforceTenantUserId");
    expect(resolver).not.toContain("IS_PROD && !phoneNumberId");
  });

  it("deduplicates inbound Twilio SMS by MessageSid before thread writes", () => {
    const twilio = read("src/routes/twilio-webhook-base.ts");
    expect(twilio).toContain("schema.smsMessages.twilioSid");
    expect(twilio).toContain("tenantStore.run(tenantUserId");
  });

  it("never lets an SMS START reply remove manual or legal DNC records", () => {
    const twilio = read("src/routes/twilio-webhook.ts");
    expect(twilio).toContain("LEGACY_OPT_IN_KEYWORDS");
    expect(twilio).toContain('eq(schema.dncList.source, "twilio_advanced_opt_out")');
    expect(twilio).toContain('eq(schema.dncList.source, "sms_opt_out")');
    expect(twilio).toContain('eq(schema.dncList.reason, "opt-out")');
    expect(twilio).toContain("if (!legacy) return res.status(200).send(emptyTwiml());");
    expect(twilio).toContain(
      '.send(control === "stop" ? optOutConfirmationTwiml() : optInConfirmationTwiml());',
    );
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
    const vapi = read("src/routes/vapi-v2.ts");
    const billing = read("src/routes/billing-routes.ts");
    expect(vapi).toContain("tenantStore.run(routed.agentUserId");
    expect(billing).toContain("tenantStore.run(userId");
  });

  it("returns 500 when end-of-call sync fallback fails so Vapi can retry", () => {
    const vapi = read("src/routes/vapi-v2.ts");
    expect(vapi).toContain("res.status(500).json({ success: false })");
  });

  it("keeps duplicate end-of-call retries side-effect free after mandatory DNC suppression", () => {
    const handlers = read("src/lib/vapi-handlers.ts");
    expect(handlers).toContain("Duplicate end-of-call-report reached retry-safe evidence patch");
    const suppression = handlers.indexOf("await persistTranscriptDncSuppression({");
    // Voice metering intentionally sits between DNC suppression and the
    // duplicate return: its own tenant+provider-call checkpoint makes it
    // idempotent, so a redelivery can resume unfinished revenue accounting
    // without duplicating any one-time side effect below the guard.
    const complianceEvidence = handlers.indexOf("await persistComplianceEvidence({", suppression);
    const usageTracking = handlers.indexOf("await trackVoiceMinutes({", suppression);
    const duplicateGuard = handlers.indexOf("if (!insertedFresh)", usageTracking);
    const duplicateReturn = handlers.indexOf("return;", duplicateGuard);
    const firstCallMilestone = handlers.indexOf('event: "first_call_completed"');
    expect(suppression).toBeGreaterThan(-1);
    // TCPA evidence is idempotent per call and runs before the duplicate
    // return so a redelivery restores rows a failed first delivery lost.
    expect(complianceEvidence).toBeGreaterThan(suppression);
    expect(usageTracking).toBeGreaterThan(complianceEvidence);
    expect(usageTracking).toBeGreaterThan(suppression);
    expect(duplicateGuard).toBeGreaterThan(usageTracking);
    expect(duplicateReturn).toBeGreaterThan(duplicateGuard);
    expect(firstCallMilestone).toBeGreaterThan(duplicateReturn);
    expect(handlers.slice(duplicateGuard, duplicateReturn)).toContain(
      "Everything below is one-time work.",
    );
  });

  it("tracks post-create roleplay starts only from a connected live voice test", () => {
    const wizard = read("src/components/onboarding/PostCreateActivationWizard.tsx");
    const roleplay = read("src/components/RoleplaySandbox.tsx");
    // LiveVoiceSandbox is a thin re-export; the OpenAI Realtime implementation owns the callback.
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
    const panes = [
      {
        path: "src/components/EmailInbox.tsx",
        loader: "const loadThreadDetail = useCallback(",
        write: "setDetail({",
        loading: "if (!signal?.aborted) setDetailLoading(false);",
      },
      {
        path: "src/components/SmsThreads.tsx",
        loader: "const fetchMessages = useCallback(",
        write: "setMessages(",
        loading: "if (!signal?.aborted) setMessagesLoading(false);",
      },
    ] as const;

    for (const pane of panes) {
      const source = read(pane.path);
      expect(source, pane.path).toContain("signal?: AbortSignal");
      expect(source, pane.path).toContain("{ signal }");
      expect(source, pane.path).toContain("const controller = new AbortController();");
      expect(source, pane.path).toContain("return () => controller.abort();");

      // Every write path must respect the abort — the result, the error banner,
      // and the loading flag the newer request already owns. Asserting the guard
      // exists once is not enough: the catch-path copy alone satisfies that
      // while the stale result still lands on the pane.
      const loader = source.slice(
        source.indexOf(pane.loader),
        source.indexOf("const controller = new AbortController();"),
      );
      expect(
        (loader.match(/if \(signal\?\.aborted\) return;/g) || []).length,
        pane.path,
      ).toBeGreaterThanOrEqual(2);
      expect(loader.indexOf("if (signal?.aborted) return;"), pane.path).toBeLessThan(
        loader.indexOf(pane.write),
      );
      expect(loader, pane.path).toContain(pane.loading);
    }
  });

  it("keeps public purchase, consent, and sticky-CTA promises internally consistent", () => {
    const pricing = read("src/pages/Pricing.tsx");
    const terms = read("src/components/LegalPage.tsx");
    const auth = read("src/components/AuthPortal.tsx");
    const marketingCss = read("src/styles/public-marketing-polish.css");

    expect(pricing).toContain("within 30 days of your first paid invoice");
    expect(pricing).not.toContain("within 14 days of a first paid charge");
    expect(terms).toContain("30-day money-back guarantee");
    expect(auth).toContain('aria-labelledby="auth-terms-label"');
    expect(auth).toContain('<span id="auth-terms-label">');
    expect(auth).toContain("<AuthShell compact={isSignUp}>");
    expect(auth).toContain('compact ? "py-3 sm:py-4" : "py-8 sm:py-12"');
    expect(auth).toContain('isSignUp ? "mt-4 gap-3" : "mt-6 gap-5"');
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
    const handlerStart = server.indexOf("(error: unknown, req: express.Request");
    const handlerBody = server.slice(handlerStart, handlerStart + 1200);
    expect(handlerBody).toContain("if (status >= 500) {");
    expect(handlerBody.indexOf("log.error(")).toBeLessThan(handlerBody.indexOf("} else {"));
    expect(handlerBody.indexOf("reportError(")).toBeLessThan(handlerBody.indexOf("} else {"));
    expect(handlerBody.indexOf("log.warn(")).toBeGreaterThan(handlerBody.indexOf("} else {"));
  });
});
