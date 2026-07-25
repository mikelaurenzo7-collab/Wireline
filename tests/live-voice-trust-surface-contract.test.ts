import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("live voice trust surface", () => {
  it("renders lifecycle state through the canonical activity molecule", () => {
    const voice = source("src/components/OpenAILiveVoiceSandbox.tsx");

    expect(voice).toContain("function voiceActivity(state: VoiceState)");
    expect(voice).toContain("Connecting live voice");
    expect(voice).toContain("Checking approved knowledge");
    expect(voice).toContain("Agent speaking");
    expect(voice).toContain("Live voice needs attention");
    expect(voice).toContain("<ConversationActivity");
  });

  it("preserves voice transcript provenance using conversation messages", () => {
    const voice = source("src/components/OpenAILiveVoiceSandbox.tsx");

    expect(voice).toContain("<ConversationMessage");
    expect(voice).toContain('channel="voice"');
    expect(voice).toContain('author={line.role === "You" ? "customer" : "assistant"}');
    expect(voice).toContain('label={line.role === "You" ? "You" : agentName}');
  });

  it("keeps the safe live-test boundary and recovery behavior visible", () => {
    const voice = source("src/components/OpenAILiveVoiceSandbox.tsx");

    expect(voice).toContain("cannot perform external actions");
    expect(voice).toContain("Live voice interrupted");
    expect(voice).toContain("Reset live voice");
    expect(voice).toContain("<StatusNotice");
    expect(voice).toContain('aria-label="Reset live voice"');
  });

  it("retains the existing live voice transport and approved tool contracts", () => {
    const voice = source("src/components/OpenAILiveVoiceSandbox.tsx");

    expect(voice).toContain('authFetch("/api/voice/live/session"');
    expect(voice).toContain('authFetch("/api/voice/live/tool"');
    expect(voice).toContain("response.output_audio_transcript.delta");
    expect(voice).toContain("conversation.item.input_audio_transcription.completed");
    expect(voice).toContain("response.function_call_arguments.done");
  });
});
