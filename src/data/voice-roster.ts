import { VAPI_CURATED_VOICES, WIRELINE_LIVE_VOICES } from "../lib/voice-catalog";

/**
 * Managed voice rotation for every Wireline creation surface.
 *
 * Wireline owns the phone-runtime decision. New employees receive a dependable
 * native xAI PSTN voice without requiring a separate customer voice-provider
 * account, API key, clone, or presenter configuration. Curated Vapi voices
 * remain available for explicit rollback and compatibility paths.
 */
const MANAGED_XAI_VOICE_IDS = WIRELINE_LIVE_VOICES.map((voice) => voice.id);

const MANAGED_VOICE_IDS = [
  "Savannah",
  "Elliot",
  "Emma",
  "Clara",
  "Nico",
  "Sid",
  "Layla",
  "Neil",
] as const;

const MANAGED_VOICE_ROSTER = MANAGED_VOICE_IDS.map((voiceId) => {
  const voice = VAPI_CURATED_VOICES.find((candidate) => candidate.id === voiceId);
  if (!voice) throw new Error(`Managed Vapi voice ${voiceId} is missing from the catalog.`);
  return voice;
});

export const DEFAULT_MANAGED_VOICE_ID = MANAGED_VOICE_ROSTER[0].id;
export const DEFAULT_XAI_VOICE_ID = MANAGED_XAI_VOICE_IDS[0];

export function isXaiPstnVoiceId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return MANAGED_XAI_VOICE_IDS.some((id) => id === normalized);
}

/**
 * Runtime acceptance covers the ENTIRE curated Vapi catalog, not just the
 * rollback pool above. The pickers (SimpleVoicePicker, DeployAgentModal) may
 * still encounter legacy Vapi selections, and those stored values must remain
 * valid until an operator or customer migrates them to native xAI.
 */
export function isManagedVapiVoiceId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    VAPI_CURATED_VOICES.some(
      (voice) => voice.provider === "vapi" && voice.id.toLowerCase() === value.trim().toLowerCase(),
    )
  );
}

/**
 * PSTN voice resolution shared by the inbound factory and the outbound client.
 * Studio voices that are not managed Vapi or xAI ids (presenter uuids) fall
 * back to the agent's dedicated phone voice (`agents.phone_voice_id`, defaulted
 * at PATCH time) before the roster default.
 */
export function resolvePstnVoiceCandidate(
  studioVoiceId: string | null | undefined,
  phoneVoiceId: string | null | undefined,
): string | null | undefined {
  if (isXaiPstnVoiceId(studioVoiceId)) return studioVoiceId;
  if (isManagedVapiVoiceId(studioVoiceId)) return studioVoiceId;
  if (isXaiPstnVoiceId(phoneVoiceId)) return phoneVoiceId;
  if (isManagedVapiVoiceId(phoneVoiceId)) return phoneVoiceId;
  return studioVoiceId;
}

/**
 * Deterministically distribute new employees across the native xAI PSTN
 * roster. Legacy Vapi voices are accepted for rollback but are never assigned
 * implicitly by a customer-facing creation surface.
 */
export function pickRotatedVoiceId(existingAgentCount: number): string {
  const rotation = MANAGED_XAI_VOICE_IDS;
  if (!Number.isFinite(existingAgentCount) || existingAgentCount < 0) {
    return DEFAULT_XAI_VOICE_ID;
  }
  return rotation[Math.floor(existingAgentCount) % rotation.length];
}
