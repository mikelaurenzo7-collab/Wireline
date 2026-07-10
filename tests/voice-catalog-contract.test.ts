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
    expect(read("src/components/create-agent/VoicePickerField.tsx")).toContain("/api/voices");
    expect(read("src/components/create-agent/VoicePickerField.tsx")).toContain(
      "Presenter voice (video)",
    );
    expect(read("src/routes/voices-routes.ts")).toContain("providers:");
    expect(read("src/routes/voices-routes.ts")).toContain("presenterVoices");
    expect(read("src/routes/voices-routes.ts")).toContain("/api/voices/curated/preview");
    expect(read("src/lib/voice/pcm-resample.ts")).toContain("VAPI_LISTEN_PCM_RATE_HZ");
    expect(read("src/pages/AgentStudioHomeClaude.tsx")).toContain("consumeCreateWarning");
  });

  it("wires HeyGen presenter voices and matched-face resolution", () => {
    expect(read("src/lib/video-presenter/heygen-voice-service.ts")).toContain(
      "listPresenterVoices",
    );
    expect(read("src/lib/video-presenter/heygen-voice-service.ts")).toContain(
      "resolveAvatarDefaultVoice",
    );
    expect(read("src/routes/video-presenter-routes-base.ts")).toContain("matched-voice");
    expect(read("src/components/create-agent/CreateAgentCatalogFacePicker.tsx")).toContain(
      "matched-voice",
    );
    expect(read("src/components/create-agent/CreateAgentCatalogFacePicker.tsx")).toContain(
      "Voice match",
    );
    expect(read("src/lib/voice/voice-preview-service.ts")).toContain("generateCuratedVoicePreview");
  });
});
