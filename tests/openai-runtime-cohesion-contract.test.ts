import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("OpenAI runtime cohesion", () => {
  it("gives founder and customer Bots the same Realtime authority", () => {
    const policy = read("src/lib/voice/runtime-policy.ts");
    expect(policy.match(/runtime: "openai_realtime"/g)).toHaveLength(2);
    expect(policy.match(/carrier: "twilio"/g)).toHaveLength(2);
    expect(policy.match(/fallbackRuntime: null/g)).toHaveLength(2);
    expect(policy).not.toMatch(/vapi|xai|grok/i);
  });

  it("uses OpenAI for created, drafted, and founder showcase Bots", () => {
    for (const path of [
      "src/routes/agent-routes-v2.ts",
      "src/lib/agent-draft-service.ts",
      "src/lib/founder-fleet-seed.ts",
      "src/lib/founder-showcase-seed.ts",
    ]) {
      expect(read(path)).toContain('voiceProvider: "openai"');
    }
  });

  it("mounts the OpenAI browser, SIP, inbound, and outbound routes", () => {
    const registry = read("src/server/register-api-routes.ts");
    for (const route of [
      "liveVoiceRouter",
      "openAISipRouter",
      "openAIInboundTwilioRouter",
      "openAIOutboundRouter",
    ]) {
      expect(registry).toContain(route);
    }
  });

  it("uses a presenter-specific OpenAI phone fallback", () => {
    const runtime = read("src/lib/voice/openai-phone-agent-runtime.ts");
    expect(runtime).toContain('voiceProvider?.toLowerCase() === "presenter"');
    expect(runtime).toContain("runtime.agent.phoneVoiceId");
    expect(runtime).toContain("normalizeOpenAIRealtimeVoice");
  });
});
