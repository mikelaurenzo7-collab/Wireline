/**
 * Browser-only helpers — decode MP3 samples into PCM16 LE @ 24 kHz for LiveAvatar LITE.
 */
import { LIVEAVATAR_PCM_RATE_HZ } from "./pcm-resample";

function mergeBase64Chunks(chunks: string[]): Uint8Array {
  const parts: Uint8Array[] = [];
  let total = 0;
  for (const chunk of chunks) {
    if (!chunk) continue;
    const binary = atob(chunk);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    parts.push(bytes);
    total += bytes.length;
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    merged.set(part, offset);
    offset += part.length;
  }
  return merged;
}

function resampleFloat32(input: Float32Array, inputRate: number, outputRate: number): Float32Array {
  if (inputRate === outputRate || input.length === 0) return input;
  const ratio = inputRate / outputRate;
  const outLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(outLength);
  for (let i = 0; i < outLength; i += 1) {
    const index = i * ratio;
    const left = Math.floor(index);
    const right = Math.min(left + 1, input.length - 1);
    const fraction = index - left;
    output[i] = (input[left] ?? 0) * (1 - fraction) + (input[right] ?? 0) * fraction;
  }
  return output;
}

function float32ToPcm16LeBinary(input: Float32Array): string {
  const pcm = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const value = Math.max(-1, Math.min(1, input[i] ?? 0));
    pcm[i] = value < 0 ? value * 0x8000 : value * 0x7fff;
  }
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return binary;
}

/** Decode base64 MP3 chunks into a PCM16 LE binary string for repeatAudio(). */
export async function mp3Base64ChunksToPcmBinary(chunks: string[]): Promise<string> {
  const bytes = mergeBase64Chunks(chunks);
  if (!bytes.length) {
    throw new Error("Voice sample did not include playable audio.");
  }

  const AudioContextCtor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) {
    throw new Error("This browser cannot decode voice samples for live presenter preview.");
  }

  const context = new AudioContextCtor();
  try {
    const copy = bytes.slice();
    const decoded = await context.decodeAudioData(copy.buffer);
    const channel = decoded.getChannelData(0);
    const resampled = resampleFloat32(channel, decoded.sampleRate, LIVEAVATAR_PCM_RATE_HZ);
    return float32ToPcm16LeBinary(resampled);
  } finally {
    void context.close().catch(() => undefined);
  }
}
