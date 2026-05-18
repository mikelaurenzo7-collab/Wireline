/**
 * Voice rotation pool for templated agent deployment.
 *
 * When an operator deploys an agent from a template (or via the bulk
 * fleet-deploy endpoint) without an explicit voice picker, the prior
 * behavior assigned a single hardcoded voice id to every agent — three
 * seeded agents ended up sharing one voice, which undercuts the entire
 * voice-picker selling point.
 *
 * Now: round-robin across this short curated roster keyed by the
 * tenant's current agent count, so the first three agents an operator
 * deploys always get three distinct voices. The roster only contains
 * ElevenLabs "starter" voice IDs that every 11labs account has access
 * to by default — no licensing surprises.
 *
 * The operator can override any of these in FleetSettings → Voice; the
 * factory already honors `agent.voiceIdInbound` / `voiceIdOutbound` /
 * `voiceId` when set, so this is purely a smarter default.
 */

export type VoiceRosterEntry = {
  /** ElevenLabs voice id — used in vapi-assistant-factory.ts voice payload. */
  voiceId: string;
  /** Human label surfaced in FleetSettings + analytics, not the API. */
  label: string;
  /** Rough vibe — used to nudge the role-to-voice assignment below. */
  vibe: "warm-female" | "warm-male" | "energetic-female" | "crisp-male";
};

/**
 * Curated ElevenLabs starter roster. These IDs are documented public
 * voices available to every 11labs account, so any operator can hear
 * them without paying for cloning credits.
 *
 * Order matters: the round-robin assigns by index, so a fresh tenant's
 * first three agents land on Rachel / Adam / Bella by default — three
 * distinctly different timbres that read as "polished, varied fleet"
 * on the first dashboard load.
 */
export const VOICE_ROSTER: ReadonlyArray<VoiceRosterEntry> = [
  // Existing platform default — kept first so legacy agents that read
  // PLATFORM_DEFAULT_VOICE_ID stay consistent on their first call.
  { voiceId: "bIHbv24MWmeRgasZH58o", label: "Wireline Default", vibe: "warm-female" },
  // ElevenLabs documented starter voices — verified against the public
  // voice library. Labels match ElevenLabs' canonical display names so
  // FleetSettings + analytics show the operator the same name the
  // ElevenLabs dashboard does.
  { voiceId: "21m00Tcm4TlvDq8ikWAM", label: "Rachel · Warm", vibe: "warm-female" },
  { voiceId: "EXAVITQu4vr4xnSDxMaL", label: "Sarah · Gentle", vibe: "energetic-female" },
  { voiceId: "pNInz6obpgDQGcFmaJgB", label: "Adam · Deep", vibe: "warm-male" },
  { voiceId: "VR6AewLTigWG4xSOukaG", label: "Arnold · Crisp", vibe: "crisp-male" },
];

/**
 * Pick a default voice id for a new agent given how many agents this
 * tenant already has. The seed/fleet-deploy paths call this when the
 * operator hasn't specified a voice; the operator can override later
 * in FleetSettings.
 *
 * Stable & deterministic — useful for tests + so repeating the same
 * sequence of deploys always produces the same voice mix.
 */
export function pickRotatedVoiceId(existingAgentCount: number): string {
  // Defense in depth: caller is normally a SQL COUNT() result (always
  // >= 0), but a bad payload could pass NaN or negative — JS modulo on
  // a negative produces a negative index → out-of-bounds undefined →
  // runtime crash on `entry.voiceId`. Validate explicitly and fall
  // back to the platform default rather than throwing into the
  // request path.
  if (!Number.isFinite(existingAgentCount) || existingAgentCount < 0) {
    return VOICE_ROSTER[0].voiceId;
  }
  const idx = Math.floor(existingAgentCount) % VOICE_ROSTER.length;
  const entry = VOICE_ROSTER[idx];
  return entry.voiceId;
}
