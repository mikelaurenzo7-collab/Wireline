/**
 * Server-side curated voice previews — replaces browser speechSynthesis for
 * Wireline Live (xAI) and Wireline Phone (Vapi) timbre samples.
 *
 * Uses ElevenLabs TTS with a fixed mapping so previews sound polished even
 * when the caller's runtime voice is Grok realtime or Vapi native TTS.
 */
import { AppError } from "../api-error";
import { elevenLabsConfigured, generateSample } from "../elevenlabs-client";
import { VAPI_CURATED_VOICES, WIRELINE_LIVE_VOICES } from "../voice-catalog";

/** Shared sample line — matches the old browser preview copy. */
export const CURATED_VOICE_PREVIEW_TEXT = "Hello, this is {name}. How can I help you today?";

/**
 * Approximate timbre mapping from curated Wireline Live voices → ElevenLabs
 * starter voices (documented public IDs every account can use).
 */
const XAI_TO_ELEVENLABS: Record<string, string> = {
  eve: "EXAVITQu4vr4xnSDxMaL", // Sarah · energetic
  ara: "21m00Tcm4TlvDq8ikWAM", // Rachel · warm
  rex: "VR6AewLTigWG4xSOukaG", // Arnold · crisp
  sal: "pNInz6obpgDQGcFmaJgB", // Adam · balanced
  leo: "ErXwobaYiN019PkySvjV", // Antoni · direct
};

/** Vapi curated names → ElevenLabs approximations for audition only. */
const VAPI_TO_ELEVENLABS: Record<string, string> = {
  Elliot: "pNInz6obpgDQGcFmaJgB",
  Kylie: "EXAVITQu4vr4xnSDxMaL",
  Lily: "21m00Tcm4TlvDq8ikWAM",
  Savannah: "MF3mGyEYCl7XYWbV9V6O", // Elli
  Rohan: "VR6AewLTigWG4xSOukaG",
  Hana: "AZnzlk1XvdvUeBnXmlld",
  Neha: "jsCqWAovK2LkecY7zXl4",
  Cole: "ErXwobaYiN019PkySvjV",
};

export type CuratedPreviewProvider = "xai" | "vapi";

export function curatedVoicePreviewPath(provider: CuratedPreviewProvider, voiceId: string): string {
  const params = new URLSearchParams({
    provider,
    voiceId,
  });
  return `/api/voices/curated/preview?${params.toString()}`;
}

function resolveDisplayName(provider: CuratedPreviewProvider, voiceId: string): string {
  const pool = provider === "xai" ? WIRELINE_LIVE_VOICES : VAPI_CURATED_VOICES;
  const match = pool.find((voice) => voice.id === voiceId);
  if (!match) return voiceId;
  return match.name.split(" — ")[0]?.trim() || match.name;
}

function resolveElevenLabsVoiceId(provider: CuratedPreviewProvider, voiceId: string): string {
  const normalized = voiceId.trim();
  const map = provider === "xai" ? XAI_TO_ELEVENLABS : VAPI_TO_ELEVENLABS;
  const mapped = map[normalized];
  if (!mapped) {
    throw AppError.fromHttpStatus(404, "Voice preview not available for this selection.");
  }
  return mapped;
}

export function isCuratedPreviewProvider(value: string): value is CuratedPreviewProvider {
  return value === "xai" || value === "vapi";
}

export async function generateCuratedVoicePreview(
  provider: CuratedPreviewProvider,
  voiceId: string,
): Promise<ArrayBuffer> {
  if (!elevenLabsConfigured()) {
    throw AppError.fromHttpStatus(503, "Voice previews unavailable.");
  }
  const elevenLabsId = resolveElevenLabsVoiceId(provider, voiceId);
  const displayName = resolveDisplayName(provider, voiceId);
  const text = CURATED_VOICE_PREVIEW_TEXT.replace("{name}", displayName);
  return generateSample({ voiceId: elevenLabsId, text });
}
