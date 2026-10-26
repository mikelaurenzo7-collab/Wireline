import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("live voice trust surface", () => {
  it("renders one honest lifecycle indicator without a simulated audio meter", () => {
    const voice = source("src/components/LiveVoiceSandbox.tsx");
    const openai = source("src/components/OpenAILiveVoiceSandbox.tsx");
    const presence = source("src/lib/voice-presence.ts");

    expect(voice).toContain('export { default } from "./OpenAILiveVoiceSandbox"');
    expect(openai).toContain("function voiceActivity(state: VoiceState)");
    expect(openai).toContain("Connecting Live Voice");
    expect(presence).toContain('thinking: "Checking Approved Knowledge"');
    expect(presence).toContain('speaking: "Bot Speaking"');
    expect(presence).toContain('listening: "Listening"');
    expect(openai).toContain("VOICE_PRESENCE.thinking");
    expect(openai).toContain("VOICE_PRESENCE.speaking");
    expect(openai).toContain("Live Voice Needs Attention");
    expect(openai).toContain('role="status"');
    expect(openai).toContain('className="wl-voice-bar__label"');
    expect(openai).toContain("Microphone Muted");
    expect(openai).not.toContain("<ConversationActivity");
    expect(openai).not.toContain("wl-voice-bar__meter");
  });

  it("preserves voice transcript provenance using conversation messages", () => {
    const openai = source("src/components/OpenAILiveVoiceSandbox.tsx");

    expect(openai).toContain("<ConversationMessage");
    expect(openai).toContain('channel="voice"');
    expect(openai).toContain('author={line.role === "You" ? "customer" : "assistant"}');
    expect(openai).toContain('label={line.role === "You" ? "You" : agentName}');
  });

  it("keeps the safe live-test boundary and recovery behavior visible", () => {
    const openai = source("src/components/OpenAILiveVoiceSandbox.tsx");

    expect(openai).toContain("cannot perform external actions");
    expect(openai).toContain("Live Voice Interrupted");
    expect(openai).toContain("Reset Live Voice");
    expect(openai).toContain("<StatusNotice");
    expect(openai).toContain('aria-label="Reset Live Voice"');
  });

  it("uses OpenAI Realtime as the Studio transport with approved tool contracts", () => {
    const voice = source("src/components/LiveVoiceSandbox.tsx");
    const openai = source("src/components/OpenAILiveVoiceSandbox.tsx");

    expect(openai).toContain('authFetch("/api/voice/live/session"');
    expect(openai).toContain('authFetch("/api/voice/live/tool"');
    expect(openai).toContain("response.output_audio_transcript.delta");
    expect(openai).toContain("conversation.item.input_audio_transcription.completed");
    expect(openai).toContain("response.function_call_arguments.done");
    expect(voice).toContain('export { default } from "./OpenAILiveVoiceSandbox"');
  });
});
