import { fetchWithTimeout } from "../server-context";
import type { XAIGrokVoice } from "./xai-voice-config";

/**
 * A few seconds of the exact voice phone callers hear, spoken as this Bot.
 * The live rehearsal answers "how does my Bot talk?"; a sample answers
 * "which voice do I want?" in one tap, without a microphone or a session.
 */

export const VOICE_SAMPLE_URL = "https://api.x.ai/v1/tts";
const SAMPLE_TIMEOUT_MS = 15_000;
const MAX_CACHED_SAMPLES = 200;
const MAX_SAMPLE_BYTES = 1_000_000;

const cache = new Map<string, Buffer>();

export function isVoiceSampleAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.XAI_API_KEY?.trim());
}

/** The greeting a caller would hear, kept short so a sample plays in about four seconds. */
export function voiceSampleLine(agentName: string): string {
  const name =
    agentName
      .replace(/[^\p{L}\p{N}' .&-]/gu, "")
      .trim()
      .slice(0, 40) || "your Bot";
  return `Hi, thanks for calling. This is ${name}. How can I help you today?`;
}

export async function synthesizeVoiceSample(
  voice: XAIGrokVoice,
  agentName: string,
  fetchImpl: typeof fetchWithTimeout = fetchWithTimeout,
): Promise<Buffer> {
  const text = voiceSampleLine(agentName);
  const key = `${voice}\u0000${text}`;
  const cached = cache.get(key);
  if (cached) {
    // Refresh recency so frequently played samples stay cached.
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  }
  const apiKey = process.env.XAI_API_KEY?.trim();
  if (!apiKey) throw new Error("Voice samples are not configured.");
  const response = await fetchImpl(
    VOICE_SAMPLE_URL,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        voice_id: voice,
        language: "en",
        output_format: { codec: "mp3", sample_rate: 24000, bit_rate: 64000 },
      }),
    },
    SAMPLE_TIMEOUT_MS,
  );
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new Error(`Voice sample failed (HTTP ${response.status}).`);
  }
  const audio = Buffer.from(await response.arrayBuffer());
  if (!audio.length || audio.length > MAX_SAMPLE_BYTES) {
    throw new Error("Voice sample was empty or too large.");
  }
  cache.set(key, audio);
  while (cache.size > MAX_CACHED_SAMPLES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return audio;
}

/** Test seam: forget cached samples. */
export function clearVoiceSampleCache(): void {
  cache.clear();
}
