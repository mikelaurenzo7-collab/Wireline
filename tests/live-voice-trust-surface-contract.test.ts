import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("live voice trust surface", () => {
  it("renders lifecycle state through the canonical activity molecule", () => {
    const voice = source("src/components/XAILiveVoiceSandbox.tsx");
    const openai = source("src/components/OpenAILiveVoiceSandbox.tsx");

    for (const surface of [voice, openai]) {
      expect(surface).toContain("function voiceActivity(state: VoiceState)");
      expect(surface).toContain("Connecting live voice");
      expect(surface).toContain("Checking approved knowledge");
      expect(surface).toContain("Agent speaking");
      expect(surface).toContain("Live voice needs attention");
      expect(surface).toContain("<ConversationActivity");
    }
  });

  it("preserves voice transcript provenance using conversation messages", () => {
    const voice = source("src/components/XAILiveVoiceSandbox.tsx");
    const openai = source("src/components/OpenAILiveVoiceSandbox.tsx");

    for (const surface of [voice, openai]) {
      expect(surface).toContain("<ConversationMessage");
      expect(surface).toContain('channel="voice"');
      expect(surface).toContain('author={line.role === "You" ? "customer" : "assistant"}');
      expect(surface).toContain('label={line.role === "You" ? "You" : agentName}');
    }
  });

  it("keeps the safe live-test boundary and recovery behavior visible", () => {
    const voice = source("src/components/XAILiveVoiceSandbox.tsx");
    const openai = source("src/components/OpenAILiveVoiceSandbox.tsx");

    for (const surface of [voice, openai]) {
      expect(surface).toContain("cannot perform external actions");
      expect(surface).toContain("Live voice interrupted");
      expect(surface).toContain("Reset live voice");
      expect(surface).toContain("<StatusNotice");
      expect(surface).toContain('aria-label="Reset live voice"');
    }
  });

  it("uses OpenAI Realtime as the Studio transport with approved tool contracts", () => {
    const voice = source("src/components/XAILiveVoiceSandbox.tsx");
    const openai = source("src/components/OpenAILiveVoiceSandbox.tsx");

    expect(openai).toContain('authFetch("/api/voice/live/session"');
    expect(openai).toContain('authFetch("/api/voice/live/tool"');
    expect(openai).toContain("response.output_audio_transcript.delta");
    expect(openai).toContain("conversation.item.input_audio_transcription.completed");
    expect(openai).toContain("response.function_call_arguments.done");
    expect(voice).toContain("xai-client-secret.");
  });
});
