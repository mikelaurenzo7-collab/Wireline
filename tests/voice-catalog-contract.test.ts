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
    const fastStartPicker = read("src/components/create-agent/VoicePickerField.tsx");
    expect(fastStartPicker).toContain("VAPI_CURATED_VOICES");
    expect(fastStartPicker).toContain('const RECOMMENDED_VOICE_ID = "Savannah"');
    expect(fastStartPicker).toContain("Choose another built-in voice");
    expect(fastStartPicker).toContain("presenter voices remain optional advanced settings");
    expect(fastStartPicker).not.toContain("/api/voices");
    expect(read("src/routes/voices-routes.ts")).toContain("providers:");
    expect(read("src/routes/voices-routes.ts")).toContain("presenterVoices");
    expect(read("src/routes/voices-routes.ts")).toContain("/api/voices/curated/preview");
    expect(read("src/lib/voice/voice-preview-service.ts")).toContain(
      'const XAI_TTS_URL = "https://api.x.ai/v1/tts"',
    );
    expect(read("src/lib/voice/voice-preview-service.ts")).toContain(
      'const VAPI_SAMPLE_HOST = "files.buildwithfern.com"',
    );
    expect(read("src/lib/voice/voice-preview-service.ts")).toContain("PINNED_VAPI_SAMPLE_URLS");
    expect(read("src/lib/voice/voice-preview-service.ts")).toContain("MAX_PREVIEW_BYTES");
    expect(read("src/lib/voice/voice-preview-service.ts")).toContain('redirect: "error"');
    expect(read("src/lib/voice-catalog.ts")).toContain("VAPI_VOICE_SAMPLE_IDS");
    expect(read("src/lib/voice-catalog.ts")).not.toContain("files.buildwithfern.com");
    expect(read("src/lib/voice/voice-preview-service.ts")).toContain("VAPI_VOICE_SAMPLE_URLS");
    expect(read("src/lib/voice/voice-preview-service.ts")).toContain("files.buildwithfern.com");
    expect(read("src/lib/voice/voice-preview-service.ts")).not.toContain("XAI_TO_ELEVENLABS");
    expect(read("src/lib/voice-catalog.ts")).not.toMatch(/id: "(Kylie|Lily|Hana|Neha|Cole)"/);
    expect(fastStartPicker).toContain("test call");
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
    // The face picker is intentionally minimal while the presenter catalog is paused; it still
    // wires matched-voice resolution through the MatchedPresenterVoice callback API.
    expect(read("src/components/create-agent/CreateAgentCatalogFacePicker.tsx")).toContain(
      "MatchedPresenterVoice",
    );
    expect(read("src/components/create-agent/CreateAgentCatalogFacePicker.tsx")).toContain(
      "onMatchedVoiceChange",
    );
    expect(read("src/lib/voice/voice-preview-service.ts")).toContain("generateCuratedVoicePreview");
  });
});
