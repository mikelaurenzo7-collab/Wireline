import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("current customer voice offering", () => {
  it("defers clone entry points without disabling built-in voices or deleting clone implementations", () => {
    expect(source("src/lib/voice-clone-release.ts")).toContain("VOICE_CLONING_UI_ENABLED = false");
    const picker = source("src/components/voice/SimpleVoicePicker.tsx");
    expect(picker).toContain("VOICE_CLONING_UI_ENABLED && showCloneShortcut");
    expect(picker).toContain("VOICE_CLONING_UI_ENABLED && ownerId ? (\n        <LiveVoiceCloneStudio");
    expect(picker).toContain("VOICE_CLONING_UI_ENABLED && ownerId ? (\n        <VoiceClonePanel");
    expect(picker).toContain("OPENAI_REALTIME_VOICES");
    expect(picker).toContain("<PhoneVoiceCatalog");
    const rehearsal = source("src/components/StudioVoiceRehearsal.tsx");
    expect(rehearsal).toContain("if (!VOICE_CLONING_UI_ENABLED) return;");
    expect(rehearsal).toContain("VOICE_CLONING_UI_ENABLED ? active : null");
  });

  it("removes dead-end clone promotion from setup while preserving historical voice links", () => {
    const copy = source("src/lib/wireline-onboarding-copy.ts");
    const review = source("src/components/StudioAgentReviewPanel.tsx");
    const routes = source("src/routes/AppRoutes.tsx");
    expect(copy).toContain("Choose a built-in voice.");
    expect(copy).not.toContain("Pick a voice or clone your own");
    expect(review).toContain("&section=setup#voice");
    expect(review).not.toContain("Clone Voice");
    expect(routes).toContain('path="/voice-clone"');
    expect(routes).toContain("to={`/studio?${search.toString()}#voice`}");
  });
});
