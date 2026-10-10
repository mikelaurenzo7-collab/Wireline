import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { OPENAI_REALTIME_VOICE_IDS, OPENAI_REALTIME_VOICES } from "../src/lib/voice-catalog";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("voice catalog", () => {
  it("exposes only the ten OpenAI live choices in the customer picker", () => {
    const catalog = read("src/lib/voice-catalog.ts");
    expect(catalog).toContain("WIRELINE_LIVE_VOICES");
    expect(catalog).toContain("OPENAI_REALTIME_VOICES");
    expect(catalog).toContain('provider: "openai"');
    expect(catalog).not.toMatch(/elevenlabs|11labs|vapi|xai|grok/i);
    expect(OPENAI_REALTIME_VOICE_IDS).toHaveLength(10);
    expect(OPENAI_REALTIME_VOICES.map((voice) => voice.id).sort()).toEqual(
      [...OPENAI_REALTIME_VOICE_IDS].sort(),
    );
    // The customer picker is exactly the managed OpenAI catalog.
    const picker = read("src/components/voice/SimpleVoicePicker.tsx");
    expect(picker).toContain("OPENAI_REALTIME_VOICES");
    expect(picker).not.toContain('authFetch("/api/voices")');
    expect(picker).toContain("voice.provider");
    expect(picker).toContain("OpenAILiveVoiceSandbox");
    expect(picker).toContain("Preview Voice");
    expect(picker).not.toContain("VoiceCloningStudio");
    expect(picker).not.toContain("api.elevenlabs.io");
    expect(existsSync(resolve(process.cwd(), "src/routes/voices-routes.ts"))).toBe(false);
    const registry = read("src/server/register-api-routes.ts");
    expect(registry).not.toContain("voicesRouter");
    expect(registry).not.toContain("voices-routes");
    expect(read("src/pages/AgentStudioHome.tsx")).toContain("consumeCreateWarning");
  });

  it("keeps ElevenLabs out of the launch readiness network probe", () => {
    const readiness = read("scripts/check-vendor-readiness.mjs");
    expect(readiness).not.toMatch(/elevenlabs|11labs/i);
  });

  it("keeps presenters and studio voices out of live phone routing", () => {
    expect(read("src/lib/video-presenter/liveavatar-service.ts")).not.toContain(
      "process.env.LIVEAVATAR_API_KEY",
    );
    expect(read("src/lib/video-presenter/liveavatar-service.ts")).not.toContain(
      "process.env.HEYGEN_API_KEY",
    );
    expect(read("src/routes/video-presenter-routes-base.ts")).toContain("matched-voice");
    expect(read("src/routes/video-presenter-routes-base.ts")).toContain("throwLiveVideoRetired");
    const runtime = read("src/lib/voice/openai-phone-agent-runtime.ts");
    expect(runtime).toContain("runtime.agent.phoneVoiceId");
    expect(runtime).toContain("normalizeOpenAIRealtimeVoice");
    expect(runtime).not.toMatch(/elevenlabs|11labs/i);
  });
});
