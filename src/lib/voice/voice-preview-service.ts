/** Exact server-side previews for Wireline Live voices. */
import { AppError } from "../api-error";
import { log } from "../server-logger";
import { VAPI_CURATED_VOICES, WIRELINE_LIVE_VOICES } from "../voice-catalog";

export const CURATED_VOICE_PREVIEW_TEXT = "Hello, this is {name}. How can I help you today?";

const XAI_TTS_URL = "https://api.x.ai/v1/tts";
const XAI_VOICE_IDS = new Set(WIRELINE_LIVE_VOICES.map((voice) => voice.id));

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export type CuratedPreviewProvider = "xai" | "vapi";

export function curatedVoicePreviewPath(provider: CuratedPreviewProvider, voiceId: string): string {
  const params = new URLSearchParams({ provider, voiceId });
  return `/api/voices/curated/preview?${params.toString()}`;
}

function resolveDisplayName(provider: CuratedPreviewProvider, voiceId: string): string {
  const pool = provider === "xai" ? WIRELINE_LIVE_VOICES : VAPI_CURATED_VOICES;
  const match = pool.find((voice) => voice.id === voiceId);
  if (!match) return voiceId;
  return match.name.split(" — ")[0]?.trim() || match.name;
}

export function isCuratedPreviewProvider(value: string): value is CuratedPreviewProvider {
  return value === "xai" || value === "vapi";
}

/**
 * Generate an MP3 with the provider and exact voice the user selected.
 * Vapi does not expose a documented standalone preview endpoint, so its voices
 * are intentionally auditioned during a phone test instead of being faked with
 * a different provider.
 */
export async function generateCuratedVoicePreview(
  provider: CuratedPreviewProvider,
  voiceId: string,
  fetchImpl: FetchLike = fetch,
): Promise<ArrayBuffer> {
  if (provider !== "xai") {
    throw AppError.fromHttpStatus(404, "Hear this voice during a phone test.");
  }

  const normalizedVoiceId = voiceId.trim().toLowerCase();
  if (!XAI_VOICE_IDS.has(normalizedVoiceId)) {
    throw AppError.fromHttpStatus(404, "Voice preview not available for this selection.");
  }

  const apiKey = process.env.XAI_API_KEY?.trim();
  if (!apiKey) {
    throw AppError.fromHttpStatus(503, "Voice previews unavailable.");
  }

  const displayName = resolveDisplayName(provider, normalizedVoiceId);
  const text = CURATED_VOICE_PREVIEW_TEXT.replace("{name}", displayName);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetchImpl(XAI_TTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        voice_id: normalizedVoiceId,
        language: "en",
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      log.warn("[voice-preview] provider TTS request rejected", {
        provider: "wireline-live",
        status: response.status,
        voiceId: normalizedVoiceId,
        detail,
      });
      throw AppError.fromHttpStatus(503, "Voice preview is temporarily unavailable.");
    }

    const audio = await response.arrayBuffer();
    if (audio.byteLength === 0) {
      log.warn("[voice-preview] provider TTS returned empty audio", {
        provider: "wireline-live",
        voiceId: normalizedVoiceId,
      });
      throw AppError.fromHttpStatus(503, "Voice preview is temporarily unavailable.");
    }
    return audio;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw AppError.fromHttpStatus(503, "Voice preview is temporarily unavailable.");
  } finally {
    clearTimeout(timeout);
  }
}
