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

  it("awaits the voice overage debit so a serverless freeze cannot drop it", () => {
    // handleEndOfCallReport is awaited by both the queue and sync-fallback
    // callers. The overage debit must be awaited (not fire-and-forget) so it is
    // part of the job's committed work — otherwise an invocation freeze after
    // the job completes permanently loses the charge and the duplicate-retry
    // branch never re-drives it.
    const handlers = read("src/lib/vapi-handlers.ts");
    expect(handlers).toContain("await trackVoiceMinutes({");
    expect(handlers).not.toContain("void trackVoiceMinutes({");
  });

  it("never re-drives voice metering from the duplicate-retry branch", () => {
    /**
     * There is a real gap here: the callLogs INSERT claims the idempotency
     * boundary, but metering runs ~130 lines later, so anything throwing in
     * between drops the charge for good — the retry finds the claim taken and
     * returns early.
     *
     * The obvious fix — re-drive trackVoiceMinutes from the duplicate branch —
     * is WRONG, and this gate exists to stop it. Its idempotency is partial:
     * `voice_completion:<callId>` keys the Runtime Balance charge only, while
     * the monthly counter upserts `used + minutes` with no per-call guard. A
     * second call for the same provider id therefore inflates quota minutes and
     * pushes the tenant into overage they never used — trading a lost charge
     * for a wrong one. Closing the gap needs the counter keyed per call too,
     * which is a schema change.
     */
    const handlers = stripComments(read("src/lib/vapi-handlers.ts"));
    const duplicateReturn = handlers.indexOf("if (!insertedFresh) {");
    const metering = handlers.indexOf("await trackVoiceMinutes({");

    expect(duplicateReturn).toBeGreaterThan(-1);
    expect(metering).toBeGreaterThan(duplicateReturn);
    // One call site only: a second one is how the duplicate branch would
    // acquire its own re-drive without this position check ever noticing.
    expect(handlers.split("trackVoiceMinutes(").length - 1).toBe(1);
  });

  it("keeps the per-call idempotency key on the charge, not the monthly counter", () => {
    // Pins the asymmetry the gate above depends on. If the counter is ever made
    // per-call idempotent, this test is the place that says so — and only then
    // does re-driving metering become safe.
    const usage = stripComments(read("src/lib/voice-usage.ts"));
    expect(usage).toContain("${schema.quotaUsage.used} + ${BigInt(minutes)}");
    expect(usage).not.toContain("voice_completion:");
    expect(stripComments(read("src/lib/voice-completion-grace.ts"))).toContain(
      "idempotencyKey: `voice_completion:${opts.providerCallId}`",
    );
  });

  it("requires prepaid coverage on every public paid plan", () => {
    const wallet = read("src/lib/voice-wallet-guard.ts");
    const workspace = read("src/lib/workspace-usage-snapshot.ts");
    expect(wallet).toContain(
      'const liveVoiceEnabled = activeSubscription && planId !== "personal"',
    );
    expect(wallet).not.toContain("enterpriseContract");
    expect(workspace).not.toContain("enterpriseContract");
    expect(wallet).toContain(
      "includedRemaining >= MIN_BILLABLE_MINUTES_BUFFER || balance >= requiredUsd",
    );
  });
});
