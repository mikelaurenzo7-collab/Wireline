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

export function isManagedVapiVoiceId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    MANAGED_VOICE_ROSTER.some((voice) => voice.id.toLowerCase() === value.trim().toLowerCase())
  );
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
