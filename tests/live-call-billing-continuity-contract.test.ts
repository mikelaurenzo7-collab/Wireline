import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { billableVoiceMinutes } from "../src/lib/voice-usage";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("live-call billing continuity contract", () => {
  it("counts every provider attempt without under-billing sub-minute calls", () => {
    expect(billableVoiceMinutes(0)).toBe(1);
    expect(billableVoiceMinutes(1)).toBe(1);
    expect(billableVoiceMinutes(60)).toBe(1);
    expect(billableVoiceMinutes(61)).toBe(2);
  });

  it("checks coverage before dispatch and never adds a billing hangup path", () => {
    const controls = read("src/lib/voice-spend-control.ts");
    const outbound = read("src/routes/outbound-routes.ts");
    const wallet = read("src/lib/voice-wallet-guard.ts");

    expect(controls).toContain("assertVoiceWalletSolvent");
    expect(outbound.indexOf('outboundVoiceGuard("manual")')).toBeLessThan(
      outbound.indexOf("placeOutboundCall({"),
    );
    expect(wallet).toContain('current_call_policy: "finish_current_block_next"');
    expect(wallet).toContain('code: "VOICE_COMPLETION_GRACE_DUE"');
    expect(wallet).not.toMatch(/endCall|hangup|terminateCall/);
  });

  it("finalizes completed usage against a debt-capable prepaid ledger", () => {
    const usage = read("src/lib/voice-usage.ts");
    const grace = read("src/lib/voice-completion-grace.ts");

    expect(usage).toContain("chargeCompletedVoiceUsage");
    expect(usage).toContain('policy: "finish_current_block_next"');
    expect(grace).toContain("temporary negative Runtime Balance");
    expect(grace).toContain("idempotencyKey: `voice_completion:${opts.providerCallId}`");
    expect(grace).toContain('entryKind: "burn"');
  });

  it("awaits voice metering so a serverless freeze cannot drop it", () => {
    const handlers = read("src/lib/vapi-handlers.ts");
    expect(handlers).toContain("await trackVoiceMinutes({");
    expect(handlers).not.toContain("void trackVoiceMinutes({");
  });

  it("re-drives idempotent voice metering before the duplicate early return", () => {
    /**
     * The monthly counter now has its own durable per-provider-call checkpoint,
     * so duplicate Vapi delivery is the recovery mechanism for a failure after
     * the call-log claim. Metering MUST run before the call-log duplicate return:
     * a DNC write can intentionally throw first, and the retry must still finish
     * the count/debit without re-running downstream notifications or enrichment.
     */
    const handlers = stripComments(read("src/lib/vapi-handlers.ts"));
    const duplicateReturn = handlers.indexOf("if (!insertedFresh) {");
    const metering = handlers.indexOf("await trackVoiceMinutes({");

    expect(duplicateReturn).toBeGreaterThan(-1);
    expect(metering).toBeGreaterThan(-1);
    expect(metering).toBeLessThan(duplicateReturn);
    expect(handlers.split("trackVoiceMinutes(").length - 1).toBe(1);
  });

  it("keys the monthly counter checkpoint by tenant and provider call", () => {
    const usage = stripComments(read("src/lib/voice-usage.ts"));
    const schema = stripComments(read("src/db/voice-usage-schema.ts"));
    const migration = read("drizzle/migrations/0135_voice_usage_event_idempotency.sql");

    expect(usage).toContain("voiceUsageEvents");
    expect(usage).toContain("onConflictDoNothing");
    expect(usage).toContain("providerCallId");
    expect(usage).toContain("chargedAt");
    expect(usage).toContain("throw error;");
    expect(schema).toContain('"wireline_voice_usage_events"');
    expect(schema).toContain("primaryKey({ columns: [table.userId, table.providerCallId] })");
    expect(migration).toContain("PRIMARY KEY (user_id, provider_call_id)");
    expect(migration).toContain("CREATE POLICY tenant_isolation");
    expect(stripComments(read("src/lib/voice-completion-grace.ts"))).toContain(
      "idempotencyKey: `voice_completion:${opts.providerCallId}`",
    );
  });

  it("requires prepaid coverage on every public paid plan", () => {
    const wallet = read("src/lib/voice-wallet-guard.ts");
    const workspace = read("src/lib/workspace-usage-snapshot.ts");
    // Live voice requires a *resolved* catalog plan: `planId !== "personal"`
    // alone passed for a null plan (orphaned stored plan id), enabling voice
    // the ledger could only price at $0.
    expect(wallet).toContain(
      'const liveVoiceEnabled = activeSubscription && !!plan && plan.id !== "personal"',
    );
    expect(wallet).not.toContain("enterpriseContract");
    expect(workspace).not.toContain("enterpriseContract");
    expect(wallet).toContain(
      "includedRemaining >= MIN_BILLABLE_MINUTES_BUFFER || balance >= requiredUsd",
    );
  });
});
