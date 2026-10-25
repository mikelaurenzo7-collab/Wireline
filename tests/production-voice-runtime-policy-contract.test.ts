import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("production voice runtime policy", () => {
  it("keeps sample generators out of live routing and delegates cloned media to its signed bridge", () => {
    const policy = read("docs/PRODUCTION_VOICE_RUNTIME_POLICY_2026-07-26.md");
    expect(policy).toContain(
      "Twilio carrier/PSTN through signed BotBound routing to the admitted voice provider",
    );
    expect(policy).toContain(
      "xAI voice by default for every number; lines register with xAI automatically and OpenAI Realtime is the fallback.",
    );
    expect(policy).toContain("A new-call flag cannot switch an active call's provider.");
    expect(read("docs/OPENAI_REALTIME_VOICE.md")).toContain("`gpt-realtime-2.1`");
    for (const path of [
      "src/lib/voice/realtime-sip-target.ts",
      "src/lib/voice/openai-phone-agent-runtime.ts",
    ]) {
      expect(read(path), path).not.toMatch(
        /elevenlabs|11labs|synthesizeVoiceSample|\/audio\/speech|text-to-speech/i,
      );
    }
    const session = read("src/lib/voice/openai-sip-session.ts");
    expect(session).toContain("createClonedMediaSession");
    expect(session).not.toMatch(/synthesizeVoiceSample|\/audio\/speech|text-to-speech/i);
    expect(read("src/lib/voice/elevenlabs-media-bridge.ts")).toContain("twilio.validateRequest");
  });

  it("labels only documented OpenAI voices as live phone voices", () => {
    const catalog = read("src/lib/voice-catalog.ts");
    for (const voice of [
      "alloy",
      "ash",
      "ballad",
      "coral",
      "echo",
      "sage",
      "shimmer",
      "verse",
      "marin",
      "cedar",
    ]) {
      expect(catalog).toContain(`id: "${voice}"`);
    }
    expect(catalog).not.toMatch(/vapi|xai|grok/i);
  });

  it("keeps disabled operator diagnostics separate from selectable voices and live runtime", () => {
    const policy = read("docs/PRODUCTION_VOICE_RUNTIME_POLICY_2026-07-26.md");
    const runtime = read("src/lib/voice/openai-phone-agent-runtime.ts");
    const catalog = read("src/lib/voice-catalog.ts");
    expect(policy).toContain("## Cloned live voices");
    expect(policy).toContain("never the reference audio");
    expect(policy).toContain("loss of both speech paths ends the session explicitly");
    expect(policy).toContain(
      "The disabled platform-admin private-preview foundation and ElevenLabs",
    );
    expect(policy).toContain("read-only operator diagnostics");
    expect(policy).toContain("neither changes a saved");
    expect(policy).toContain("OpenAI voice or authorizes customer enrollment");
    expect(catalog).not.toMatch(/elevenlabs|11labs/i);
    expect(runtime).not.toMatch(/elevenlabs|11labs/i);
  });
});
