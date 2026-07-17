import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("Fast Start native voice contract", () => {
  const voicePicker = read("src/components/create-agent/VoicePickerField.tsx");
  const createDialog = read("src/components/CreateAgentDialog.tsx");

  it("resolves the legacy auto state before interaction to a managed phone voice", () => {
    expect(voicePicker).toMatch(/useLayoutEffect/);
    expect(voicePicker).toMatch(/const RECOMMENDED_VOICE_ID = "Savannah"/);
    expect(voicePicker).toMatch(/value\.mode !== "auto"/);
    expect(voicePicker).toMatch(/provider: "vapi"/);
    expect(voicePicker).toMatch(/No separate voice-provider setup is required/);
    expect(voicePicker).toMatch(/Choose another managed voice/);
  });

  it("keeps external provider complexity out of Fast Start", () => {
    expect(voicePicker).not.toMatch(/authFetch\("\/api\/voices"\)/);
    expect(voicePicker).not.toMatch(/playVoicePreview/);
    expect(voicePicker).toMatch(/Managed by Wireline/);
    expect(voicePicker).toMatch(/Place a real phone call after setup/);
  });

  it("preserves Fast Start keyboard focus and existing voice persistence", () => {
    expect(voicePicker).toMatch(/id="voice-picker-details-toggle"/);
    expect(createDialog).toMatch(/voice\.mode === "custom"/);
    expect(createDialog).toMatch(/\/agent-config\/\$\{encodeURIComponent\(body\.id\)\}\/voice/);
    expect(createDialog).toMatch(/voiceId: voice\.voiceId/);
    expect(createDialog).toMatch(/provider: voice\.provider/);
  });
});
