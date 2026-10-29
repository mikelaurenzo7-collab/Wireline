import { GoogleGenAI } from "@google/genai";

export const GEMINI_3_8_LIVE_MODEL = "gemini-3.8-live" as const;
export const GEMINI_3_8_LIVE_EXTENDED_THINKING_MODEL =
  "gemini-3.8-live-extended-thinking" as const;
export const RESOLVED_GEMINI_LIVE_MODEL =
  process.env.GEMINI_LIVE_MODEL?.trim() || GEMINI_3_8_LIVE_MODEL;

export type GeminiLiveModel =
  | typeof GEMINI_3_8_LIVE_MODEL
  | typeof GEMINI_3_8_LIVE_EXTENDED_THINKING_MODEL;

let cachedClient: GoogleGenAI | null = null;

export function getGeminiClient(apiKey?: string): GoogleGenAI {
  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }
  if (!apiKey && cachedClient) {
    return cachedClient;
  }
  const client = new GoogleGenAI({ apiKey: key });
  if (!apiKey) {
    cachedClient = client;
  }
  return client;
}

export function isGeminiLiveConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

/** Precomputed G.711 mu-law to 16-bit linear PCM lookup table. */
const MULAW_DECODE_TABLE = new Int16Array(256);
for (let i = 0; i < 256; i++) {
  const mu = ~i;
  const sign = mu & 0x80 ? -1 : 1;
  const exponent = (mu >> 4) & 0x07;
  const mantissa = mu & 0x0f;
  let sample = (mantissa << 3) + 0x84;
  sample <<= exponent;
  sample -= 0x84;
  MULAW_DECODE_TABLE[i] = sign * sample;
}

/**
 * Transcodes Twilio 8kHz mu-law audio into 16kHz 16-bit PCM little-endian for Gemini Live.
 * Applies linear interpolation upsampling to eliminate aliasing artifacts.
 */
export function mulawToPcm16_16k(mulawBuffer: Buffer): Buffer {
  const sampleCount = mulawBuffer.length;
  if (sampleCount === 0) return Buffer.alloc(0);

  // 8kHz -> 16kHz doubles the sample count. Each 16-bit sample is 2 bytes.
  const out = Buffer.alloc(sampleCount * 2 * 2);

  for (let i = 0; i < sampleCount; i++) {
    const s0 = MULAW_DECODE_TABLE[mulawBuffer[i]];
    const s1 =
      i + 1 < sampleCount ? MULAW_DECODE_TABLE[mulawBuffer[i + 1]] : s0;
    const interpolated = Math.round((s0 + s1) / 2);

    const outOffset = i * 4;
    out.writeInt16LE(s0, outOffset);
    out.writeInt16LE(interpolated, outOffset + 2);
  }

  return out;
}

/**
 * Transcodes Gemini Live 24kHz 16-bit PCM little-endian audio into Twilio 8kHz mu-law.
 * Decimates by 3 with 3-sample averaging for anti-aliasing.
 */
export function pcm24ToMulawBuffer(pcm24Buffer: Buffer): Buffer {
  const length = pcm24Buffer.length - (pcm24Buffer.length % 6);
  if (length === 0) return Buffer.alloc(0);

  const out = Buffer.alloc(length / 6);
  let outIdx = 0;

  for (let offset = 0; offset < length; offset += 6) {
    const s0 = pcm24Buffer.readInt16LE(offset);
    const s1 = pcm24Buffer.readInt16LE(offset + 2);
    const s2 = pcm24Buffer.readInt16LE(offset + 4);
    let sample = Math.round((s0 + s1 + s2) / 3);

    const sign = sample < 0 ? 0x80 : 0;
    sample = Math.min(32635, Math.abs(sample)) + 132;
    let exponent = 7;
    for (let exp = 0; exp < 8; exp++) {
      if (sample < 1 << (exp + 8)) {
        exponent = exp;
        break;
      }
    }
    const mantissa = (sample >> (exponent + 3)) & 0x0f;
    const mulaw = ~(sign | (exponent << 4) | mantissa) & 0xff;
    out[outIdx++] = mulaw;
  }

  return out;
}
