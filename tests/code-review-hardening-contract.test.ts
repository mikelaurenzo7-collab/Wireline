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

  it("rejects production Vapi routing by bare ?agentId= without phoneNumberId", () => {
    const resolver = read("src/lib/vapi-webhook-agent.ts");
    expect(resolver).toContain("IS_PROD && !phoneNumberId");
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

  it("keeps duplicate end-of-call retries side-effect free after transcript backfill", () => {
    const handlers = read("src/lib/vapi-handlers.ts");
    expect(handlers).toContain(
      "Duplicate end-of-call-report ignored after retry-safe transcript patch",
    );
    expect(handlers).toContain(
      "All downstream side effects (usage, customer webhooks,\n    // compliance ledger, enrichment, notifications) are intentionally skipped",
    );
    const duplicateReturn = handlers.indexOf(
      "return;\n  }",
      handlers.indexOf("if (!insertedFresh)"),
    );
    const firstCallMilestone = handlers.indexOf('event: "first_call_completed"');
    const usageTracking = handlers.indexOf("// Fire-and-forget monthly voice-minute tracking");
    expect(duplicateReturn).toBeGreaterThan(-1);
    expect(firstCallMilestone).toBeGreaterThan(duplicateReturn);
    expect(usageTracking).toBeGreaterThan(firstCallMilestone);
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
