import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("dual-voice PSTN routing contracts", () => {
  it("preserves phone voice on presenter PATCH unless explicitly overridden", () => {
    const routes = read("src/routes/agent-routes-v2.ts");
    expect(routes).toContain("hasPhoneVoiceId");
    expect(routes).toContain("hasPhoneVoiceProvider");
    expect(routes).toContain("resolvePresenterPhoneVoicePayload");
    expect(routes).toContain("phoneVoiceId is required with phoneVoiceProvider");
    expect(routes).toContain('provider !== "presenter"');
    expect(routes).not.toContain(
      'if (provider === "presenter" || phoneVoiceId || phoneVoiceProviderRaw)',
    );
  });

  it("never substitutes presenter voice id on the PSTN path", () => {
    const factory = read("src/lib/vapi-assistant-factory-v2.ts");
    const presenterBlock = factory.slice(
      factory.indexOf('if (voiceProvider === "presenter")'),
      factory.indexOf("const speech = resolveVapiSpeechPipeline"),
    );
    expect(presenterBlock).toContain("resolvePresenterPhoneVoicePayload");
    expect(presenterBlock).not.toContain("pickRotatedVoiceId");
    expect(presenterBlock).not.toContain("configured.voiceId");
  });

  it("routes Training phone picks through dual-voice PATCH when presenter is active", () => {
    const gallery = read("src/components/voice/VoiceGallery.tsx");
    expect(gallery).toContain('applyVoice(voice, "phone")');
    expect(gallery).toContain("phoneVoiceId");
    expect(gallery).toContain('provider: "presenter"');
  });

  it("keeps the presenter active when Studio changes the simple phone voice", () => {
    const picker = read("src/components/voice/SimpleVoicePicker.tsx");
    const review = read("src/components/StudioAgentReviewPanel.tsx");

    expect(picker).toContain('selectedProvider === "presenter"');
    expect(picker).toContain('provider: "presenter"');
    expect(picker).toContain("phoneVoiceId: voice.id");
    expect(picker).toContain('phoneVoiceProvider: "vapi"');
    expect(picker).toContain("effectivePhoneVoiceId");
    expect(picker).toContain("effectivePhoneVoiceProvider");
    expect(picker).toContain("Your Studio presenter stays active");
    expect(review).toContain('config?.voice?.provider === "presenter"');
    expect(review).toContain("config?.voice?.effectivePhoneVoiceId");
    expect(review).toContain("config?.voice?.effectivePhoneVoiceProvider");
    expect(review).toContain("Live phone voice");
  });
});
