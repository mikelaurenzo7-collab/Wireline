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
  const factory = read("src/lib/vapi-assistant-factory-v2.ts");

  it("keeps external provider complexity out of Fast Start", () => {
    expect(createDialog).not.toMatch(/authFetch\("\/api\/voices"\)/);
    expect(createDialog).not.toMatch(/playVoicePreview|ElevenLabs|xAI/);
    expect(createDialog).not.toMatch(/VoicePickerField|VoiceGallery/);
    expect(createDialog).toContain("Voice, phone, and testing come next in Studio.");
  });

  it("resolves every new employee to a managed phone voice", () => {
    // Studio's managed picker writes curated Vapi voices; the live factory
    // clamps anything else to the managed default before a call is placed.
    expect(voicePicker).toMatch(/VAPI_CURATED_VOICES/);
    expect(voicePicker).toMatch(/provider: "vapi"/);
    expect(factory).toMatch(/isManagedVapiVoiceId/);
    expect(factory).toMatch(/DEFAULT_MANAGED_VOICE_ID/);
  });
});
