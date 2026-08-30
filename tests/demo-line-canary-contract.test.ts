import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("demo-line canary keeps showcase numbers on OpenAI inbound", () => {
  const canary = read("src/lib/demo-line-canary.ts");

  it("probes Twilio voice and fallback URLs against the OpenAI inbound bridge", () => {
    expect(canary).toContain('const OPENAI_INBOUND_PATH = "/api/twilio-webhook/openai-inbound"');
    expect(canary).toContain(
      'const OPENAI_INBOUND_FALLBACK_PATH = "/api/twilio-webhook/openai-inbound-fallback"',
    );
    expect(canary).toContain("webhookPath(number?.voiceUrl) === OPENAI_INBOUND_PATH");
    expect(canary).toContain("webhookPath(number?.voiceFallbackUrl) === OPENAI_INBOUND_FALLBACK_PATH");
    expect(canary).not.toContain("vapiFetch");
    expect(canary).not.toContain("api.vapi.ai");
  });

  it("repairs drifted showcase webhooks before alerting", () => {
    expect(canary).toContain("async function repairShowcaseOpenAIInboundRouting");
    expect(canary.indexOf("await repairShowcaseOpenAIInboundRouting(")).toBeLessThan(
      canary.indexOf("probeLine(agent, kind, carrierNumbers, assignments, runtimeReady)"),
    );
    expect(canary).toContain("configureNativeNumberRouting");
    expect(canary).toContain("showcaseTels.has(String(row.phoneNumber || \"\"))");
  });
});
