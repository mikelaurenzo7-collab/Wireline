import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveOpenAISipSessionMaxSeconds } from "../src/lib/voice/openai-sip-config";

/**
 * Guard: LIVE_RESEARCH_TIMEOUT_MS must remain a public-research HTTP timeout,
 * never a PSTN call-duration or profitability hard-cap.
 */
describe("live research timeout is not a call-duration cap", () => {
  it("documents that the 8s default belongs to the Perplexity request boundary", () => {
    const source = readFileSync(resolve("src/lib/perplexity-platform.ts"), "utf8");
    expect(source).toMatch(/LIVE_RESEARCH_TIMEOUT_MS/);
    expect(source).toMatch(/NOT a call-duration or billing cap/);
    expect(source).toMatch(/8_000/);
  });

  it("keeps voice accounting rules: reserved coverage with bounded completion credit", () => {
    const source = readFileSync(resolve("src/lib/voice-usage.ts"), "utf8");
    const funding = readFileSync(resolve("src/lib/voice-call-funding.ts"), "utf8");
    expect(source).toContain("reserve call funding before acceptance");
    expect(source).toContain("additional completion minutes within the durable session deadline");
    expect(source).toContain("completion debt pauses new calls and prepaid extras until paid");
    expect(source).not.toMatch(/never terminated for billing/i);
    expect(funding).toContain("fundedMinutes < 1");
    expect(funding).toContain(
      "fundedMinutes + (opts.phoneTest ? 0 : VOICE_COMPLETION_GRACE_MINUTES)",
    );
    expect(source).toMatch(/Runtime Balance/);
    expect(source).not.toMatch(/LIVE_RESEARCH_TIMEOUT/);
    expect(funding).not.toMatch(/LIVE_RESEARCH_TIMEOUT/);
  });

  it("distinguishes the live session limit from billing and research timeouts in pricing", () => {
    const source = readFileSync(resolve("src/pages/Pricing.tsx"), "utf8");
    expect(source).toMatch(/How long can a call last\?/i);
    expect(source).toContain("up to 60 minutes per session");
    expect(source).toMatch(/unless a shorter limit is\s+configured/);
    expect(source).toContain("spending limit can shorten the reserved duration");
    expect(source).toContain("Reaching a session or reserved limit ends the call.");
    const funding = readFileSync(resolve("src/lib/voice-call-funding.ts"), "utf8");
    const usageBranch = funding.slice(funding.indexOf("if (isUsagePlanId(plan.id))"));
    expect(usageBranch).toContain("await admitVoiceUsage(");
    expect(usageBranch).toContain("graceMinutes: 0");
    const usage = readFileSync(resolve("src/lib/usage-billing-store.ts"), "utf8");
    expect(usage).toContain("Math.floor((admission.maxUnits ?? requestedSeconds / 60) * 60)");
    expect(source).not.toContain("Balance depletion does not cut off an active call");
    expect(source).not.toContain("Calls run as long as the conversation needs");
    expect(source).not.toContain("An active call is never cut off");
  });

  it.each([
    { configured: undefined, expected: 3600 },
    { configured: "30", expected: 30 },
    { configured: "120", expected: 120 },
    { configured: "300", expected: 300 },
    { configured: "3600", expected: 3600 },
    { configured: "9999", expected: 3600 },
    { configured: "0", expected: 3600 },
    { configured: "-10", expected: 3600 },
    { configured: "", expected: 3600 },
    { configured: "invalid", expected: 3600 },
  ])(
    "keeps the published upper bound honest with duration configuration $configured",
    ({ configured, expected }) => {
      const seconds = resolveOpenAISipSessionMaxSeconds({
        OPENAI_SIP_MAX_CALL_SECONDS: configured,
      });
      expect(seconds).toBe(expected);
      expect(seconds).toBeLessThanOrEqual(60 * 60);
    },
  );
});
