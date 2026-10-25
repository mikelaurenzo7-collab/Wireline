import { describe, expect, it, vi } from "vitest";
import { PHONE_CATALOG_VOICE_KEY, catalogVoiceSelection } from "../src/lib/phone-voice-catalog";
import {
  boundedAudio,
  createPhoneCatalogService,
  parsePublicCatalog,
} from "../src/lib/voice/phone-catalog-service";
import { clonedSpeechStreams } from "../src/lib/voice/cloned-speech-stream";
import { catalogCallsConfigured } from "../src/lib/voice/cloned-media-config";

const publicVoice = {
  id: "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4",
  name: "Skylar",
  access: "public",
  status: "active",
  is_owner: false,
  language: "en",
  gender: "feminine",
};
const selection = { [PHONE_CATALOG_VOICE_KEY]: { id: publicVoice.id, provider: "cartesia" } };
const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });

describe("public phone catalog isolation", () => {
  it("rejects private, owned and inactive Cartesia voices even if a provider returns them", () => {
    const rows = [
      publicVoice,
      { ...publicVoice, id: "private-voice-id", access: "private" },
      { ...publicVoice, id: "owned-voice-id", is_owner: true },
      { ...publicVoice, id: "inactive-voice-id", status: "inactive" },
    ];
    expect(parsePublicCatalog("cartesia", { data: rows }).map((voice) => voice.id)).toEqual([
      publicVoice.id,
    ]);
  });
  it("never exposes ElevenLabs workspace clones or professional library voices with separate rates", () => {
    const rows = ["premade", "cloned", "professional", "generated"].map((category) => ({
      category,
      voice_id: `voice-${category}-12345`,
      name: category,
    }));
    expect(parsePublicCatalog("elevenlabs", { voices: rows }).map((voice) => voice.name)).toEqual([
      "premade",
    ]);
  });
  it("refuses malformed selections before making any provider request", async () => {
    const request = vi.fn();
    const service = createPhoneCatalogService({ CARTESIA_API_KEY: "test-key" }, request);
    for (const value of [
      null,
      [],
      { provider: "xai", id: publicVoice.id },
      { provider: "cartesia", id: "../../private" },
    ]) {
      expect(catalogVoiceSelection({ [PHONE_CATALOG_VOICE_KEY]: value })).toBeNull();
      expect(await service.resolve({ [PHONE_CATALOG_VOICE_KEY]: value })).toBeNull();
    }
    expect(request).not.toHaveBeenCalled();
  });
  it("checks only one selected voice on a cold worker, caches it, and rechecks after a key change", async () => {
    const request = vi.fn().mockImplementation(() => Promise.resolve(json(publicVoice)));
    const env = { CARTESIA_API_KEY: "first-test-key" };
    const service = createPhoneCatalogService(env, request);
    expect((await service.resolve(selection))?.name).toBe("Skylar");
    await service.resolve(selection);
    expect(request).toHaveBeenCalledTimes(1);
    expect(String(request.mock.calls[0][0])).toBe(
      `https://api.cartesia.ai/voices/${publicVoice.id}`,
    );
    env.CARTESIA_API_KEY = "second-test-key";
    await service.resolve(selection);
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("refuses a private voice requested directly by id", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(json({ ...publicVoice, access: "private", is_owner: true }));
    expect(
      await createPhoneCatalogService({ CARTESIA_API_KEY: "test-key" }, request).resolve(selection),
    ).toBeNull();
  });
  it("keeps the working catalog available when the other provider is down", async () => {
    const request = vi
      .fn()
      .mockImplementation((url: URL) =>
        String(url).includes("cartesia")
          ? Promise.resolve(json({ data: [publicVoice], has_more: false }))
          : Promise.reject(new Error("provider unavailable")),
      );
    const service = createPhoneCatalogService(
      { CARTESIA_API_KEY: "cartesia-test", ELEVENLABS_API_KEY: "eleven-test" },
      request,
    );
    const result = await service.all();
    expect(result.voices.map((voice) => voice.id)).toEqual([publicVoice.id]);
    expect(result.unavailable).toEqual(["elevenlabs"]);
    expect(JSON.stringify(result)).not.toContain("test");
  });
  it("bounds provider responses rather than buffering arbitrary audio", async () => {
    await expect(boundedAudio(new Response(new Uint8Array(12)), 10)).rejects.toThrow("limit");
    await expect(boundedAudio(new Response(new Uint8Array(0)))).rejects.toThrow("empty");
  });
});

describe("Cartesia phone audio", () => {
  it("requires reasoning, speech and a valid phone worker before claiming readiness", () => {
    const env = {
      OPENAI_API_KEY: "reasoning-test",
      CARTESIA_API_KEY: "speech-test",
      WIRELINE_VOICE_WORKER_URL: "https://voice.botbound.app",
    };
    expect(catalogCallsConfigured(env)).toBe(true);
    expect(catalogCallsConfigured({ ...env, OPENAI_API_KEY: "" })).toBe(false);
    expect(catalogCallsConfigured({ ...env, CARTESIA_API_KEY: "" })).toBe(false);
    expect(catalogCallsConfigured({ ...env, WIRELINE_VOICE_WORKER_URL: "invalid" })).toBe(false);
  });
  it("passes native 8 kHz mu-law bytes unchanged after spend admission", async () => {
    const request = vi.fn().mockResolvedValue(new Response(new Uint8Array([255, 127, 20, 42])));
    const reserve = vi.fn().mockResolvedValue(undefined);
    const stream = clonedSpeechStreams({
      voiceId: publicVoice.id,
      speechProvider: "cartesia",
      cartesiaKey: "test-key",
      elevenLabsKey: "",
      openAIKey: "fallback-test",
      stockVoice: "nova",
      fetchImpl: request,
      reserve,
    });
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream.cloneSpeech("Hello.", new AbortController().signal))
      chunks.push(chunk);
    expect([...Buffer.concat(chunks)]).toEqual([255, 127, 20, 42]);
    expect(reserve).toHaveBeenCalledWith("cartesia", "Hello.");
    expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({
      voice: publicVoice.id,
      output_format: { container: "raw", encoding: "pcm_mulaw", sample_rate: 8000 },
    });
  });
  it("never starts a paid provider request when spend admission fails", async () => {
    const request = vi.fn();
    const stream = clonedSpeechStreams({
      voiceId: publicVoice.id,
      speechProvider: "cartesia",
      cartesiaKey: "test-key",
      elevenLabsKey: "",
      openAIKey: "fallback-test",
      stockVoice: "nova",
      fetchImpl: request,
      reserve: async () => {
        throw new Error("spending limit");
      },
    });
    const collect = async () => {
      for await (const _chunk of stream.cloneSpeech("Hello.", new AbortController().signal)) {
        /* consume */
      }
    };
    await expect(collect()).rejects.toThrow("spending limit");
    expect(request).not.toHaveBeenCalled();
  });
});
