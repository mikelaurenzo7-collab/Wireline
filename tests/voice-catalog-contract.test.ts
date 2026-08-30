import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("voice catalog", () => {
  it("exposes OpenAI live voices and isolates ElevenLabs to Studio", () => {
    const catalog = read("src/lib/voice-catalog.ts");
    expect(catalog).toContain("WIRELINE_LIVE_VOICES");
    expect(catalog).toContain("OPENAI_REALTIME_VOICES");
    expect(catalog).toContain("ELEVENLABS_CURATED_VOICES");
    expect(catalog).toContain('provider: "openai"');
    expect(catalog).toContain('provider: "11labs"');
    expect(catalog).toContain("voicePreviewUrl");
    expect(catalog).toContain("live calls use OpenAI Realtime");
    expect(catalog).not.toMatch(/vapi|xai|grok/i);
    // The picker reads the authenticated, server-curated library. It never
    // lists or calls a voice-provider account from the browser.
    const picker = read("src/components/voice/SimpleVoicePicker.tsx");
    expect(picker).toContain("OPENAI_REALTIME_VOICES");
    expect(picker).toContain('authFetch("/api/voices")');
    expect(picker).toContain("voice.provider");
    expect(picker).not.toContain("api.elevenlabs.io");
    const routes = read("src/routes/voices-routes.ts");
    expect(routes).toContain("generateElevenLabsProof");
    expect(routes).toContain("isCuratedElevenLabsVoiceId");
    expect(routes).toContain('provider: "11labs"');
    expect(read("src/pages/AgentStudioHome.tsx")).toContain("consumeCreateWarning");
  });

  it("keeps the readiness gate's core voice ids in sync with the catalog", () => {
    // scripts/check-vendor-readiness.mjs cannot import the TS constant, so it
    // hardcodes a mirror of ELEVENLABS_CORE_VOICE_IDS. If the two drift, the
    // launch gate would verify a different core set than the runtime ships.
    const idsFromBlock = (source: string, marker: string): string[] => {
      const start = source.indexOf(marker);
      expect(start).toBeGreaterThan(-1);
      // Anchor on the `=` so a `readonly string[]` type annotation's brackets
      // are not mistaken for the array literal.
      const eq = source.indexOf("=", start);
      const open = source.indexOf("[", eq);
      const close = source.indexOf("]", open);
      return Array.from(source.slice(open, close).matchAll(/"([^"]+)"/g), (m) => m[1]);
    };
    const catalogCore = idsFromBlock(
      read("src/lib/voice-catalog.ts"),
      "export const ELEVENLABS_CORE_VOICE_IDS",
    );
    const gateCore = idsFromBlock(
      read("scripts/check-vendor-readiness.mjs"),
      "const coreElevenLabsVoiceIds = new Set(",
    );
    expect(catalogCore.length).toBeGreaterThanOrEqual(3);
    expect([...gateCore].sort()).toEqual([...catalogCore].sort());
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
    expect(runtime).not.toContain("ELEVENLABS_CURATED_VOICES");
  });
});
