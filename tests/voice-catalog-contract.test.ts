import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("voice catalog", () => {
  it("exposes multi-provider voice pools for create and studio flows", () => {
    const catalog = read("src/lib/voice-catalog.ts");
    expect(catalog).toContain("WIRELINE_LIVE_VOICES");
    expect(catalog).toContain("VAPI_CURATED_VOICES");
    expect(catalog).toContain("ELEVENLABS_CURATED_VOICES");
    expect(catalog).toContain('provider: "11labs"');
    expect(catalog).toContain("playVoicePreview");
    expect(catalog).toContain('"presenter"');
    expect(catalog).toContain("voicePreviewUrl");
    expect(catalog).not.toContain("speechSynthesis");
    // The picker reads the authenticated, server-curated library. It never
    // lists or calls a voice-provider account from the browser.
    const picker = read("src/components/voice/SimpleVoicePicker.tsx");
    expect(picker).toContain("VAPI_CURATED_VOICES");
    expect(picker).toContain('authFetch("/api/voices")');
    expect(picker).toContain("voice.provider");
    expect(picker).not.toContain("api.elevenlabs.io");
    // The preview route renders the exact selected voice through the shared
    // xAI engine; it must never substitute one provider's voice for another.
    expect(read("src/lib/voice/xai-tts-service.ts")).toContain(
      'const XAI_TTS_URL = "https://api.x.ai/v1/tts"',
    );
    expect(read("src/lib/voice/voice-preview-service.ts")).toContain("synthesizeXaiSpeech");
    expect(read("src/lib/voice/voice-preview-service.ts")).not.toContain("XAI_TO_ELEVENLABS");
    expect(read("src/lib/voice/voice-preview-service.ts")).not.toContain("api.elevenlabs.io");
    expect(read("src/lib/voice-catalog.ts")).not.toMatch(/id: "(Kylie|Lily|Hana|Neha|Cole)"/);
    expect(read("src/lib/voice/pcm-resample.ts")).toContain("VAPI_LISTEN_PCM_RATE_HZ");
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

  it("wires HeyGen presenter voices and matched-face resolution", () => {
    const heygenService = read("src/lib/video-presenter/heygen-voice-service.ts");
    const liveAvatarService = read("src/lib/video-presenter/liveavatar-service.ts");
    expect(heygenService).toContain("listPresenterVoices");
    expect(heygenService).toContain("resolveAvatarDefaultVoice");
    expect(heygenService).toContain("process.env.HEYGEN_API_KEY?.trim() || null");
    expect(heygenService).not.toContain("process.env.LIVEAVATAR_API_KEY");
    expect(liveAvatarService).toContain("process.env.LIVEAVATAR_API_KEY?.trim() || null");
    expect(liveAvatarService).not.toContain("process.env.HEYGEN_API_KEY");
    expect(read("src/routes/video-presenter-routes-base.ts")).toContain("matched-voice");
    expect(read("src/lib/voice/voice-preview-service.ts")).toContain("generateCuratedVoicePreview");
    const routes = read("src/routes/grok-voice-routes.ts");
    expect(routes).toContain("/api/voices/curated/preview");
    expect(routes).toContain("authenticateUser");
    expect(routes).toContain("generateCuratedVoicePreview");
  });
});
