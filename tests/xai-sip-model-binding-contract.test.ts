import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("xAI browser pin and SIP model boundary", () => {
  it("pins direct browser sessions but joins SIP only by provider call id", () => {
    const browser = read("src/lib/voice/grok-voice-config.ts");
    const sip = read("src/lib/voice/xai-sip-config.ts");

    expect(browser).toContain('GROK_VOICE_PINNED_MODEL = "grok-voice-think-fast-2.0"');
    expect(browser).toContain('url.searchParams.set("model", model)');

    const join = sip.slice(
      sip.indexOf("export function buildXAISipRealtimeUrl"),
      sip.indexOf("export function xaiSharedTwilioOriginationUri"),
    );
    expect(join).toContain('url.searchParams.set("call_id", normalized)');
    expect(join).not.toContain('url.searchParams.set("model"');
    expect(sip).toContain("ignores a `model` query parameter");
    expect(sip).toContain("does not version-pin the SIP model");
  });

  it("keeps public and operating docs honest about current provider routing", () => {
    const knowledge = read("src/data/wireline-knowledge.ts");
    const architecture = read("ARCHITECTURE.md");
    const voicePolicy = read("docs/PRODUCTION_VOICE_RUNTIME_POLICY_2026-07-26.md");
    const vendorMap = read("docs/VENDOR_LAUNCH_MAP.md");
    const grokVoice = read("docs/GROK_LIVE_VOICE.md");

    for (const source of [knowledge, architecture, voicePolicy, vendorMap, grokVoice]) {
      expect(source).toMatch(/provider-bound|currently routes registered SIP calls/i);
    }
    expect(knowledge).toContain("Studio tests pin that same version directly");
    expect(architecture).toContain("Studio live tests use a direct xAI WebSocket pinned");
    expect(voicePolicy).toContain("The SIP `call_id` join is provider-bound");
    expect(vendorMap).toContain("a future provider alias change");
    expect(grokVoice).toContain("the `model` query parameter is ignored");
  });
});

describe("retired live-video boundary", () => {
  it("keeps checkout and provider session minting closed in canonical docs", () => {
    const architecture = read("ARCHITECTURE.md");
    const voicePolicy = read("docs/PRODUCTION_VOICE_RUNTIME_POLICY_2026-07-26.md");
    const vendorMap = read("docs/VENDOR_LAUNCH_MAP.md");

    for (const source of [architecture, voicePolicy, vendorMap]) {
      expect(source).toMatch(/Live (talking-head )?video is retired|Live Video \| Retired/i);
      expect(source).not.toContain("Live Video is a separate fixed recurring add-on");
    }
    expect(vendorMap).toContain("The live Stripe product is inactive");
    expect(voicePolicy).toContain("Checkout and provider session minting remain closed");
  });
});
