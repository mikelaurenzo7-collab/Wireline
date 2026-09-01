import { DEFAULT_MANAGED_VOICE_ID, isManagedOpenAIVoiceId } from "../data/voice-roster";

export type ManagedVoiceRuntimeInput = {
  voiceProvider?: string | null;
  voiceId?: string | null;
  fallbackVoiceId?: string | null;
};

/**
 * Normalize any persisted selection to an actual OpenAI Realtime voice.
 */
export function buildManagedVoiceRuntime(input: ManagedVoiceRuntimeInput) {
  const fallbackVoiceId = isManagedOpenAIVoiceId(input.fallbackVoiceId)
    ? input.fallbackVoiceId
    : DEFAULT_MANAGED_VOICE_ID;
  const voiceId = input.voiceId?.trim() || "";
  const managedVoiceId = isManagedOpenAIVoiceId(voiceId) ? voiceId : fallbackVoiceId;
  return {
    provider: "openai" as const,
    voiceId: managedVoiceId,
  };
}
