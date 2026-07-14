import { afterEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../src/lib/api-error";
import {
  curatedVoicePreviewContentType,
  generateCuratedVoicePreview,
  CURATED_VOICE_PREVIEW_TEXT,
} from "../src/lib/voice/voice-preview-service";

const originalXaiKey = process.env.XAI_API_KEY;

afterEach(() => {
  vi.useRealTimers();
  if (originalXaiKey === undefined) delete process.env.XAI_API_KEY;
  else process.env.XAI_API_KEY = originalXaiKey;
});

describe("curated voice previews", () => {
  it("uses native xAI TTS with the exact selected voice", async () => {
    process.env.XAI_API_KEY = "test-xai-key";
    let request: { input?: string; init?: RequestInit } = {};
    const audioBytes = new Uint8Array([73, 68, 51, 4]);

    const result = await generateCuratedVoicePreview("xai", "eve", async (input, init) => {
      request = { input: String(input), init };
      return new Response(audioBytes, {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      });
    });

    expect(request.input).toBe("https://api.x.ai/v1/tts");
    expect(request.init?.method).toBe("POST");
    expect(request.init?.headers).toMatchObject({
      Authorization: "Bearer test-xai-key",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(request.init?.body))).toEqual({
      text: CURATED_VOICE_PREVIEW_TEXT.replace("{name}", "Eve"),
      voice_id: "eve",
      language: "en",
    });
    expect([...new Uint8Array(result)]).toEqual([...audioBytes]);
  });

  it("proxies the exact pinned WAV published on Vapi's official docs", async () => {
    let request: { input?: string; init?: RequestInit } = {};
    const waveBytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x04, 0, 0, 0, 0x57, 0x41, 0x56, 0x45,
    ]);

    const result = await generateCuratedVoicePreview("vapi", "savannah", async (input, init) => {
      request = { input: String(input), init };
      return new Response(waveBytes, {
        status: 200,
        headers: {
          "Content-Type": "audio/wave",
          "Content-Length": String(waveBytes.byteLength),
        },
      });
    });

    expect(request.input).toBe(
      "https://files.buildwithfern.com/vapi.docs.buildwithfern.com/2e546c5711500d4c0548915e43f77c45895ea42d618e3b09ac8ee58856e6dae9/static/audio/savannah-sample.wav",
    );
    expect(request.init).toMatchObject({ method: "GET", redirect: "error" });
    expect(request.init?.signal).toBeInstanceOf(AbortSignal);
    expect(curatedVoicePreviewContentType("vapi")).toBe("audio/wave");
    expect(curatedVoicePreviewContentType("xai")).toBe("audio/mpeg");
    expect([...new Uint8Array(result)]).toEqual([...waveBytes]);
  });

  it("rejects voices without an official pinned sample", async () => {
    await expect(generateCuratedVoicePreview("vapi", "Rohan")).rejects.toMatchObject({
      status: 404,
      message: "Voice preview not available for this selection.",
    });
  });

  it("validates the Vapi response type, size, and WAV signature", async () => {
    const html = generateCuratedVoicePreview(
      "vapi",
      "Elliot",
      async () => new Response("not audio", { headers: { "Content-Type": "text/html" } }),
    );
    await expect(html).rejects.toMatchObject({ status: 503 });

    const oversized = generateCuratedVoicePreview(
      "vapi",
      "Elliot",
      async () =>
        new Response(new Uint8Array([0x52, 0x49, 0x46, 0x46]), {
          headers: {
            "Content-Type": "audio/wave",
            "Content-Length": String(9 * 1024 * 1024),
          },
        }),
    );
    await expect(oversized).rejects.toMatchObject({ status: 503 });

    const invalidWave = generateCuratedVoicePreview(
      "vapi",
      "Elliot",
      async () => new Response(new Uint8Array(24), { headers: { "Content-Type": "audio/wave" } }),
    );
    await expect(invalidWave).rejects.toMatchObject({ status: 503 });
  });

  it("aborts a stalled official sample request after the preview timeout", async () => {
    vi.useFakeTimers();
    const preview = generateCuratedVoicePreview("vapi", "Elliot", async (_input, init) => {
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });
    const rejection = expect(preview).rejects.toMatchObject({ status: 503 });

    await vi.advanceTimersByTimeAsync(15_000);
    await rejection;
  });

  it("fails safely for unknown voices, missing configuration, and provider errors", async () => {
    process.env.XAI_API_KEY = "test-xai-key";
    await expect(generateCuratedVoicePreview("xai", "unknown")).rejects.toMatchObject({
      status: 404,
    });

    delete process.env.XAI_API_KEY;
    await expect(generateCuratedVoicePreview("xai", "eve")).rejects.toMatchObject({ status: 503 });

    process.env.XAI_API_KEY = "test-xai-key";
    const rejection = generateCuratedVoicePreview(
      "xai",
      "eve",
      async () => new Response("rate limited", { status: 429 }),
    );
    await expect(rejection).rejects.toBeInstanceOf(AppError);
    await expect(rejection).rejects.toMatchObject({ status: 503 });
  });
});
