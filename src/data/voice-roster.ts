import { VAPI_CURATED_VOICES } from "../lib/voice-catalog";

/**
 * Managed voice rotation for every Wireline creation surface.
 *
 * Wireline owns the phone-runtime decision. New employees receive a dependable
 * Vapi voice without requiring a separate customer voice-provider account,
 * API key, clone, or presenter configuration.
 */
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

/**
 * Runtime acceptance covers the ENTIRE curated Vapi catalog, not just the
 * rotation pool above. The pickers (SimpleVoicePicker, DeployAgentModal) offer
 * all curated voices and the PATCH stores the pick verbatim — when this check
 * only knew the 8 rotation voices, a user who picked Kai/Rohan/Sagar/Godfrey/
 * Naina previewed one voice and every live call silently spoke as Savannah.
 * Rotation (pickRotatedVoiceId) intentionally stays on the smaller pool so
 * quick-deploy defaults keep their curated feel.
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
 * Studio voices that are not managed Vapi ids (presenter uuids, xAI live-voice
 * ids like "eve"/"ara") fall back to the agent's dedicated phone voice
 * (`agents.phone_voice_id`, defaulted at PATCH time) before the roster
 * default — previously phoneVoiceId was stored and surfaced in the UI but
 * never read at call time, so presenter/live-voice agents always spoke as the
 * default voice on PSTN regardless of their configured pick.
 */
export function resolvePstnVoiceCandidate(
  studioVoiceId: string | null | undefined,
  phoneVoiceId: string | null | undefined,
): string | null | undefined {
  if (isManagedVapiVoiceId(studioVoiceId)) return studioVoiceId;
  if (isManagedVapiVoiceId(phoneVoiceId)) return phoneVoiceId;
  return studioVoiceId;
}

/**
 * Deterministically distribute built-in voices across a tenant's employees.
 * The function name remains stable because web, mobile, MCP, and seed paths all
 * call it. Its output is now exclusively compatible with provider `vapi`.
 */
export function pickRotatedVoiceId(existingAgentCount: number): string {
  if (!Number.isFinite(existingAgentCount) || existingAgentCount < 0) {
    return DEFAULT_MANAGED_VOICE_ID;
  }
  return MANAGED_VOICE_ROSTER[Math.floor(existingAgentCount) % MANAGED_VOICE_ROSTER.length].id;
}
