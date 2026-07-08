import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

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
    const twilio = read("src/routes/twilio-webhook.ts");
    expect(twilio).toContain("schema.smsMessages.twilioSid");
    expect(twilio).toContain("tenantStore.run(tenantUserId");
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
    expect(handlers).toContain(
      "return;\n  }\n\n  // Fire-and-forget monthly voice-minute tracking",
    );
  });

  it("tracks post-create roleplay starts only from a connected live voice test", () => {
    const wizard = read("src/components/onboarding/PostCreateActivationWizard.tsx");
    const roleplay = read("src/components/RoleplaySandbox.tsx");
    const liveVoice = read("src/components/LiveVoiceSandbox.tsx");

    expect(wizard).not.toContain("onFocusCapture");
    expect(wizard).toContain("onTestStarted={() =>");
    expect(roleplay).toContain("onTestStarted?: () => void");
    expect(liveVoice).toContain("onTestStarted?: () => void");
    expect(liveVoice).toContain("reportedStarted.current = true");
    expect(liveVoice).toContain("onTestStarted?.()");
  });

  it("defensively handles unavailable browser storage in activation nudges", () => {
    const nudge = read("src/components/ActivationNudge.tsx");
    expect(nudge).toContain("function readDismissed()");
    expect(nudge).toContain("function writeDismissed()");
    expect(nudge).toContain("catch");
  });
});
