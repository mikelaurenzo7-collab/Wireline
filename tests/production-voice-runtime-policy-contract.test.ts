import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("production voice runtime policy", () => {
  it("keeps audio-file generators out of live PSTN voice routing", () => {
    const policy = read("docs/PRODUCTION_VOICE_RUNTIME_POLICY_2026-07-26.md");
    expect(policy).toContain("AI Voice Generator creates audio assets");
    expect(policy).toContain("not live PSTN runtime engines");
    expect(policy).toContain("Vapi-supported streaming voice-library workflow");
  });

  it("labels legacy xAI preview voices as preview-only, not production runtime", () => {
    const catalog = read("src/lib/voice-catalog.ts");
    const preview = read("src/lib/voice/voice-preview-service.ts");

    expect(catalog).toContain("Legacy curated preview voices for browser auditioning only");
    expect(catalog).toContain("production PSTN voice engine");
    expect(catalog).toContain("Wireline Preview");
    expect(catalog).not.toContain("low-latency realtime speech (xAI Grok)");
    expect(preview).toContain("preview-only audio samples");
    expect(preview).toContain("never participates in live call routing");
  });

  it("keeps custom browser voices unsupported and points phone voice customization at Vapi", () => {
    const routes = read("src/routes/grok-live-profile-routes.ts");
    const docs = read("docs/GROK_LIVE_VOICE.md");

    expect(routes).toContain("generated marketing voiceovers are not live call voices");
    expect(routes).toContain("Vapi-supported streaming voice-library workflow");
    expect(docs).toContain("AI Voice Generator, presenter TTS, and other audio-file tools");
    expect(docs).toContain("not live PSTN runtime engines");
  });
});
