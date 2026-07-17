import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("voice catalog", () => {
  it("exposes multi-provider voice pools for create and studio flows", () => {
    const catalog = read("src/lib/voice-catalog.ts");
    expect(catalog).toContain("WIRELINE_LIVE_VOICES");
    expect(catalog).toContain("VAPI_CURATED_VOICES");
    expect(catalog).toContain("playVoicePreview");
    expect(catalog).toContain('"presenter"');
    expect(catalog).toContain("voicePreviewUrl");
    expect(catalog).not.toContain("speechSynthesis");
    // Studio voice choice runs on the curated managed catalog with no
    // external provider fetches in the picker itself.
    expect(read("src/components/voice/SimpleVoicePicker.tsx")).toContain("VAPI_CURATED_VOICES");
    expect(read("src/components/voice/SimpleVoicePicker.tsx")).not.toContain('"/api/voices"');
    expect(read("src/routes/voices-routes.ts")).toContain("providers:");
    expect(read("src/routes/voices-routes.ts")).toContain("presenterVoices");
    expect(read("src/routes/voices-routes.ts")).toContain("/api/voices/curated/preview");
    expect(read("src/lib/voice/voice-preview-service.ts")).toContain(
      'const XAI_TTS_URL = "https://api.x.ai/v1/tts"',
    );
    expect(read("src/lib/voice/voice-preview-service.ts")).not.toContain("XAI_TO_ELEVENLABS");
    expect(read("src/lib/voice-catalog.ts")).not.toMatch(/id: "(Kylie|Lily|Hana|Neha|Cole)"/);
    expect(read("src/lib/voice/pcm-resample.ts")).toContain("VAPI_LISTEN_PCM_RATE_HZ");
    expect(read("src/pages/AgentStudioHomeClaude.tsx")).toContain("consumeCreateWarning");
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
  });
});
