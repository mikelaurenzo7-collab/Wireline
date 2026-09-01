import {
  OPENAI_REALTIME_VOICES,
  OPENAI_REALTIME_VOICE_IDS,
  type OpenAIRealtimeVoiceId,
} from "../lib/voice-catalog";

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
  "alloy",
  "ballad",
] as const;

const MANAGED_VOICE_ROSTER = MANAGED_VOICE_IDS.map((voiceId) => {
  const voice = OPENAI_REALTIME_VOICES.find((candidate) => candidate.id === voiceId);
  if (!voice) throw new Error(`Managed OpenAI Realtime voice ${voiceId} is missing.`);
  return voice;
});

export const DEFAULT_MANAGED_VOICE_ID = MANAGED_VOICE_ROSTER[0].id;

export function normalizeManagedOpenAIVoiceId(value: unknown): OpenAIRealtimeVoiceId | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim().toLowerCase();
  return (OPENAI_REALTIME_VOICE_IDS as readonly string[]).includes(candidate)
    ? (candidate as OpenAIRealtimeVoiceId)
    : null;
}

export function isManagedOpenAIVoiceId(value: unknown): value is string {
  return normalizeManagedOpenAIVoiceId(value) !== null;
}

/** Resolve a stored selection to a voice OpenAI Realtime can actually use. */
export function resolvePstnVoiceCandidate(
  studioVoiceId: string | null | undefined,
  phoneVoiceId: string | null | undefined,
): string {
  const studioVoice = normalizeManagedOpenAIVoiceId(studioVoiceId);
  if (studioVoice) return studioVoice;
  const phoneVoice = normalizeManagedOpenAIVoiceId(phoneVoiceId);
  if (phoneVoice) return phoneVoice;
  return DEFAULT_MANAGED_VOICE_ID;
}

export function pickRotatedVoiceId(existingAgentCount: number): string {
  if (!Number.isFinite(existingAgentCount) || existingAgentCount < 0) {
    return DEFAULT_MANAGED_VOICE_ID;
  }
  return MANAGED_VOICE_IDS[Math.floor(existingAgentCount) % MANAGED_VOICE_IDS.length];
}
