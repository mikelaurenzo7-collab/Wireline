import { afterEach, describe, expect, it } from "vitest";

import { AppError } from "../src/lib/api-error";
import {
  generateCuratedVoicePreview,
  CURATED_VOICE_PREVIEW_TEXT,
} from "../src/lib/voice/voice-preview-service";

const originalXaiKey = process.env.XAI_API_KEY;

afterEach(() => {
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

  it("does not fake Vapi voices with another provider", async () => {
    await expect(generateCuratedVoicePreview("vapi", "Elliot")).rejects.toMatchObject({
      status: 404,
      message: "Hear this voice during a phone test.",
    });
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
