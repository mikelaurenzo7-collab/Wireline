import { OPENAI_REALTIME_VOICES } from "../lib/voice-catalog";

/**
 * Deterministic OpenAI Realtime voice rotation shared by every Bot creation
 * surface. The leading voices are OpenAI's two quality recommendations.
 */
const MANAGED_VOICE_IDS = [
  "marin",
  "cedar",
  "coral",
  "verse",
  "ash",
  "sage",
  "shimmer",
  "echo",
] as const;

const MANAGED_VOICE_ROSTER = MANAGED_VOICE_IDS.map((voiceId) => {
  const voice = OPENAI_REALTIME_VOICES.find((candidate) => candidate.id === voiceId);
  if (!voice) throw new Error(`Managed OpenAI Realtime voice ${voiceId} is missing.`);
  return voice;
});

export const DEFAULT_MANAGED_VOICE_ID = MANAGED_VOICE_ROSTER[0].id;

export function isManagedOpenAIVoiceId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    OPENAI_REALTIME_VOICES.some(
      (voice) => voice.id.toLowerCase() === value.trim().toLowerCase(),
    )
  );
}

/** Resolve a stored selection to a voice OpenAI Realtime can actually use. */
export function resolvePstnVoiceCandidate(
  studioVoiceId: string | null | undefined,
  phoneVoiceId: string | null | undefined,
): string {
  if (isManagedOpenAIVoiceId(studioVoiceId)) return studioVoiceId;
  if (isManagedOpenAIVoiceId(phoneVoiceId)) return phoneVoiceId;
  return DEFAULT_MANAGED_VOICE_ID;
}

export function pickRotatedVoiceId(existingAgentCount: number): string {
  if (!Number.isFinite(existingAgentCount) || existingAgentCount < 0) {
    return DEFAULT_MANAGED_VOICE_ID;
  }
  return MANAGED_VOICE_IDS[Math.floor(existingAgentCount) % MANAGED_VOICE_IDS.length];
}
