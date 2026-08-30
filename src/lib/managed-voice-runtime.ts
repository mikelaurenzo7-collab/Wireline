import {
  DEFAULT_MANAGED_VOICE_ID,
  isManagedOpenAIVoiceId,
} from "../data/voice-roster";
import { ELEVENLABS_CURATED_VOICES } from "./voice-catalog";

export const ELEVENLABS_REALTIME_MODEL = "eleven_flash_v2_5" as const;
export const ELEVENLABS_VOICE_CONSENT_VERSION =
  "voice-clone-consent-v3-2026-08-01" as const;
export const ELEVENLABS_VOICE_QUALITY_VERSION =
  "voice-quality-v1-2026-08-01" as const;

const CURATED_ELEVENLABS_IDS = new Set(
  ELEVENLABS_CURATED_VOICES.map((voice) => voice.id),
);

export function isCuratedElevenLabsVoiceId(value: unknown): value is string {
  return typeof value === "string" && CURATED_ELEVENLABS_IDS.has(value.trim());
}

export type ManagedVoiceRuntimeInput = {
  voiceProvider?: string | null;
  voiceId?: string | null;
  fallbackVoiceId?: string | null;
};

/**
 * Normalize legacy or studio selections to an actual OpenAI Realtime voice.
 * ElevenLabs remains available to the separate preview/cloning studio but is
 * never represented as a live-call runtime provider.
 */
export function buildManagedVoiceRuntime(input: ManagedVoiceRuntimeInput) {
  const fallbackVoiceId = isManagedOpenAIVoiceId(input.fallbackVoiceId)
    ? input.fallbackVoiceId
    : DEFAULT_MANAGED_VOICE_ID;
  const voiceId = input.voiceId?.trim() || "";
  const managedVoiceId = isManagedOpenAIVoiceId(voiceId)
    ? voiceId
    : fallbackVoiceId;
  return {
    provider: "openai" as const,
    voiceId: managedVoiceId,
  };
}
