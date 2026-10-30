import { describe, expect, it } from "vitest";
import { Buffer } from "node:buffer";
import {
  createInhouseCloneEngine,
  cloneEngine,
  isCloneEngineId,
  CLONE_ENGINE_IDS,
} from "../src/lib/voice/clone-engines";
import {
  selectCloneEngine,
  cloneEngineCandidates,
  resolvePreferredCloneEngine,
} from "../src/lib/voice/clone-engine-selection";

describe("in-house clone engine (self-sufficient voice synthesis)", () => {
  it("registers inhouse in CLONE_ENGINE_IDS and clone engine registry", () => {
    expect(CLONE_ENGINE_IDS).toContain("inhouse");
    expect(isCloneEngineId("inhouse")).toBe(true);
    const engine = cloneEngine("inhouse");
    expect(engine.id).toBe("inhouse");
    expect(engine.liveMode).toBe("native_realtime");
    expect(engine.configured()).toBe(true);
  });

  it("creates in-house voice clone and validates voice id format", async () => {
    const engine = createInhouseCloneEngine();
    // 44-byte minimal WAV header
    const sampleWav = Buffer.alloc(44);
    sampleWav.write("RIFF", 0);
    sampleWav.write("WAVE", 8);

    const result = await engine.create({
      name: "Mike Laurenzo - Founder",
      wav: sampleWav,
      gender: "male",
    });

    expect(result.providerVoiceId).toMatch(/^inhouse_/);
    expect(engine.isVoiceId(result.providerVoiceId)).toBe(true);
  });

  it("rejects invalid audio payloads", async () => {
    const engine = createInhouseCloneEngine();
    await expect(
      engine.create({
        name: "Test",
        wav: Buffer.alloc(10), // too small
      }),
    ).rejects.toThrow();
  });

  it("synthesizes in-house preview audio without external API dependency", async () => {
    const engine = createInhouseCloneEngine();
    const previewAudio = await engine.preview("inhouse_test_id", "Hello from BotBound voice!");
    expect(previewAudio.byteLength).toBeGreaterThan(44);
    expect(previewAudio.toString("ascii", 0, 4)).toBe("RIFF");
    expect(previewAudio.toString("ascii", 8, 12)).toBe("WAVE");
  });

  it("selects inhouse when preferred or when external vendors are unconfigured", () => {
    const selection = selectCloneEngine({
      jurisdiction: "US-IL",
      xai: { configured: false, entitled: false, teamVoicesUsed: 0, teamLimit: 30 },
      elevenlabs: { configured: false },
    });
    expect(selection.engine).toBe("inhouse");
    expect(selection.writtenReleaseRequired).toBe(true);

    const candidates = cloneEngineCandidates({
      jurisdiction: "US-CA",
      xai: { configured: false, entitled: false, teamVoicesUsed: 0, teamLimit: 30 },
      elevenlabs: { configured: false },
    });
    expect(candidates).toEqual(["inhouse"]);
  });

  it("resolves inhouse preferred clone engine from environment", () => {
    expect(resolvePreferredCloneEngine({ VOICE_CLONE_ENGINE_DEFAULT: "inhouse" })).toBe("inhouse");
  });
});
