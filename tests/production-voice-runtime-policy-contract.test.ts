import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("production voice runtime policy", () => {
  it("keeps audio-file generators out of live PSTN voice routing", () => {
    const policy = read("docs/PRODUCTION_VOICE_RUNTIME_POLICY_2026-07-26.md");
    expect(policy).toContain("Twilio carrier/PSTN → BotBound signed TwiML → OpenAI project SIP");
    expect(policy).toContain("OpenAI Realtime `gpt-realtime-2.1`");
    expect(policy).toContain("no alternate runtime or provider fallback");
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
    expect(policy).toContain(
      "BotBound has no customer-selectable external voice catalog or live-call cloning",
    );
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
