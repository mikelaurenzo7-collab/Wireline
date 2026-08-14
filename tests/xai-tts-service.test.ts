import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AppError } from "../src/lib/api-error";
import {
  XAI_BUILTIN_VOICES,
  XAI_LIPSYNC_SAMPLE_RATE,
  XAI_TTS_MAX_CHARACTERS,
  buildXaiSpeechBody,
  isXaiBuiltinVoiceId,
  listXaiVoices,
  resetXaiVoiceRosterCache,
  synthesizeXaiSpeech,
  xaiTtsConfigured,
} from "../src/lib/voice/xai-tts-service";

const originalKey = process.env.XAI_API_KEY;

beforeEach(() => {
  process.env.XAI_API_KEY = "test-xai-key";
  resetXaiVoiceRosterCache();
});

afterEach(() => {
  if (originalKey === undefined) delete process.env.XAI_API_KEY;
  else process.env.XAI_API_KEY = originalKey;
  resetXaiVoiceRosterCache();
});

describe("xAI TTS request body", () => {
  it("sends only the documented minimal fields by default", () => {
    expect(buildXaiSpeechBody({ text: "Hello", voiceId: "eve" })).toEqual({
      text: "Hello",
      voice_id: "eve",
      language: "en",
    });
  });

  it("nests output_format as the documented object, not a flat string", () => {
    const body = buildXaiSpeechBody({
      text: "Hello",
      voiceId: "ara",
      outputFormat: { codec: "pcm", sampleRate: XAI_LIPSYNC_SAMPLE_RATE },
    });
    expect(body.output_format).toEqual({ codec: "pcm", sample_rate: 24_000 });
  });

  it("carries mp3 bit rate only when asked", () => {
    expect(
      buildXaiSpeechBody({
        text: "Hello",
        voiceId: "eve",
        outputFormat: { codec: "mp3", sampleRate: 44_100, bitRate: 128_000 },
      }).output_format,
    ).toEqual({ codec: "mp3", sample_rate: 44_100, bit_rate: 128_000 });
  });

  it("omits sample rate and bit rate when unset so provider defaults apply", () => {
    expect(
      buildXaiSpeechBody({ text: "Hi", voiceId: "eve", outputFormat: { codec: "wav" } })
        .output_format,
    ).toEqual({ codec: "wav" });
  });

  it("clamps speed into a narration band", () => {
    expect(buildXaiSpeechBody({ text: "Hi", voiceId: "eve", speed: 9 }).speed).toBe(1.5);
    expect(buildXaiSpeechBody({ text: "Hi", voiceId: "eve", speed: 0.1 }).speed).toBe(0.7);
    expect(buildXaiSpeechBody({ text: "Hi", voiceId: "eve", speed: 1.07 }).speed).toBe(1.07);
  });

  it("drops a non-finite speed rather than sending NaN", () => {
    expect(
      buildXaiSpeechBody({ text: "Hi", voiceId: "eve", speed: Number.NaN }).speed,
    ).toBeUndefined();
  });

  it("uses the documented string form for the latency switch", () => {
    expect(
      buildXaiSpeechBody({ text: "Hi", voiceId: "eve", optimizeStreamingLatency: true })
        .optimize_streaming_latency,
    ).toBe("1");
    expect(
      buildXaiSpeechBody({ text: "Hi", voiceId: "eve", optimizeStreamingLatency: false })
        .optimize_streaming_latency,
    ).toBeUndefined();
  });

  it("passes an explicit language through instead of forcing English", () => {
    expect(buildXaiSpeechBody({ text: "Hola", voiceId: "eve", language: "es-MX" }).language).toBe(
      "es-MX",
    );
    expect(buildXaiSpeechBody({ text: "Hi", voiceId: "eve", language: "auto" }).language).toBe(
      "auto",
    );
  });
});

describe("xAI TTS synthesis", () => {
  it("posts to the documented endpoint with the bearer credential", async () => {
    let seen: { url?: string; init?: RequestInit } = {};
    const result = await synthesizeXaiSpeech(
      { text: "Hello", voiceId: "eve" },
      async (url, init) => {
        seen = { url: String(url), init };
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      },
    );

    expect(seen.url).toBe("https://api.x.ai/v1/tts");
    expect(seen.init?.method).toBe("POST");
    expect(seen.init?.headers).toMatchObject({
      Authorization: "Bearer test-xai-key",
      Accept: "audio/mpeg",
    });
    expect(result.codec).toBe("mp3");
    expect(result.mimeType).toBe("audio/mpeg");
    expect(result.voiceId).toBe("eve");
  });

  it("asks for the matching Accept header per codec", async () => {
    let accept = "";
    await synthesizeXaiSpeech(
      { text: "Hello", voiceId: "eve", outputFormat: { codec: "pcm" } },
      async (_url, init) => {
        accept = (init?.headers as Record<string, string>).Accept;
        return new Response(new Uint8Array([1]), { status: 200 });
      },
    );
    expect(accept).toBe("audio/pcm");
  });

  it("normalizes the voice id so a picker value cannot miss on case", async () => {
    let body: Record<string, unknown> = {};
    await synthesizeXaiSpeech({ text: "Hello", voiceId: "  EVE  " }, async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return new Response(new Uint8Array([1]), { status: 200 });
    });
    expect(body.voice_id).toBe("eve");
  });

  it("rejects empty text, empty voice, and over-long copy before spending", async () => {
    let called = false;
    const spy = async () => {
      called = true;
      return new Response(new Uint8Array([1]), { status: 200 });
    };

    await expect(synthesizeXaiSpeech({ text: "   ", voiceId: "eve" }, spy)).rejects.toMatchObject({
      status: 400,
    });
    await expect(synthesizeXaiSpeech({ text: "Hi", voiceId: "  " }, spy)).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      synthesizeXaiSpeech({ text: "a".repeat(XAI_TTS_MAX_CHARACTERS + 1), voiceId: "eve" }, spy),
    ).rejects.toMatchObject({ status: 400 });
    expect(called).toBe(false);
  });

  it("reports 503 without a credential and never calls the provider", async () => {
    delete process.env.XAI_API_KEY;
    let called = false;
    await expect(
      synthesizeXaiSpeech({ text: "Hello", voiceId: "eve" }, async () => {
        called = true;
        return new Response(new Uint8Array([1]), { status: 200 });
      }),
    ).rejects.toMatchObject({ status: 503 });
    expect(called).toBe(false);
  });

  it("converts a provider rejection into a generic 503 without leaking the body", async () => {
    const rejection = synthesizeXaiSpeech(
      { text: "Hello", voiceId: "eve" },
      async () => new Response("quota exceeded for org acct_123", { status: 429 }),
    );
    await expect(rejection).rejects.toBeInstanceOf(AppError);
    await expect(rejection).rejects.toMatchObject({
      status: 503,
      message: "Voice rendering is temporarily unavailable.",
    });
  });

  it("treats empty provider audio as a failure rather than silent output", async () => {
    await expect(
      synthesizeXaiSpeech(
        { text: "Hello", voiceId: "eve" },
        async () => new Response(new Uint8Array([]), { status: 200 }),
      ),
    ).rejects.toMatchObject({ status: 503 });
  });

  it("converts a transport failure into a 503 instead of surfacing the raw error", async () => {
    await expect(
      synthesizeXaiSpeech({ text: "Hello", voiceId: "eve" }, async () => {
        throw new Error("ECONNRESET api.x.ai");
      }),
    ).rejects.toMatchObject({
      status: 503,
      message: "Voice rendering is temporarily unavailable.",
    });
  });
});

describe("xAI voice roster", () => {
  it("reports configuration from the credential", () => {
    expect(xaiTtsConfigured()).toBe(true);
    delete process.env.XAI_API_KEY;
    expect(xaiTtsConfigured()).toBe(false);
  });

  it("recognizes the built-in voice ids case-insensitively", () => {
    expect(isXaiBuiltinVoiceId("eve")).toBe(true);
    expect(isXaiBuiltinVoiceId(" LEO ")).toBe(true);
    expect(isXaiBuiltinVoiceId("nope")).toBe(false);
    expect(isXaiBuiltinVoiceId(42)).toBe(false);
  });

  it("returns the built-in roster without a credential and never calls out", async () => {
    delete process.env.XAI_API_KEY;
    let called = false;
    const voices = await listXaiVoices(async () => {
      called = true;
      return new Response("{}", { status: 200 });
    });
    expect(called).toBe(false);
    expect(voices.map((voice) => voice.id)).toEqual(XAI_BUILTIN_VOICES.map((voice) => voice.id));
  });

  it("prefers the live roster when the provider returns one", async () => {
    const voices = await listXaiVoices(
      async () =>
        new Response(JSON.stringify({ voices: [{ voice_id: "nova", name: "Nova" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    expect(voices).toEqual([{ id: "nova", name: "Nova", description: undefined }]);
  });

  it("degrades to the built-in roster when the catalog call fails", async () => {
    const voices = await listXaiVoices(async () => new Response("nope", { status: 500 }));
    expect(voices.map((voice) => voice.id)).toEqual(XAI_BUILTIN_VOICES.map((voice) => voice.id));
  });

  it("degrades to the built-in roster when the provider returns an empty list", async () => {
    const voices = await listXaiVoices(
      async () =>
        new Response(JSON.stringify({ voices: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    expect(voices.map((voice) => voice.id)).toEqual(XAI_BUILTIN_VOICES.map((voice) => voice.id));
  });

  it("caches a successful roster so auditioning does not re-bill the catalog call", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return new Response(JSON.stringify({ data: [{ id: "nova", name: "Nova" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    await listXaiVoices(fetchImpl);
    await listXaiVoices(fetchImpl);
    expect(calls).toBe(1);
  });
});
