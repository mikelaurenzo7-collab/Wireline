import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { billableVoiceMinutes } from "../src/lib/voice-usage";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

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
    expect(grace).toContain("temporary negative Conversation Balance");
    expect(grace).toContain('idempotencyKey: `voice_completion:${opts.providerCallId}`');
    expect(grace).toContain('entryKind: "burn"');
  });

  it("requires prepaid coverage on every public paid plan", () => {
    const wallet = read("src/lib/voice-wallet-guard.ts");
    const workspace = read("src/lib/workspace-usage-snapshot.ts");
    expect(wallet).toContain('const liveVoiceEnabled = activeSubscription && planId !== "personal"');
    expect(wallet).not.toContain("enterpriseContract");
    expect(workspace).not.toContain("enterpriseContract");
    expect(wallet).toContain("includedRemaining >= MIN_BILLABLE_MINUTES_BUFFER || balance >= requiredUsd");
  });
});
