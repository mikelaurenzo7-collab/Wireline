import type { CloneEngineId } from "./clone-engines";

/**
 * Per-account clone engine choice, decided by eligibility rather than by the
 * customer. BotBound's own voice lifecycle is the same for every engine.
 *
 * xAI Custom Voices (https://docs.x.ai/developers/model-capabilities/audio/custom-voices):
 *   "Custom Voices is currently only available in the United States, with the
 *   exception of Illinois." / "The `POST /v1/custom-voices` endpoint is gated to
 *   teams on an Enterprise plan." / "The default limit is 30 custom voices per team."
 * BotBound uses one xAI team, so the 30 voices are shared by every customer.
 */
export const US_STATE_CODES = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "DC",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
  "PR",
  "GU",
  "VI",
  "AS",
  "MP",
] as const;
export type UsStateCode = (typeof US_STATE_CODES)[number];

/** Where the speaker lives: `US-XX` for a US state/territory, or `INTL`. */
export type SpeakerJurisdiction = `US-${UsStateCode}` | "INTL";

export function parseSpeakerJurisdiction(value: unknown): SpeakerJurisdiction | null {
  if (value === "INTL") return "INTL";
  if (typeof value !== "string" || !/^US-[A-Z]{2}$/.test(value)) return null;
  return (US_STATE_CODES as readonly string[]).includes(value.slice(3))
    ? (value as SpeakerJurisdiction)
    : null;
}

/**
 * Jurisdictions whose biometric-privacy law requires a written release and a
 * published retention/destruction schedule before a voiceprint is collected
 * (Illinois BIPA, 740 ILCS 14/15). Applied regardless of engine.
 */
export const WRITTEN_BIOMETRIC_RELEASE_JURISDICTIONS: readonly SpeakerJurisdiction[] = ["US-IL"];

export function requiresWrittenBiometricRelease(jurisdiction: SpeakerJurisdiction): boolean {
  return WRITTEN_BIOMETRIC_RELEASE_JURISDICTIONS.includes(jurisdiction);
}

/** xAI's published region rule: US only, Illinois excluded. */
export function xaiCustomVoiceRegionAllowed(jurisdiction: SpeakerJurisdiction): boolean {
  return jurisdiction.startsWith("US-") && jurisdiction !== "US-IL";
}

export const XAI_CUSTOM_VOICE_TEAM_LIMIT_DEFAULT = 30;

export function resolveXAICustomVoiceTeamLimit(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.XAI_CUSTOM_VOICE_TEAM_LIMIT);
  return Number.isSafeInteger(raw) && raw >= 1 && raw <= 10_000
    ? raw
    : XAI_CUSTOM_VOICE_TEAM_LIMIT_DEFAULT;
}

/**
 * Capability check for the Enterprise-gated xAI create endpoint.
 * XAI_CUSTOM_VOICES_API_ENABLED=false never uses xAI for clones. Otherwise xAI
 * is tried when eligible, and a 403 (no Enterprise) is remembered for six
 * hours so new clones go straight to the next engine. Once Enterprise is on,
 * xAI answers 200 and becomes the clone engine with no code or env change.
 */
const XAI_NOT_ENTITLED_TTL_MS = 6 * 60 * 60 * 1000;
let xaiNotEntitledUntil = 0;

export function noteXAICustomVoiceNotEntitled(now: number = Date.now()): void {
  xaiNotEntitledUntil = now + XAI_NOT_ENTITLED_TTL_MS;
}

export function resetXAICustomVoiceEntitlementForTests(): void {
  xaiNotEntitledUntil = 0;
}

export function xaiCustomVoiceApiEntitled(
  env: NodeJS.ProcessEnv = process.env,
  now: number = Date.now(),
): boolean {
  if (env.XAI_CUSTOM_VOICES_API_ENABLED === "false") return false;
  if (env.XAI_CUSTOM_VOICES_API_ENABLED === "true") return true;
  return now >= xaiNotEntitledUntil;
}

export function resolvePreferredCloneEngine(
  env: NodeJS.ProcessEnv = process.env,
): CloneEngineId | null {
  const raw = String(env.VOICE_CLONE_ENGINE_DEFAULT || "").trim();
  return raw === "xai" || raw === "elevenlabs" ? raw : null;
}

/** Errors that mean "this engine can't take the voice right now": try the next one. */
export const CLONE_ENGINE_FALLTHROUGH_CODES = [
  "not_configured",
  "not_entitled",
  "limit_reached",
  "quota_exhausted",
  "region_unavailable",
] as const;

export type CloneEngineSelectionInput = {
  jurisdiction: SpeakerJurisdiction;
  xai: { configured: boolean; entitled: boolean; teamVoicesUsed: number; teamLimit: number };
  elevenlabs: { configured: boolean };
  /** Optional operator pin (VOICE_CLONE_ENGINE_DEFAULT); still subject to eligibility. */
  preferred?: CloneEngineId | null;
};

export type CloneEngineSelection =
  | { engine: CloneEngineId; reason: CloneSelectionReason; writtenReleaseRequired: boolean }
  | { engine: null; reason: CloneSelectionReason; writtenReleaseRequired: boolean };

export type CloneSelectionReason =
  | "xai_eligible"
  | "operator_preferred_elevenlabs"
  | "xai_region_excluded"
  | "xai_not_entitled"
  | "xai_not_configured"
  | "xai_team_full"
  | "no_engine_available";

export function selectCloneEngine(input: CloneEngineSelectionInput): CloneEngineSelection {
  const writtenReleaseRequired = requiresWrittenBiometricRelease(input.jurisdiction);
  let xaiBlock: CloneSelectionReason | null = null;
  if (!xaiCustomVoiceRegionAllowed(input.jurisdiction)) xaiBlock = "xai_region_excluded";
  else if (!input.xai.configured) xaiBlock = "xai_not_configured";
  else if (!input.xai.entitled) xaiBlock = "xai_not_entitled";
  else if (input.xai.teamVoicesUsed >= input.xai.teamLimit) xaiBlock = "xai_team_full";

  if (input.preferred === "elevenlabs" && input.elevenlabs.configured)
    return {
      engine: "elevenlabs",
      reason: "operator_preferred_elevenlabs",
      writtenReleaseRequired,
    };
  if (!xaiBlock) return { engine: "xai", reason: "xai_eligible", writtenReleaseRequired };
  if (input.elevenlabs.configured)
    return { engine: "elevenlabs", reason: xaiBlock, writtenReleaseRequired };
  return { engine: null, reason: "no_engine_available", writtenReleaseRequired };
}

/**
 * Retention/destruction schedule (policy `voice-retention-v2-2026-10-24`),
 * applied to every cloned voice in every jurisdiction: a voice is destroyed at
 * the earliest of the owner deleting it, the account closing, 12 months
 * without being played on a call or preview, or 3 years after creation
 * (Illinois BIPA's outer limit is 3 years after the last interaction).
 */
export const BIOMETRIC_RETENTION_POLICY_VERSION = "voice-retention-v2-2026-10-24" as const;
export const BIOMETRIC_IDLE_MONTHS = 12;
export const BIOMETRIC_IDLE_DAYS = 365;
export const BIOMETRIC_MAX_DAYS = 365 * 3;
const DAY_MS = 86_400_000;

export function biometricExpiresAt(createdAt: Date, lastUsedAt: Date | null): Date {
  const idle = (lastUsedAt ?? createdAt).getTime() + BIOMETRIC_IDLE_DAYS * DAY_MS;
  const max = createdAt.getTime() + BIOMETRIC_MAX_DAYS * DAY_MS;
  return new Date(Math.min(idle, max));
}

/**
 * Written voice release version. Every speaker signs it (not only Illinois):
 * the speaker is always the signer, typing their own full legal name.
 * Changing the text requires a new version.
 */
export const BIOMETRIC_RELEASE_VERSION = "voice-release-v2-2026-10-24" as const;

export function parseSignedLegalName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  // eslint-disable-next-line no-control-regex
  if (name.length < 3 || name.length > 120 || /[\u0000-\u001f\u007f<>]/.test(name)) return null;
  return name.includes(" ") ? name : null;
}

/**
 * Ordered engines to try for one new clone. The first is the selected engine;
 * the rest are eligible fall-throughs when it answers with a capacity or
 * entitlement error. Illinois and non-US speakers never reach xAI.
 */
export function cloneEngineCandidates(input: CloneEngineSelectionInput): CloneEngineId[] {
  const first = selectCloneEngine(input).engine;
  if (!first) return [];
  const out: CloneEngineId[] = [first];
  if (first === "xai" && input.elevenlabs.configured) out.push("elevenlabs");
  if (
    first === "elevenlabs" &&
    xaiCustomVoiceRegionAllowed(input.jurisdiction) &&
    input.xai.configured &&
    input.xai.entitled &&
    input.xai.teamVoicesUsed < input.xai.teamLimit
  )
    out.push("xai");
  return out;
}

/** Plain-language destruction schedule shown with the written release. */
export const BIOMETRIC_RETENTION_SUMMARY =
  "We keep this voice only while you use it. It is permanently destroyed, in BotBound and at the voice provider that holds it, " +
  `when you delete it, when you close your account, after ${BIOMETRIC_IDLE_MONTHS} months without being used, ` +
  `or ${BIOMETRIC_MAX_DAYS / 365} years after it was created, whichever comes first.`;

/**
 * Written release (BIPA 740 ILCS 14/15(b) for Illinois; applied to everyone):
 * what is collected, the specific purpose, who processes it, how long it is
 * kept, and a signed authorization. The exact lines shown are stored with the
 * voice as the consent record, together with the typed name and time.
 */
export function biometricReleaseText(agentName: string): string[] {
  return [
    "I am the person whose voice is in this recording, and I am recording it myself.",
    "BotBound will create a voiceprint (a digital model of how my voice sounds) from this recording.",
    `Purpose: only to let ${agentName || "my Bot"} speak in my voice on my business's calls and previews. It is never sold, leased, traded, or used to identify anyone.`,
    "A third-party voice provider processes this recording to create the voice and keeps the voice model until it is deleted. BotBound does not keep the recording itself, only the voice, a fingerprint of the file, its length, and its quality score.",
    BIOMETRIC_RETENTION_SUMMARY,
    "By typing my full legal name below, I give BotBound and its voice provider written permission to collect, store, and use my voiceprint as described.",
  ];
}

/** The release exactly as signed, for the consent record. */
export function biometricReleaseRecord(agentName: string): string {
  return biometricReleaseText(agentName).join("\n");
}

export const US_STATE_NAMES: Record<UsStateCode, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  DC: "District of Columbia",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
  PR: "Puerto Rico",
  GU: "Guam",
  VI: "U.S. Virgin Islands",
  AS: "American Samoa",
  MP: "Northern Mariana Islands",
};
