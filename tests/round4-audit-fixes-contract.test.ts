import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

/**
 * Contract: round-4 audit fixes (security/backend, runtime/vendor, marketing).
 * Each assertion locks a verified defect closed; see the commit message for
 * the full failure scenarios.
 */
describe("round-4 audit fix contracts", () => {
  it("purge_deleted_account enqueue is deduped so a failing purge cannot flood the queue", () => {
    const jobs = read("src/routes/job-routes.ts");
    const block = jobs.slice(jobs.indexOf("dueDeletions"));
    expect(block.slice(0, 2200)).toContain("purgeDedupSince");
    expect(block.slice(0, 2200)).toContain('inArray(schema.jobs.status, ["pending", "running"])');
    expect(block.slice(0, 2200)).toContain("if (existingPurge) continue;");
  });

  it("outbound placeholder finalization is an atomic claim, not read-then-update", () => {
    const handlers = read("src/lib/vapi-handlers.ts");
    const claim = handlers.slice(handlers.indexOf("isOutboundCallPlaceholder(existing)"));
    // Conditional WHERE re-checks the placeholder markers and RETURNING
    // decides the winner; insertedFresh only flips for the winner.
    expect(claim.slice(0, 3000)).toContain("OUTBOUND_CALL_DIALING_MARKER");
    expect(claim.slice(0, 3000)).toContain("OUTBOUND_CALL_PLACEHOLDER_SUMMARY");
    expect(claim.slice(0, 3000)).toContain(".returning({ id: schema.callLogs.id })");
    expect(claim.slice(0, 3400)).toContain("if (finalized.length)");
  });

  it("refund list failures throw for a clean Stripe retry instead of double-reversing", () => {
    const billing = read("src/routes/billing-routes.ts");
    expect(billing).not.toContain("catch(() => [] as Stripe.Refund[])");
    expect(billing).toContain("A transient list failure must THROW");
  });

  it("purge defers when Stripe is unconfigured but the account holds Stripe ids", () => {
    const deletion = read("src/lib/account-deletion.ts");
    expect(deletion).toContain("if (!stripeAvailable())");
    expect(deletion).toContain("deferring purge so a live subscription is not orphaned");
  });

  it("engine scan indexes exist in both the migration and the schema", () => {
    const migration = read("drizzle/migrations/0110_engine_scan_indexes.sql");
    const schema = read("src/db/schema.ts");
    for (const source of [migration, schema]) {
      expect(source).toContain("idx_leads_callback_due_global");
      expect(source).toContain("idx_jobs_type_created_at");
    }
  });

  it("finished system-sentinel jobs are retired by the daily janitor", () => {
    const jobs = read("src/routes/job-routes.ts");
    expect(jobs).toMatch(/DELETE FROM wireline_jobs[\s\S]{0,200}status IN \('done', 'dead'\)/);
  });

  it("HIPAA agents never record on either call direction", () => {
    expect(read("src/lib/vapi-client.ts")).toContain(
      'recordingEnabled: agentConfig.complianceMode !== "hipaa"',
    );
    expect(read("src/lib/vapi-assistant-factory-v2.ts")).toContain(
      'recordingEnabled: configured.complianceMode !== "hipaa"',
    );
  });

  it("every curated Vapi voice a picker offers is accepted at runtime", () => {
    const roster = read("src/data/voice-roster.ts");
    // isManagedVapiVoiceId must check the full curated catalog, not the
    // 8-voice rotation pool — otherwise picker choices silently collapse
    // to the default voice on live calls.
    const check = roster.slice(roster.indexOf("export function isManagedVapiVoiceId"));
    expect(check.slice(0, 400)).toContain("VAPI_CURATED_VOICES.some");
  });

  it("the 2-3s latency 'nudge window' is never sent as Vapi's end-call silence timer", () => {
    const factory = read("src/lib/vapi-assistant-factory-v2.ts");
    expect(factory).not.toContain("latency.silenceTimeoutSeconds");
    expect(factory).toContain("configured.silenceTimeoutSeconds >= 10");
  });

  it("ambient noise is enum-validated at write time and sanitized at dial time", () => {
    const planner = read("src/lib/workspace-planner.ts");
    expect(planner).toContain('WORKSPACE_AMBIENT_OPTIONS = ["off", "office"]');
    expect(planner).toContain("export function sanitizeAmbientNoise");
    expect(read("src/routes/agent-workspace-routes.ts")).toContain('spec.kind === "ambient"');
    expect(read("src/lib/vapi-client.ts")).toContain(
      "sanitizeAmbientNoise(agentConfig.ambientNoise)",
    );
    expect(read("src/lib/vapi-assistant-factory-v2.ts")).toContain(
      "sanitizeAmbientNoise(configured.ambientNoise)",
    );
  });

  it("outbound prompts are capped like inbound — no 500-row interpolation", () => {
    const client = read("src/lib/vapi-client.ts");
    expect(client).toContain(".limit(MAX_RUNTIME_DIRECTIVES)");
    expect(client).toContain(".limit(MAX_RUNTIME_KNOWLEDGE)");
    expect(client).toContain("truncateRuntimeSnippet");
    expect(client).toContain("clampRuntimePromptPreservingTail(runtime.prompt)");
    expect(client).not.toContain(".limit(500)");
  });

  it("the public showcase line carries a COGS duration ceiling", () => {
    const showcase = read("src/lib/showcase-assistant.ts");
    expect(showcase).toContain("maxDurationSeconds: 600");
  });

  it("transferPhone backs up the escalation warm-transfer destination", () => {
    const handlers = read("src/routes/vapi/tool-handlers-workflow.ts");
    expect(handlers).toContain("transferPhone: schema.agents.transferPhone");
    expect(handlers).toMatch(/row\?\.phone\?\.trim\(\) \|\| row\?\.transferPhone\?\.trim\(\)/);
  });

  it("realtime sessions are pinned to the platform model", () => {
    const service = read("src/lib/voice/openai-realtime-service.ts");
    const session = service.slice(service.indexOf("buildOpenAIRealtimeSessionConfig"));
    expect(session.slice(0, 1400)).toContain("model: OPENAI_REALTIME_DEFAULT_MODEL");
    expect(session.slice(0, 1400)).not.toContain("input.model?.trim() ||");
  });

  it("Microsoft token refresh writes back to the tagged source table", () => {
    const integrations = read("src/lib/integrations.ts");
    expect(integrations).toContain('__accountTable: "calendar" as const');
    expect(integrations).toContain('__accountTable: "mail" as const');
    expect(integrations).toContain('account.__accountTable === "calendar"');
  });

  it("the cookie consent notice is mounted and the deploy gate asserts the mount", () => {
    const app = read("src/App.tsx");
    expect(app).toContain('import CookieConsent from "./components/CookieConsent";');
    expect(app).toContain("<CookieConsent />");
    expect(read("scripts/check-marketing-measurement-consent.mjs")).toContain(
      "must actually be MOUNTED",
    );
  });

  it("paywall copy names only plans that exist publicly", () => {
    for (const path of ["src/lib/trial-gate.ts", "src/lib/voice-wallet-guard.ts"]) {
      const source = read(path);
      expect(source).not.toContain("Choose Starter, Team, or Business");
    }
    expect(read("src/lib/trial-gate.ts")).toContain("Starter, Starter Plus, or Pro");
  });
});
