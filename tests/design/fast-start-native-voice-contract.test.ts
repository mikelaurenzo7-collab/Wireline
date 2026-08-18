import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("Fast Start native voice contract", () => {
  const createDialog = read("src/components/CreateAgentDialog.tsx");
  const voicePicker = read("src/components/voice/SimpleVoicePicker.tsx");
  const runtime = read("src/lib/voice/xai-agent-runtime.ts");
  const roster = read("src/data/voice-roster.ts");

  it("keeps external provider complexity out of Fast Start", () => {
    expect(createDialog).not.toMatch(/authFetch\("\/api\/voices"\)/);
    expect(createDialog).not.toMatch(/playVoicePreview|ElevenLabs|xAI/);
    expect(createDialog).not.toMatch(/VoicePickerField|VoiceGallery/);
    expect(createDialog).toContain("Not now");
  });

  it("resolves every new employee and saved phone choice to native xAI", () => {
    expect(voicePicker).toMatch(/WIRELINE_LIVE_VOICES/);
    expect(voicePicker).toMatch(/provider: "xai"/);
    expect(runtime).toMatch(/voiceId: schema\.agents\.voiceId/);
    expect(runtime).toMatch(/voiceProvider: schema\.agents\.voiceProvider/);
    expect(runtime).toMatch(/phoneVoiceId: schema\.agents\.phoneVoiceId/);
    expect(runtime).toMatch(/phoneVoiceProvider: schema\.agents\.phoneVoiceProvider/);
    expect(runtime).toMatch(/selectedXaiVoice/);
    expect(runtime).toMatch(/isXaiPstnVoiceId/);
    expect(runtime).toMatch(/voiceProvider: "xai"/);
    expect(roster).toContain("const rotation = MANAGED_XAI_VOICE_IDS;");
    expect(roster).not.toContain(
      "const rotation = [...MANAGED_XAI_VOICE_IDS, ...MANAGED_VOICE_IDS];",
    );
  });
});
