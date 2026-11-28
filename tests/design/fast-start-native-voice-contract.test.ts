import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Bo's first conversation native voice contract", () => {
  const firstRun = read("src/components/onboarding/BoOnboarding.tsx");
  const setup = read("src/components/StudioAgentWorkspacePanel.tsx");
  const voicePicker = read("src/components/voice/SimpleVoicePicker.tsx");
  const factory = read("src/lib/voice/openai-phone-agent-runtime.ts");
  const managedRuntime = read("src/lib/managed-voice-runtime.ts");

  it("keeps external provider complexity out of Bo's first conversation", () => {
    expect(firstRun).not.toMatch(/authFetch\("\/api\/voices"\)/);
    expect(firstRun).not.toMatch(/playVoicePreview|ElevenLabs|xAI/);
    expect(firstRun).not.toMatch(/VoicePickerField|VoiceGallery/);
    // Pick My Voice opens Set Up's voice section, where the built-in voices are listed.
    expect(firstRun).toContain("finish(`/studio?agent=${id}&section=setup#voice`)");
    expect(setup).toMatch(/id="voice"[\s\S]*?<SimpleVoicePicker/);
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
