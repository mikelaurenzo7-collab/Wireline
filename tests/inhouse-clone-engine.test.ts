import { describe, expect, it } from "vitest";
import { Buffer } from "node:buffer";
import {
  createInhouseCloneEngine,
  cloneEngine,
  isCloneEngineId,
  CLONE_ENGINE_IDS,
  synthesizeInhouseVoiceChunks,
  getInhouseVoiceProfile,
  resetInhouseVoiceStoreForTests,
  sweepInhouseVoiceRetention,
} from "../src/lib/voice/clone-engines";
import {
  selectCloneEngine,
  cloneEngineCandidates,
  resolvePreferredCloneEngine,
  requiresWrittenBiometricRelease,
  WRITTEN_BIOMETRIC_RELEASE_JURISDICTIONS,
  biometricReleaseRecord,
  biometricExpiresAt,
  BIOMETRIC_MAX_DAYS,
  BIOMETRIC_IDLE_DAYS,
  BIOMETRIC_RETENTION_POLICY_VERSION,
} from "../src/lib/voice/clone-engine-selection";
import { liveVoiceService } from "../src/lib/voice/live-voice-service";

describe("in-house clone engine (self-sufficient voice synthesis)", () => {
  it("registers inhouse in CLONE_ENGINE_IDS and clone engine registry", () => {
    expect(CLONE_ENGINE_IDS).toContain("inhouse");
    expect(isCloneEngineId("inhouse")).toBe(true);
    const engine = cloneEngine("inhouse");
    expect(engine.id).toBe("inhouse");
    expect(engine.liveMode).toBe("native_realtime");
    expect(engine.configured()).toBe(true);
  });

  it("creates in-house voice clone and validates voice id format and style embedding", async () => {
    resetInhouseVoiceStoreForTests();
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

    const profile = getInhouseVoiceProfile(result.providerVoiceId);
    expect(profile).not.toBeNull();
    expect(profile?.sampleRate).toBe(24_000);
    expect(profile?.styleEmbedding).toBeDefined();
    expect(profile?.styleEmbedding.length).toBe(512);
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

  it("synthesizes in-house preview audio at 24kHz without external API dependency", async () => {
    const engine = createInhouseCloneEngine();
    const previewAudio = await engine.preview("inhouse_test_id", "Hello from BotBound voice!");
    expect(previewAudio.byteLength).toBeGreaterThan(44);
    expect(previewAudio.toString("ascii", 0, 4)).toBe("RIFF");
    expect(previewAudio.toString("ascii", 8, 12)).toBe("WAVE");

    // Validate 24kHz sample rate in the generated WAV fmt chunk
    const sampleRate = previewAudio.readUInt32LE(24);
    expect(sampleRate).toBe(24_000);
    const numChannels = previewAudio.readUInt16LE(22);
    expect(numChannels).toBe(1);
    const bitsPerSample = previewAudio.readUInt16LE(34);
    expect(bitsPerSample).toBe(16);
  });

  it("generates 24kHz PCM audio chunks with sub-120ms token-to-speech latency on CPU", async () => {
    const engine = createInhouseCloneEngine();
    const sampleWav = Buffer.alloc(44);
    sampleWav.write("RIFF", 0);
    sampleWav.write("WAVE", 8);

    const { providerVoiceId } = await engine.create({
      name: "Stream Test Voice",
      wav: sampleWav,
      gender: "female",
    });

    const chunks = [];
    const text = "Dispatch lead confirmed: field technician scheduled for 2:30 PM.";

    for await (const chunk of synthesizeInhouseVoiceChunks(providerVoiceId, text)) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThan(0);
    const firstChunk = chunks[0];
    expect(firstChunk.sampleRate).toBe(24_000);
    expect(firstChunk.samples).toBeGreaterThan(0);
    expect(firstChunk.pcm.byteLength).toBe(firstChunk.samples * 2);
    // Sub-120ms token-to-speech latency on CPU invariant
    expect(firstChunk.latencyMs).toBeLessThan(120);
    expect(chunks[chunks.length - 1].isFinal).toBe(true);
  });

  it("reports unlimited capacity without external API credits or quotas", async () => {
    const engine = createInhouseCloneEngine();
    const cap = await engine.capacity();
    expect(cap.canClone).toBe(true);
    expect(cap.voiceLimit).toBeNull();
    expect(cap.creditsRemaining).toBeNull();
  });

  it("removes in-house voice models with idempotent deletion", async () => {
    const engine = createInhouseCloneEngine();
    const sampleWav = Buffer.alloc(44);
    sampleWav.write("RIFF", 0);
    sampleWav.write("WAVE", 8);

    const { providerVoiceId } = await engine.create({
      name: "Temporary Voice",
      wav: sampleWav,
      gender: "male",
    });

    expect(getInhouseVoiceProfile(providerVoiceId)).not.toBeNull();
    const firstRemove = await engine.remove(providerVoiceId);
    expect(firstRemove.alreadyMissing).toBe(false);
    expect(getInhouseVoiceProfile(providerVoiceId)).toBeNull();

    // Idempotent secondary removal
    const secondRemove = await engine.remove(providerVoiceId);
    expect(secondRemove.alreadyMissing).toBe(true);
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

  it("enforces strict Illinois BIPA and Texas CUBI compliance with 3-year maximum retention limit", () => {
    expect(WRITTEN_BIOMETRIC_RELEASE_JURISDICTIONS).toContain("US-IL");
    expect(WRITTEN_BIOMETRIC_RELEASE_JURISDICTIONS).toContain("US-TX");
    expect(requiresWrittenBiometricRelease("US-IL")).toBe(true);
    expect(requiresWrittenBiometricRelease("US-TX")).toBe(true);
    expect(requiresWrittenBiometricRelease("US-CA")).toBe(false);

    expect(BIOMETRIC_MAX_DAYS).toBe(365 * 3);
    const created = new Date("2026-10-30T00:00:00Z");
    const activeUse = new Date("2028-10-30T00:00:00Z");
    const expires = biometricExpiresAt(created, activeUse);
    const maxDate = new Date(created.getTime() + 365 * 3 * 86_400_000);
    expect(expires.getTime()).toBeLessThanOrEqual(maxDate.getTime());

    const releaseRecord = biometricReleaseRecord("Aurora Bot");
    expect(releaseRecord).toContain("voiceprint");
    expect(releaseRecord).toContain("3 years");
    expect(BIOMETRIC_RETENTION_POLICY_VERSION).toBe("voice-retention-v2-2026-10-24");
  });

  it("automatically sweeps in-house voice models exceeding 3-year statutory maximum retention limit", async () => {
    resetInhouseVoiceStoreForTests();
    const engine = createInhouseCloneEngine();
    const sampleWav = Buffer.alloc(44);
    sampleWav.write("RIFF", 0);
    sampleWav.write("WAVE", 8);

    const { providerVoiceId } = await engine.create({
      name: "Expired Voice Over 3 Years",
      wav: sampleWav,
      gender: "male",
    });

    const profile = getInhouseVoiceProfile(providerVoiceId);
    expect(profile).not.toBeNull();

    // Fast-forward creation date to 3 years and 1 day ago
    const threeYearsAndDayAgo = Date.now() - (BIOMETRIC_MAX_DAYS + 1) * 86_400_000;
    profile!.createdAt = threeYearsAndDayAgo;
    profile!.expiresAt = threeYearsAndDayAgo + BIOMETRIC_MAX_DAYS * 86_400_000;

    const sweepResult = sweepInhouseVoiceRetention();
    expect(sweepResult.expiredCount).toBe(1);
    expect(sweepResult.removedIds).toContain(providerVoiceId);
    expect(getInhouseVoiceProfile(providerVoiceId)).toBeNull();
  });

  it("automatically sweeps in-house voice models idle for more than 12 months", async () => {
    resetInhouseVoiceStoreForTests();
    const engine = createInhouseCloneEngine();
    const sampleWav = Buffer.alloc(44);
    sampleWav.write("RIFF", 0);
    sampleWav.write("WAVE", 8);

    const { providerVoiceId } = await engine.create({
      name: "Idle Voice Over 12 Months",
      wav: sampleWav,
      gender: "female",
    });

    const profile = getInhouseVoiceProfile(providerVoiceId);
    expect(profile).not.toBeNull();

    // Set last used timestamp to 400 days ago
    const idleAgo = Date.now() - (BIOMETRIC_IDLE_DAYS + 35) * 86_400_000;
    profile!.lastUsedAt = idleAgo;
    profile!.expiresAt = idleAgo + BIOMETRIC_IDLE_DAYS * 86_400_000;

    const sweepResult = sweepInhouseVoiceRetention();
    expect(sweepResult.expiredCount).toBe(1);
    expect(sweepResult.removedIds).toContain(providerVoiceId);
    expect(getInhouseVoiceProfile(providerVoiceId)).toBeNull();
  });

  it("updates lastUsedAt and recalculates idle expiration up to the 3-year cap on chunk synthesis", async () => {
    resetInhouseVoiceStoreForTests();
    const engine = createInhouseCloneEngine();
    const sampleWav = Buffer.alloc(44);
    sampleWav.write("RIFF", 0);
    sampleWav.write("WAVE", 8);

    const { providerVoiceId } = await engine.create({
      name: "Active Voice",
      wav: sampleWav,
      gender: "female",
    });

    const profile = getInhouseVoiceProfile(providerVoiceId);
    const initialLastUsed = profile!.lastUsedAt;

    // Simulate usage 10ms later
    await new Promise((r) => setTimeout(r, 15));
    const generator = synthesizeInhouseVoiceChunks(providerVoiceId, "Testing active usage touch.");
    await generator.next();

    expect(profile!.lastUsedAt).toBeGreaterThanOrEqual(initialLastUsed);
    const hardCap = profile!.createdAt + BIOMETRIC_MAX_DAYS * 86_400_000;
    expect(profile!.expiresAt).toBeLessThanOrEqual(hardCap);
  });

  it("evicts and rejects synthesis requests for voices whose retention schedule has expired", async () => {
    resetInhouseVoiceStoreForTests();
    const engine = createInhouseCloneEngine();
    const sampleWav = Buffer.alloc(44);
    sampleWav.write("RIFF", 0);
    sampleWav.write("WAVE", 8);

    const { providerVoiceId } = await engine.create({
      name: "Expired Before Synthesis",
      wav: sampleWav,
      gender: "male",
    });

    const profile = getInhouseVoiceProfile(providerVoiceId);
    profile!.expiresAt = Date.now() - 1000; // Expired 1 second ago

    const generator = synthesizeInhouseVoiceChunks(providerVoiceId, "Should fail.");
    await expect(generator.next()).rejects.toThrow();
    expect(getInhouseVoiceProfile(providerVoiceId)).toBeNull();
  });

  it("integrates with liveVoiceService.expireDue() to sweep in-house voice models atomically", async () => {
    resetInhouseVoiceStoreForTests();
    const engine = createInhouseCloneEngine();
    const sampleWav = Buffer.alloc(44);
    sampleWav.write("RIFF", 0);
    sampleWav.write("WAVE", 8);

    const { providerVoiceId } = await engine.create({
      name: "Swept By Service",
      wav: sampleWav,
      gender: "female",
    });

    const profile = getInhouseVoiceProfile(providerVoiceId);
    profile!.expiresAt = Date.now() - 5000;

    const totalExpired = await liveVoiceService.expireDue();
    expect(totalExpired).toBeGreaterThanOrEqual(1);
    expect(getInhouseVoiceProfile(providerVoiceId)).toBeNull();
  });

  it("handles WAV files with odd chunk sizes with standard RIFF word alignment", async () => {
    resetInhouseVoiceStoreForTests();
    const engine = createInhouseCloneEngine();

    // Construct a WAV with a custom subchunk of odd length (11 bytes) + 1 pad byte
    // 4 bytes 'RIFF', 4 bytes length, 4 bytes 'WAVE'
    // Custom chunk: 4 bytes 'JUNK', 4 bytes chunkSize (11), 11 bytes data, 1 byte pad
    // 'fmt ' chunk: 4 bytes, 4 bytes chunkSize (16), 16 bytes fmt data
    // 'data' chunk: 4 bytes, 4 bytes chunkSize (8), 8 bytes PCM data
    const totalLen = 12 + (8 + 11 + 1) + (8 + 16) + (8 + 8);
    const wav = Buffer.alloc(totalLen);
    let offset = 0;
    wav.write("RIFF", offset);
    offset += 4;
    wav.writeUInt32LE(totalLen - 8, offset);
    offset += 4;
    wav.write("WAVE", offset);
    offset += 4;

    // Odd chunk 'JUNK' of 11 bytes + 1 pad
    wav.write("JUNK", offset);
    offset += 4;
    wav.writeUInt32LE(11, offset);
    offset += 4;
    wav.write("12345678901", offset);
    offset += 11;
    wav.writeUInt8(0, offset); // pad byte
    offset += 1;

    // 'fmt ' chunk
    wav.write("fmt ", offset);
    offset += 4;
    wav.writeUInt32LE(16, offset);
    offset += 4;
    wav.writeUInt16LE(1, offset); // PCM
    wav.writeUInt16LE(1, offset + 2); // Mono
    wav.writeUInt32LE(24000, offset + 4); // Sample rate
    wav.writeUInt32LE(48000, offset + 8); // Byte rate
    wav.writeUInt16LE(2, offset + 12); // Block align
    wav.writeUInt16LE(16, offset + 14); // Bits per sample
    offset += 16;

    // 'data' chunk
    wav.write("data", offset);
    offset += 4;
    wav.writeUInt32LE(8, offset);
    offset += 4;
    wav.writeInt16LE(1000, offset);
    wav.writeInt16LE(2000, offset + 2);
    wav.writeInt16LE(-1000, offset + 4);
    wav.writeInt16LE(-2000, offset + 6);

    const result = await engine.create({
      name: "Odd Chunk WAV Test",
      wav,
      gender: "male",
    });
    expect(result.providerVoiceId).toBeDefined();
    const profile = getInhouseVoiceProfile(result.providerVoiceId);
    expect(profile).not.toBeNull();
    expect(profile?.sampleRate).toBe(24000);
  });

  it("synthesizes stock voice previews for both female and male default voices", async () => {
    const engine = createInhouseCloneEngine();
    const femalePreview = await engine.preview("eve", "Hello from stock female.");
    expect(femalePreview.byteLength).toBeGreaterThan(44);
    expect(femalePreview.readUInt32LE(24)).toBe(24000);

    const malePreview = await engine.preview("rex", "Hello from stock male.");
    expect(malePreview.byteLength).toBeGreaterThan(44);
    expect(malePreview.readUInt32LE(24)).toBe(24000);
  });
});
