import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("production voice runtime policy", () => {
  it("keeps audio-file generators out of live PSTN voice routing", () => {
    const policy = read("docs/PRODUCTION_VOICE_RUNTIME_POLICY_2026-07-26.md");
    expect(policy).toContain("Rendered assets are not a live-call runtime");
    expect(policy).toContain("eleven_flash_v2_5");
    expect(policy).toContain("Every ElevenLabs voice has a curated Vapi fallback");
  });

  it("labels legacy xAI preview voices as preview-only, not production runtime", () => {
    const catalog = read("src/lib/voice-catalog.ts");
    const preview = read("src/lib/voice/voice-preview-service.ts");

    expect(catalog).toContain("Legacy curated preview voices for browser auditioning only");
    expect(catalog).toContain("production PSTN voice engine");
    expect(catalog).toContain("Wireline Preview");
    expect(catalog).not.toContain("low-latency realtime speech (xAI Grok)");
    expect(preview).toContain("Browser audio samples");
    expect(preview).toContain("never participates in live call routing");

    // The xAI TTS engine is a real render path, so the PSTN boundary has to be
    // stated where the engine lives — not only where the preview calls it.
    const xaiTts = read("src/lib/voice/xai-tts-service.ts");
    expect(xaiTts).toContain("NOT reachable from live PSTN routing");
    // Comment reflow must not be able to erase the reason for the boundary.
    expect(xaiTts.replace(/\s*\n\s*\*?\s*/g, " ")).toContain(
      "Vapi publishes no `xai` voice provider",
    );
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
