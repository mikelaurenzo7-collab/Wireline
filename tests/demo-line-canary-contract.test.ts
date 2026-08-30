import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("demo-line canary keeps showcase numbers on OpenAI inbound", () => {
  const canary = read("src/lib/demo-line-canary.ts");

  it("probes the complete canonical Twilio routing configuration", () => {
    expect(canary).toContain("isNativeNumberOpenAIRouted(number)");
    expect(canary).toContain("smsUrl: row.smsUrl");
    expect(canary).toContain("smsMethod: row.smsMethod");
    expect(canary).toContain("voiceMethod: row.voiceMethod");
    expect(canary).toContain("voiceFallbackMethod: row.voiceFallbackMethod");
    expect(canary).not.toContain("webhookPath");
    expect(canary).not.toContain("vapiFetch");
    expect(canary).not.toContain("api.vapi.ai");
  });

  it("repairs drifted showcase webhooks before alerting", () => {
    expect(canary).toContain("async function repairShowcaseOpenAIInboundRouting");
    expect(canary.indexOf("await repairShowcaseOpenAIInboundRouting(")).toBeLessThan(
      canary.indexOf("probeLine(agent, kind, carrierNumbers, assignments, runtimeReady)"),
    );
    expect(canary).toContain("configureNativeNumberRouting");
    expect(canary).toContain("isNativeNumberOpenAIRouted(row)");
    expect(canary).toContain("showcaseTels.has(String(row.phoneNumber || \"\"))");
  });
});
