import { describe, expect, it } from "vitest";
import {
  LIVEAVATAR_PCM_RATE_HZ,
  upsamplePcm16Le,
  VAPI_LISTEN_PCM_RATE_HZ,
  vapiListenPcmToLiveAvatarBase64,
} from "../src/lib/voice/pcm-resample";

describe("pcm resample", () => {
  it("upsamples 8 kHz PCM to 24 kHz (3× samples)", () => {
    const input = new Int16Array(800);
    for (let i = 0; i < input.length; i += 1) input[i] = i % 256;
    const bytes = new Uint8Array(input.buffer);
    const out = upsamplePcm16Le(bytes, VAPI_LISTEN_PCM_RATE_HZ, LIVEAVATAR_PCM_RATE_HZ);
    expect(out.length / 2).toBe(2_400);
  });

  it("returns base64 for LiveAvatar feedPcmDelta", () => {
    const pcm = new Int16Array(160);
    pcm.fill(512);
    const b64 = vapiListenPcmToLiveAvatarBase64(pcm.buffer);
    expect(b64.length).toBeGreaterThan(0);
    expect(atob(b64).length).toBeGreaterThan(pcm.byteLength);
  });

  it("passes through when rates match", () => {
    const bytes = new Uint8Array([0, 1, 2, 3]);
    const out = upsamplePcm16Le(bytes, LIVEAVATAR_PCM_RATE_HZ, LIVEAVATAR_PCM_RATE_HZ);
    expect(out).toBe(bytes);
  });
});
