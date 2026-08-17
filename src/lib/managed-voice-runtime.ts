import {
  DEFAULT_MANAGED_VOICE_ID,
  isManagedVapiVoiceId,
  isXaiPstnVoiceId,
} from "../data/voice-roster";
import { ELEVENLABS_CURATED_VOICES, vapiVoiceVersion } from "./voice-catalog";

export const ELEVENLABS_REALTIME_MODEL = "eleven_flash_v2_5" as const;
export const ELEVENLABS_VOICE_CONSENT_VERSION =
  "voice-clone-consent-v3-2026-08-01" as const;
export const ELEVENLABS_VOICE_QUALITY_VERSION =
  "voice-quality-v1-2026-08-01" as const;
export const DEFAULT_XAI_PSTN_VOICE_ID = "eve" as const;

const CURATED_ELEVENLABS_IDS = new Set(
  ELEVENLABS_CURATED_VOICES.map((voice) => voice.id),
);

export function isCuratedElevenLabsVoiceId(value: unknown): value is string {
  return typeof value === "string" && CURATED_ELEVENLABS_IDS.has(value.trim());
}

function clampNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export type ManagedVoiceRuntimeInput = {
  voiceProvider?: string | null;
  voiceId?: string | null;
  approvedClone?: boolean;
  voiceSpeed?: string | number | null;
  voiceStability?: string | number | null;
  voiceSimilarityBoost?: string | number | null;
  voiceStyle?: string | number | null;
  voiceSpeakerBoost?: boolean | null;
  fallbackVoiceId?: string | null;
};

function vapiFallbackVoices(fallbackVoiceId: string) {
  return [
    {
      provider: "vapi" as const,
      voiceId: fallbackVoiceId,
      ...(vapiVoiceVersion(fallbackVoiceId)
        ? { version: vapiVoiceVersion(fallbackVoiceId) }
        : {}),
    },
  ];
}

/**
 * Build the exact Vapi voice object used by inbound and outbound calls.
 * xAI Eve/Ara/Rex/Sal/Leo are the managed PSTN default through Vapi's `xai`
 * voice provider. ElevenLabs is accepted only for the curated catalog or a
 * tenant-owned clone that the database reports as approved. Every external
 * voice carries a Vapi fallback so a provider incident does not end a call.
 * Direct `https://api.x.ai/v1/tts` is never used on this path.
 */
export function buildManagedVoiceRuntime(input: ManagedVoiceRuntimeInput) {
  const fallbackVoiceId = isManagedVapiVoiceId(input.fallbackVoiceId)
    ? input.fallbackVoiceId
    : DEFAULT_MANAGED_VOICE_ID;
  const voiceId = input.voiceId?.trim() || "";
  const elevenLabsAllowed =
    input.voiceProvider === "11labs" &&
    Boolean(voiceId) &&
    (isCuratedElevenLabsVoiceId(voiceId) || input.approvedClone === true);

  if (elevenLabsAllowed) {
    return {
      provider: "11labs" as const,
      voiceId,
      model: ELEVENLABS_REALTIME_MODEL,
      stability: clampNumber(input.voiceStability, 0.5, 0, 1),
      similarityBoost: clampNumber(input.voiceSimilarityBoost, 0.75, 0, 1),
      style: clampNumber(input.voiceStyle, 0, 0, 1),
      useSpeakerBoost: input.voiceSpeakerBoost !== false,
      speed: clampNumber(input.voiceSpeed, 1, 0.7, 1.2),
      optimizeStreamingLatency: 3,
      fallbackPlan: {
        voices: vapiFallbackVoices(fallbackVoiceId),
      },
    };
  }

  const xaiVoiceId = isXaiPstnVoiceId(voiceId)
    ? voiceId.trim().toLowerCase()
    : input.voiceProvider === "xai"
      ? DEFAULT_XAI_PSTN_VOICE_ID
      : null;
  if (xaiVoiceId) {
    return {
      provider: "xai" as const,
      voiceId: xaiVoiceId,
      language: "en",
      speed: clampNumber(input.voiceSpeed, 1, 0.7, 1.5),
      fallbackPlan: {
        voices: vapiFallbackVoices(fallbackVoiceId),
      },
    };
  }

  const managedVoiceId = isManagedVapiVoiceId(voiceId)
    ? voiceId
    : fallbackVoiceId;
  return {
    provider: "vapi" as const,
    voiceId: managedVoiceId,
    ...(vapiVoiceVersion(managedVoiceId)
      ? { version: vapiVoiceVersion(managedVoiceId) }
      : {}),
  };
}
