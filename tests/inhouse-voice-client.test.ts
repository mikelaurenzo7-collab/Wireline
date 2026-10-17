import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createInhouseVoiceClient,
  INHOUSE_VOICE_ENGINE,
  INHOUSE_VOICE_MODEL_REVISION,
  INHOUSE_VOICE_PREVIEW_TEXT,
  INHOUSE_VOICE_SOURCE_REVISION,
  InhouseVoiceError,
} from "../src/lib/voice/inhouse-voice-client";

const TOKEN = "dedicated-test-token-not-a-production-secret";
function wav(seconds = 1, rate = 24_000): Uint8Array<ArrayBuffer> {
  const dataBytes = seconds * rate * 2;
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);
  for (const [offset, value] of [
    [0, "RIFF"],
    [8, "WAVE"],
    [12, "fmt "],
    [36, "data"],
  ] as const) {
    for (let index = 0; index < value.length; index++)
      bytes[offset + index] = value.charCodeAt(index);
  }
  view.setUint32(4, bytes.length - 8, true);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(40, dataBytes, true);
  return bytes;
}
function audio(bytes = wav(), extra: Record<string, string> = {}) {
  return new Response(bytes, {
    headers: {
      "content-type": "audio/wav",
      "x-voice-engine": INHOUSE_VOICE_ENGINE,
      "x-voice-model-revision": INHOUSE_VOICE_MODEL_REVISION,
      "x-voice-source-revision": INHOUSE_VOICE_SOURCE_REVISION,
      ...extra,
    },
  });
}
function ready(overrides: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      ready: true,
      engine: INHOUSE_VOICE_ENGINE,
      modelRevision: INHOUSE_VOICE_MODEL_REVISION,
      sourceRevision: INHOUSE_VOICE_SOURCE_REVISION,
      device: "cpu",
      watermarkReady: true,
      maxTextCharacters: 1_000,
      maxReferenceBytes: 2_000_000,
      maxOutputSeconds: 60,
      inferenceTimeoutSeconds: 60,
      busy: false,
      ...overrides,
    }),
  );
}
function setup(response = audio(), options: { timeoutMs?: number } = {}) {
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response);
  const client = createInhouseVoiceClient({
    baseUrl: "https://voice.internal",
    serviceToken: TOKEN,
    fetchImpl,
    ...options,
  });
  return { client, fetchImpl };
}
afterEach(() => vi.useRealTimers());

describe("in-house speech transport", () => {
  it("generates bounded audio with a transient validated reference and dedicated server credential", async () => {
    const { client, fetchImpl } = setup();
    const referenceAudio = wav(6, 16_000);
    const result = await client.synthesizeSpeech({
      text: "  Welcome to BotBound.  ",
      referenceAudio,
    });
    expect(result).toMatchObject({
      durationSeconds: 1,
      engine: INHOUSE_VOICE_ENGINE,
      modelRevision: INHOUSE_VOICE_MODEL_REVISION,
      contentType: "audio/wav",
    });
    expect(result.bytes).toEqual(wav());
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://voice.internal/v1/speech");
    expect(init).toMatchObject({
      method: "POST",
      redirect: "error",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
        Accept: "audio/wav",
      },
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      text: "Welcome to BotBound.",
      referenceAudioBase64: Buffer.from(referenceAudio).toString("base64"),
    });
  });

  it("uses a fixed preview script without asking the browser to select a model", async () => {
    const { client, fetchImpl } = setup();
    await client.synthesizePreview();
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toEqual({
      text: INHOUSE_VOICE_PREVIEW_TEXT,
    });
  });

  it("checks exact model, source, watermark and limits before reporting ready", async () => {
    const { client, fetchImpl } = setup(ready());
    await expect(client.getReadiness()).resolves.toEqual({
      ready: true,
      busy: false,
      engine: INHOUSE_VOICE_ENGINE,
      modelRevision: INHOUSE_VOICE_MODEL_REVISION,
      sourceRevision: INHOUSE_VOICE_SOURCE_REVISION,
      device: "cpu",
    });
    expect(fetchImpl.mock.calls[0][0]).toBe("https://voice.internal/readyz");
  });

  it.each([
    { ready: false },
    { engine: "different" },
    { modelRevision: "moving-head" },
    { sourceRevision: "different-source" },
    { watermarkReady: false },
    { maxTextCharacters: 10_000 },
    { maxReferenceBytes: 9_000_000 },
    { maxOutputSeconds: 600 },
    { inferenceTimeoutSeconds: 180 },
    { inferenceTimeoutSeconds: undefined },
    { busy: "false" },
    { device: "unknown" },
  ])("refuses readiness drift: %j", async (overrides) => {
    const { client } = setup(ready(overrides));
    await expect(client.getReadiness()).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      workMayHaveStarted: false,
    });
  });

  it.each([
    "https://name:secret@voice.internal",
    "https://voice.internal/path",
    "https://voice.internal/?key=secret",
    "https://voice.internal/#secret",
    "http://public.example",
    "file:///tmp/voice",
    "not a URL",
  ])("rejects unsafe base %s", (baseUrl) => {
    expect(() => createInhouseVoiceClient({ baseUrl, serviceToken: TOKEN })).toThrow(
      InhouseVoiceError,
    );
  });

  it("requires an explicit private-network override for local development", async () => {
    expect(() =>
      createInhouseVoiceClient({ baseUrl: "http://127.0.0.1:8123", serviceToken: TOKEN }),
    ).toThrow(InhouseVoiceError);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(ready());
    const client = createInhouseVoiceClient({
      baseUrl: "http://127.0.0.1:8123",
      serviceToken: TOKEN,
      fetchImpl,
      allowInsecurePrivateNetwork: true,
    });
    await client.getReadiness();
    expect(fetchImpl.mock.calls[0][0]).toBe("http://127.0.0.1:8123/readyz");
    expect(() =>
      createInhouseVoiceClient({
        baseUrl: "http://external.example",
        serviceToken: TOKEN,
        allowInsecurePrivateNetwork: true,
      }),
    ).toThrow(InhouseVoiceError);
  });

  it.each([
    "",
    "short",
    "x".repeat(513),
    "x".repeat(32) + "\r\nprivate",
    "é".repeat(32),
    "x".repeat(32) + "\u0000",
  ])("rejects invalid credentials without exposing them", (serviceToken) => {
    expect(() =>
      createInhouseVoiceClient({ baseUrl: "https://voice.internal", serviceToken }),
    ).toThrow("The voice request is invalid.");
  });

  it.each([0, 99, 185_001, Number.NaN, 1.2])("rejects invalid deadline %s", (timeoutMs) => {
    expect(() =>
      createInhouseVoiceClient({
        baseUrl: "https://voice.internal",
        serviceToken: TOKEN,
        timeoutMs,
      }),
    ).toThrow(InhouseVoiceError);
  });

  it.each(["", "  ", "x".repeat(1_001), "\0private", "\u0001private"])(
    "rejects invalid text before any compute",
    async (text) => {
      const { client, fetchImpl } = setup();
      await expect(client.synthesizeSpeech({ text })).rejects.toMatchObject({
        code: "INVALID_INPUT",
        workMayHaveStarted: false,
      });
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it.each([wav(5, 16_000), new Uint8Array(30), new Uint8Array(2_000_001)])(
    "rejects invalid reference before transmission",
    async (referenceAudio) => {
      const { client, fetchImpl } = setup();
      await expect(client.synthesizePreview(referenceAudio)).rejects.toMatchObject({
        code: "INVALID_INPUT",
        workMayHaveStarted: false,
      });
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it.each([
    { "content-type": "text/html" },
    { "x-voice-engine": "other" },
    { "x-voice-model-revision": "other" },
    { "x-voice-source-revision": "other" },
  ] as Array<Record<string, string>>)("refuses mismatched speech metadata %j", async (headers) => {
    const { client } = setup(audio(wav(), headers));
    await expect(client.synthesizePreview()).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      workMayHaveStarted: true,
    });
  });

  it.each([wav(1, 16_000), new Uint8Array(44), wav(61)])(
    "refuses invalid or excessive generated audio",
    async (bytes) => {
      const { client } = setup(audio(bytes));
      await expect(client.synthesizePreview()).rejects.toMatchObject({
        code: "INVALID_RESPONSE",
        workMayHaveStarted: true,
      });
    },
  );

  it("refuses advertised oversize even when an audio prefix looks valid", async () => {
    const { client } = setup(audio(wav(), { "content-length": "3000000" }));
    await expect(client.synthesizePreview()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it.each([400, 401, 403, 404, 413])(
    "treats worker rejection %s as no admitted compute",
    async (status) => {
      const { client, fetchImpl } = setup(new Response(TOKEN, { status }));
      await expect(client.synthesizePreview()).rejects.toMatchObject({
        code: "REJECTED",
        workMayHaveStarted: false,
        status,
      });
      expect(fetchImpl).toHaveBeenCalledOnce();
    },
  );

  it("never retries a busy worker automatically", async () => {
    const { client, fetchImpl } = setup(new Response("busy", { status: 429 }));
    await expect(client.synthesizePreview()).rejects.toMatchObject({
      code: "BUSY",
      workMayHaveStarted: false,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("retains consumed compute when inference returns invalid model output", async () => {
    const { client, fetchImpl } = setup(
      new Response('{"error":{"code":"invalid_model_output"}}', { status: 422 }),
    );
    await expect(client.synthesizePreview()).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      workMayHaveStarted: true,
      status: 422,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it.each([302, 500, 503, 504])("preserves uncertain work for worker status %s", async (status) => {
    const { client, fetchImpl } = setup(new Response(TOKEN, { status }));
    await expect(client.synthesizePreview()).rejects.toMatchObject({
      code: "UNAVAILABLE",
      workMayHaveStarted: true,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("sanitizes network errors and does not retry", async () => {
    const { client, fetchImpl } = setup();
    fetchImpl.mockRejectedValue(new Error(`internal credentials ${TOKEN}`));
    const error = await client.synthesizePreview().catch((value: unknown) => value);
    expect(error).toBeInstanceOf(InhouseVoiceError);
    expect(JSON.stringify(error)).not.toContain(TOKEN);
    expect(String(error)).not.toContain(TOKEN);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("does not start work for an already cancelled request", async () => {
    const { client, fetchImpl } = setup();
    const controller = new AbortController();
    controller.abort();
    await expect(
      client.synthesizePreview(undefined, { signal: controller.signal }),
    ).rejects.toMatchObject({ code: "ABORTED", workMayHaveStarted: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("bounds a stalled fetch even when a transport ignores its abort signal", async () => {
    vi.useFakeTimers();
    const { client, fetchImpl } = setup(audio(), { timeoutMs: 100 });
    fetchImpl.mockImplementation(() => new Promise(() => undefined));
    const result = client.synthesizePreview().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(101);
    expect(await result).toMatchObject({ code: "ABORTED", workMayHaveStarted: true });
  });

  it("bounds a stalled body after the engine accepts work", async () => {
    vi.useFakeTimers();
    const response = new Response(
      new ReadableStream({
        start() {
          /* Intentional stalled fixture. */
        },
      }),
      {
        headers: {
          "content-type": "audio/wav",
          "x-voice-engine": INHOUSE_VOICE_ENGINE,
          "x-voice-model-revision": INHOUSE_VOICE_MODEL_REVISION,
          "x-voice-source-revision": INHOUSE_VOICE_SOURCE_REVISION,
        },
      },
    );
    const { client } = setup(response, { timeoutMs: 100 });
    const result = client.synthesizePreview().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(101);
    expect(await result).toMatchObject({ code: "ABORTED", workMayHaveStarted: true });
  });
});
