import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Fast Start native voice contract", () => {
  const createDialog = read("src/components/CreateAgentDialog.tsx");
  const voicePicker = read("src/components/voice/SimpleVoicePicker.tsx");
  const factory = read("src/lib/voice/openai-phone-agent-runtime.ts");
  const managedRuntime = read("src/lib/managed-voice-runtime.ts");

  it("keeps external provider complexity out of Fast Start", () => {
    expect(createDialog).not.toMatch(/authFetch\("\/api\/voices"\)/);
    expect(createDialog).not.toMatch(/playVoicePreview|ElevenLabs|xAI/);
    expect(createDialog).not.toMatch(/VoicePickerField|VoiceGallery/);
    expect(createDialog).toContain("Not Now");
  });

  it("resolves every new Bot to one of the managed OpenAI phone voices", () => {
    expect(voicePicker).toContain("OPENAI_REALTIME_VOICES");
    expect(voicePicker).toContain("voice.provider");
    expect(factory).toContain("buildOpenAIRealtimeAgentRuntime");
    expect(factory).toContain("resolveOpenAIAgentVoiceSelection");
    expect(managedRuntime).toContain("isManagedOpenAIVoiceId");
    expect(managedRuntime).toContain("DEFAULT_MANAGED_VOICE_ID");
  });
});
