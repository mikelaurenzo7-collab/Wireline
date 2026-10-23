import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { resolveOpenAIAgentVoiceSelection } from "../src/lib/voice/openai-phone-agent-runtime";
import {
  buildRealtimeSipSocketUrl,
  configuredPhoneVoiceProvider,
  realtimeCallControlUrl,
} from "../src/lib/voice/realtime-provider";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("OpenAI runtime cohesion", () => {
  it("keeps founder and customer default OpenAI lane descriptors compatible", () => {
    const policy = read("src/lib/voice/runtime-policy.ts");
    expect(policy.match(/runtime: "openai_realtime"/g)).toHaveLength(2);
    expect(policy.match(/carrier: "twilio"/g)).toHaveLength(2);
    expect(policy.match(/fallbackRuntime: null/g)).toHaveLength(2);
    expect(policy).not.toMatch(/vapi/i);
    expect(policy).toContain("Actual phone admission is owned");
  });

  it("keeps admitted call control on its provider when the new-call setting changes", () => {
    try {
      vi.stubEnv("WIRELINE_PHONE_VOICE_PROVIDER", "xai");
      expect(configuredPhoneVoiceProvider()).toBe("xai");
      expect(realtimeCallControlUrl("rtc_original", "hangup")).toBe(
        "https://api.openai.com/v1/realtime/calls/rtc_original/hangup",
      );
      vi.stubEnv("WIRELINE_PHONE_VOICE_PROVIDER", "openai");
      expect(configuredPhoneVoiceProvider()).toBe("openai");
      expect(realtimeCallControlUrl("xai:original", "hangup")).toBe(
        "https://api.x.ai/v1/realtime/calls/original/hangup",
      );
      expect(buildRealtimeSipSocketUrl("xai:original")).toBe(
        "wss://api.x.ai/v1/realtime?call_id=original",
      );
    } finally {
      vi.unstubAllEnvs();
    }
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
    expect(
      resolveOpenAIAgentVoiceSelection({
        voiceProvider: " Presenter ",
        voiceId: "shimmer",
        phoneVoiceId: "cedar",
        profile: "warm",
      }),
    ).toBe("cedar");
    expect(runtime).toContain('input.voiceProvider?.trim().toLowerCase() === "presenter"');
    expect(runtime).toContain("runtime.agent.phoneVoiceId");
    expect(runtime).toContain("normalizeOpenAIRealtimeVoice");
  });
});
