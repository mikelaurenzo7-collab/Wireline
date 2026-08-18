import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("native xAI carrier and transfer lifecycle regressions", () => {
  it("never reclassifies or double-meters a Twilio leg after xAI SIP bridging", () => {
    const source = read("src/routes/xai-outbound-routes.ts");
    const neverBridgedStart = source.indexOf("function neverBridgedNativeVoice");
    const neverBridgedEnd = source.indexOf("async function loadCampaignMaxAttempts", neverBridgedStart);
    const neverBridged = source.slice(neverBridgedStart, neverBridgedEnd);

    expect(neverBridged).toContain("!nativeVoice.xai_call_id");
    expect(neverBridged).toContain('amdAction !== "bridge"');
    expect(neverBridged).toContain('state !== "bridging"');
    expect(neverBridged).toContain('state !== "connected"');
    expect(neverBridged).toContain('state !== "transferred"');

    const terminalStart = source.indexOf(
      "isMonotonic && TERMINAL_CARRIER_FAILURES.has(carrierStatus)",
    );
    const completedStart = source.indexOf(
      'isMonotonic && carrierStatus === "completed"',
      terminalStart,
    );
    const terminalBranch = source.slice(terminalStart, completedStart);
    const bridgeGuard = terminalBranch.indexOf(
      "lead.status === LEAD_STATUS.CONNECTED || !neverBridgedNativeVoice(nativeVoice)",
    );
    const retryMutation = terminalBranch.indexOf(
      "patch.status = resolveRetryableLeadStatus",
    );
    const unansweredMeter = terminalBranch.indexOf("meterUnanswered = true");

    expect(terminalStart).toBeGreaterThan(-1);
    expect(completedStart).toBeGreaterThan(terminalStart);
    expect(bridgeGuard).toBeGreaterThan(-1);
    expect(retryMutation).toBeGreaterThan(bridgeGuard);
    expect(unansweredMeter).toBeGreaterThan(retryMutation);
    expect(terminalBranch).toContain("carrier_terminal_after_bridge");
  });

  it("closes only the local realtime session after REFER and disarms the watchdog", () => {
    const source = read("src/lib/voice/xai-sip-session.ts");
    const notifierStart = source.indexOf("const notifyTransferred = () => {");
    const notifierEnd = source.indexOf("liveSipSessions.set", notifierStart);
    const notifier = source.slice(notifierStart, notifierEnd);

    expect(notifier).toContain('endedReason = "transferred"');
    expect(notifier).toContain("clearTimeout(maxDurationTimer)");
    expect(notifier).toContain("maxDurationTimer = null");
    expect(notifier).toContain('ws.close(1000, "Wireline transferred")');
    expect(notifier).not.toContain("hangupXAISipCall");

    const completedToolStart = source.indexOf("let transferCompleted = false;");
    const completedToolEnd = source.indexOf(
      'if (call.name === "add_to_dnc")',
      completedToolStart,
    );
    const completedTool = source.slice(completedToolStart, completedToolEnd);
    const refer = completedTool.indexOf("await referXAISipCall");
    const output = completedTool.indexOf('type: "function_call_output"');
    const notify = completedTool.indexOf("notifyTransferred()");

    expect(refer).toBeGreaterThan(-1);
    expect(output).toBeGreaterThan(refer);
    expect(notify).toBeGreaterThan(output);
    expect(completedTool).not.toContain('endedReason = "transferred"');

    const timerStart = source.indexOf("maxDurationTimer = setTimeout(() => {");
    const timerEnd = source.indexOf("}, maxDurationMs);", timerStart);
    const timer = source.slice(timerStart, timerEnd);
    const terminalGuard = timer.indexOf(
      'if (endedReason === "transferred" || endedReason === "caller-dnc") return;',
    );
    const providerHangup = timer.indexOf("hangupXAISipCall(input.callId)");

    expect(terminalGuard).toBeGreaterThan(-1);
    expect(providerHangup).toBeGreaterThan(terminalGuard);
  });
});
