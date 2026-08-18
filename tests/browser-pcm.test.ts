import { describe, expect, it } from "vitest";

import {
  XAI_BROWSER_PCM_CHUNK_SAMPLES,
  XAI_BROWSER_PCM_RATE_HZ,
  XAIStreamingPcmEncoder,
  base64Pcm16LeToFloat32,
} from "../src/lib/voice/browser-pcm";

function feedInBrowserCallbacks(
  encoder: XAIStreamingPcmEncoder,
  samples: Float32Array,
  callbackSize = 4_096,
): string[] {
  const chunks: string[] = [];
  for (let offset = 0; offset < samples.length; offset += callbackSize) {
    chunks.push(...encoder.push(samples.subarray(offset, offset + callbackSize)));
  }
  return chunks;
}

describe("xAI browser PCM encoder", () => {
  it("resamples 48 kHz browser capture into exact 100 ms 24 kHz PCM16 chunks", () => {
    const encoder = new XAIStreamingPcmEncoder({ sourceRateHz: 48_000 });
    const source = new Float32Array(48_002).fill(0.5);
    const chunks = feedInBrowserCallbacks(encoder, source);

    expect(chunks).toHaveLength(10);
    for (const chunk of chunks) {
      const decoded = base64Pcm16LeToFloat32(chunk);
      expect(decoded).toHaveLength(XAI_BROWSER_PCM_CHUNK_SAMPLES);
      expect(decoded[0]).toBeCloseTo(0.5, 3);
      expect(decoded.at(-1)).toBeCloseTo(0.5, 3);
    }
  });

  it("preserves fractional resampling state across 44.1 kHz callback boundaries", () => {
    const encoder = new XAIStreamingPcmEncoder({ sourceRateHz: 44_100 });
    const source = new Float32Array(44_102);
    for (let index = 0; index < source.length; index += 1) {
      source[index] = Math.sin((2 * Math.PI * 440 * index) / 44_100) * 0.25;
    }

    const chunks = feedInBrowserCallbacks(encoder, source, 1_337);
    expect(chunks).toHaveLength(10);
    expect(chunks.every((chunk) => base64Pcm16LeToFloat32(chunk).length === 2_400)).toBe(
      true,
    );
  });

  it("chunks native 24 kHz capture without changing the declared output rate", () => {
    const encoder = new XAIStreamingPcmEncoder({ sourceRateHz: XAI_BROWSER_PCM_RATE_HZ });
    const source = new Float32Array(XAI_BROWSER_PCM_CHUNK_SAMPLES * 2).fill(-0.25);
    const chunks = feedInBrowserCallbacks(encoder, source, 777);

    expect(chunks).toHaveLength(2);
    expect(base64Pcm16LeToFloat32(chunks[0]!)[100]).toBeCloseTo(-0.25, 3);
  });

  it("resets buffered samples between browser sessions", () => {
    const encoder = new XAIStreamingPcmEncoder({ sourceRateHz: 48_000 });
    expect(encoder.push(new Float32Array(2_000))).toEqual([]);
    encoder.reset();
    expect(encoder.push(new Float32Array(4_802))).toHaveLength(1);
  });
});
