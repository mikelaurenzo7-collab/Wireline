/** Browser audio samples for the curated Wireline Preview voice family. */
import { AppError } from "../api-error";
import { VAPI_CURATED_VOICES, WIRELINE_LIVE_VOICES } from "../voice-catalog";
import { synthesizeXaiSpeech } from "./xai-tts-service";

export const CURATED_VOICE_PREVIEW_TEXT = "Hello, this is {name}. How can I help you today?";

const XAI_VOICE_IDS = new Set(WIRELINE_LIVE_VOICES.map((voice) => voice.id));

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
// "xai" remains a compatibility token for legacy preview URLs. It must not be
// used as evidence that xAI owns live browser/mobile voice or production PSTN.
export type CuratedPreviewProvider = "xai" | "vapi";

export function curatedVoicePreviewPath(provider: CuratedPreviewProvider, voiceId: string): string {
  const params = new URLSearchParams({ provider, voiceId });
  return `/api/voices/curated/preview?${params.toString()}`;
}

function resolveDisplayName(provider: CuratedPreviewProvider, voiceId: string): string {
  const pool = provider === "xai" ? WIRELINE_LIVE_VOICES : VAPI_CURATED_VOICES;
  const match = pool.find((voice) => voice.id === voiceId);
  if (!match) return voiceId;
  return match.name.split(" · ")[0]?.trim() || match.name;
}

export function isCuratedPreviewProvider(value: string): value is CuratedPreviewProvider {
  return value === "xai" || value === "vapi";
}

/**
 * Generate an MP3 preview for an exact curated preview voice.
 *
 * Vapi does not expose a documented standalone preview endpoint, so its voices
 * are intentionally auditioned during a phone test instead of being faked with
 * a different provider. This path never participates in live call routing.
 *
 * The membership check runs before the credential check so an unknown voice id
 * reports 404 whether or not the workspace has a key, which keeps the endpoint
 * from confirming credential state to an unauthenticated prober.
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

  const displayName = resolveDisplayName(provider, normalizedVoiceId);
  const result = await synthesizeXaiSpeech(
    {
      text: CURATED_VOICE_PREVIEW_TEXT.replace("{name}", displayName),
      voiceId: normalizedVoiceId,
      language: "en",
      timeoutMs: 15_000,
    },
    fetchImpl as typeof fetch,
  );
  return result.audio;
}
