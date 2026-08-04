// TCPA + state-level call recording consent.
//
// US law splits jurisdictions into "one-party" (the agent's own consent
// to record is sufficient) and "two-party" / "all-party" (every party
// on the line must be notified before recording).
//
// For two-party states, a recorded compliance disclosure must be played
// at call start before any substantive conversation. Outbound dialers
// that omit this expose the Account Holder to TCPA + state-recording statute
// liability ($500–$5,000 per call).
//
// This module is the authoritative jurisdiction map + disclosure-text
// generator. Pure functions only — no side effects. The DB-backed
// consent ledger lives in wireline_consent_log; helpers to write to it
// are at the bottom of this file.

export type ConsentRule = "one_party" | "two_party";

/**
 * State-by-state consent rule. Source: state recording statutes as of
 * 2025 (current at time of writing). Where a state is genuinely
 * mixed-precedent (e.g. Nevada — federal one-party, state two-party
 * via NRS 200.620), we conservatively classify as two-party so the
 * disclosure plays.
 *
 * Updating this map is a compliance-significant change — review with
 * counsel and bump CONSENT_RULE_VERSION.
 */
export const STATE_CONSENT_RULES: Record<string, ConsentRule> = {
  AL: "one_party",
  AK: "one_party",
  AR: "one_party",
  AZ: "one_party",
  CA: "two_party",
  CO: "one_party",
  CT: "two_party",
  DE: "one_party",
  DC: "one_party",
  FL: "two_party",
  GA: "one_party",
  HI: "one_party",
  IA: "one_party",
  ID: "one_party",
  IL: "two_party",
  IN: "one_party",
  KS: "one_party",
  KY: "one_party",
  LA: "one_party",
  MA: "two_party",
  MD: "two_party",
  ME: "one_party",
  MI: "two_party",
  MN: "one_party",
  MO: "one_party",
  MS: "one_party",
  MT: "two_party",
  NC: "one_party",
  ND: "one_party",
  NE: "one_party",
  NH: "two_party",
  NJ: "one_party",
  NM: "one_party",
  NV: "two_party", // Conservative — NRS 200.620 is two-party though federal is one-party.
  NY: "one_party",
  OH: "one_party",
  OK: "one_party",
  OR: "two_party",
  PA: "two_party",
  RI: "one_party",
  SC: "one_party",
  SD: "one_party",
  TN: "one_party",
  TX: "one_party",
  UT: "one_party",
  VA: "one_party",
  VT: "one_party",
  WA: "two_party",
  WI: "one_party",
  WV: "one_party",
  WY: "one_party",
};

export const CONSENT_RULE_VERSION = "2025.1";

const STATES_TWO_PARTY: string[] = Object.entries(STATE_CONSENT_RULES)
  .filter(([, rule]) => rule === "two_party")
  .map(([s]) => s);

const NORTH_AMERICAN_AREA_CODE_STATE: Record<string, string> = {
  // Compact subset of NANP area codes → state. Used for best-effort
  // jurisdiction inference when only a phone number is available.
  // Not exhaustive — when we miss, we fall back to the SAFER (two-party)
  // rule so we never under-disclose.
  "201": "NJ",
  "202": "DC",
  "203": "CT",
  "205": "AL",
  "206": "WA",
  "207": "ME",
  "208": "ID",
  "209": "CA",
  "210": "TX",
  "212": "NY",
  "213": "CA",
  "214": "TX",
  "215": "PA",
  "216": "OH",
  "217": "IL",
  "218": "MN",
  "219": "IN",
  "224": "IL",
  "225": "LA",
  "228": "MS",
  "231": "MI",
  "234": "OH",
  "239": "FL",
  "240": "MD",
  "248": "MI",
  "251": "AL",
  "252": "NC",
  "253": "WA",
  "254": "TX",
  "256": "AL",
  "260": "IN",
  "262": "WI",
  "267": "PA",
  "269": "MI",
  "270": "KY",
  "276": "VA",
  "281": "TX",
  "301": "MD",
  "302": "DE",
  "303": "CO",
  "304": "WV",
  "305": "FL",
  "307": "WY",
  "308": "NE",
  "309": "IL",
  "310": "CA",
  "312": "IL",
  "313": "MI",
  "314": "MO",
  "315": "NY",
  "316": "KS",
  "317": "IN",
  "318": "LA",
  "319": "IA",
  "320": "MN",
  "321": "FL",
  "323": "CA",
  "325": "TX",
  "330": "OH",
  "331": "IL",
  "334": "AL",
  "336": "NC",
  "337": "LA",
  "339": "MA",
  "347": "NY",
  "351": "MA",
  "352": "FL",
  "360": "WA",
  "361": "TX",
  "364": "KY",
  "380": "OH",
  "385": "UT",
  "386": "FL",
  "401": "RI",
  "402": "NE",
  "404": "GA",
  "405": "OK",
  "406": "MT",
  "407": "FL",
  "408": "CA",
  "409": "TX",
  "410": "MD",
  "412": "PA",
  "413": "MA",
  "414": "WI",
  "415": "CA",
  "417": "MO",
  "419": "OH",
  "423": "TN",
  "424": "CA",
  "425": "WA",
  "434": "VA",
  "435": "UT",
  "440": "OH",
  "443": "MD",
  "458": "OR",
  "464": "IL",
  "469": "TX",
  "470": "GA",
  "475": "CT",
  "478": "GA",
  "479": "AR",
  "480": "AZ",
  "484": "PA",
  "501": "AR",
  "502": "KY",
  "503": "OR",
  "504": "LA",
  "505": "NM",
  "507": "MN",
  "508": "MA",
  "509": "WA",
  "510": "CA",
  "512": "TX",
  "513": "OH",
  "515": "IA",
  "516": "NY",
  "517": "MI",
  "518": "NY",
  "520": "AZ",
  "530": "CA",
  "531": "NE",
  "534": "WI",
  "540": "VA",
  "541": "OR",
  "551": "NJ",
  "559": "CA",
  "561": "FL",
  "562": "CA",
  "563": "IA",
  "564": "WA",
  "567": "OH",
  "570": "PA",
  "571": "VA",
  "573": "MO",
  "574": "IN",
  "575": "NM",
  "580": "OK",
  "585": "NY",
  "586": "MI",
  "601": "MS",
  "602": "AZ",
  "603": "NH",
  "605": "SD",
  "606": "KY",
  "607": "NY",
  "608": "WI",
  "609": "NJ",
  "610": "PA",
  "612": "MN",
  "614": "OH",
  "615": "TN",
  "616": "MI",
  "617": "MA",
  "618": "IL",
  "619": "CA",
  "620": "KS",
  "623": "AZ",
  "626": "CA",
  "628": "CA",
  "629": "TN",
  "630": "IL",
  "631": "NY",
  "636": "MO",
  "641": "IA",
  "646": "NY",
  "650": "CA",
  "651": "MN",
  "660": "MO",
  "661": "CA",
  "662": "MS",
  "667": "MD",
  "669": "CA",
  "678": "GA",
  "681": "WV",
  "682": "TX",
  "701": "ND",
  "702": "NV",
  "703": "VA",
  "704": "NC",
  "706": "GA",
  "707": "CA",
  "708": "IL",
  "712": "IA",
  "713": "TX",
  "714": "CA",
  "715": "WI",
  "716": "NY",
  "717": "PA",
  "718": "NY",
  "719": "CO",
  "720": "CO",
  "724": "PA",
  "725": "NV",
  "727": "FL",
  "731": "TN",
  "732": "NJ",
  "734": "MI",
  "737": "TX",
  "740": "OH",
  "743": "NC",
  "747": "CA",
  "754": "FL",
  "757": "VA",
  "760": "CA",
  "762": "GA",
  "763": "MN",
  "765": "IN",
  "770": "GA",
  "772": "FL",
  "773": "IL",
  "774": "MA",
  "775": "NV",
  "779": "IL",
  "781": "MA",
  "785": "KS",
  "786": "FL",
  "801": "UT",
  "802": "VT",
  "803": "SC",
  "804": "VA",
  "805": "CA",
  "806": "TX",
  "808": "HI",
  "810": "MI",
  "812": "IN",
  "813": "FL",
  "814": "PA",
  "815": "IL",
  "816": "MO",
  "817": "TX",
  "818": "CA",
  "828": "NC",
  "830": "TX",
  "831": "CA",
  "832": "TX",
  "843": "SC",
  "845": "NY",
  "847": "IL",
  "848": "NJ",
  "850": "FL",
  "856": "NJ",
  "857": "MA",
  "858": "CA",
  "859": "KY",
  "860": "CT",
  "862": "NJ",
  "863": "FL",
  "864": "SC",
  "865": "TN",
  "870": "AR",
  "872": "IL",
  "878": "PA",
  "901": "TN",
  "903": "TX",
  "904": "FL",
  "906": "MI",
  "907": "AK",
  "908": "NJ",
  "909": "CA",
  "910": "NC",
  "912": "GA",
  "913": "KS",
  "914": "NY",
  "915": "TX",
  "916": "CA",
  "917": "NY",
  "918": "OK",
  "919": "NC",
  "920": "WI",
  "925": "CA",
  "928": "AZ",
  "929": "NY",
  "930": "IN",
  "931": "TN",
  "934": "NY",
  "936": "TX",
  "937": "OH",
  "940": "TX",
  "941": "FL",
  "947": "MI",
  "949": "CA",
  "951": "CA",
  "952": "MN",
  "954": "FL",
  "956": "TX",
  "959": "CT",
  "970": "CO",
  "971": "OR",
  "972": "TX",
  "973": "NJ",
  "975": "MO",
  "978": "MA",
  "979": "TX",
  "980": "NC",
  "984": "NC",
  "985": "LA",
  "989": "MI",
};

/**
 * Extract a 3-digit area code from a phone number. Tolerates +1, hyphens,
 * spaces, parentheses, and leading 1. Returns null if not a recognizable
 * NANP number.
 */
export function extractAreaCode(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = String(phone).replace(/\D+/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1, 4);
  if (digits.length === 10) return digits.slice(0, 3);
  return null;
}

/** Best-effort state inference from phone number. Returns `null` when unknown. */
export function inferStateFromPhone(phone: string | null | undefined): string | null {
  const code = extractAreaCode(phone);
  if (!code) return null;
  return NORTH_AMERICAN_AREA_CODE_STATE[code] || null;
}

/**
 * Get the consent rule for a phone number. Defaults to **two_party**
 * when state is unknown (safer — over-disclosing is never a violation,
 * under-disclosing is). Pass `defaultRule` to override.
 */
export function getConsentRuleForPhone(
  phone: string | null | undefined,
  defaultRule: ConsentRule = "two_party",
): { rule: ConsentRule; state: string | null; inferred: boolean } {
  const state = inferStateFromPhone(phone);
  if (state && STATE_CONSENT_RULES[state]) {
    return { rule: STATE_CONSENT_RULES[state], state, inferred: true };
  }
  return { rule: defaultRule, state, inferred: false };
}

/**
 * Build the recording-disclosure script the agent must say at call
 * start. For one-party jurisdictions a softer notice is acceptable;
 * for two-party we require an explicit opt-out path.
 */
export function buildConsentDisclosure(opts: {
  rule: ConsentRule;
  businessName?: string;
  state?: string | null;
}): string {
  const biz = opts.businessName?.trim() || "this business";
  if (opts.rule === "two_party") {
    return [
      `Hi — quick note before we begin: this call is being recorded for `,
      `quality, training, and compliance purposes by ${biz}. `,
      `If you'd prefer not to be recorded, please let me know now and `,
      `I'll either stop the recording or transfer you to a representative `,
      `who can help without one.`,
    ].join("");
  }
  return [
    `Just so you know, this call may be recorded for quality and `,
    `training purposes by ${biz}. `,
  ].join("");
}

/**
 * Full TCPA + state-recording outbound-call gate. Returns the action
 * the dialer must take before connecting (or whether it must abort).
 *
 * @param phone     The customer's phone number (E.164 or NANP-formatted).
 * @param flags     Account Holder + per-call compliance flags.
 */
export interface ConsentDecision {
  /** Allowed to dial? `false` means abort — caller is on a do-not-call list. */
  allowed: boolean;
  /** If allowed, the consent rule applicable to the destination. */
  rule: ConsentRule;
  /** State (USPS abbreviation) if successfully inferred. */
  state: string | null;
  /** Whether the dialer must play the recording disclosure. */
  must_disclose_recording: boolean;
  /** Whether the dialer must offer an opt-out path. */
  must_offer_opt_out: boolean;
  /** Reason for an `allowed: false` outcome, machine-readable. */
  abort_reason?: "dnc_internal" | "dnc_federal" | "no_express_consent_required";
  /** Suggested disclosure script (when must_disclose_recording=true). */
  disclosure_script?: string;
}

export interface ConsentInputs {
  phone: string;
  /** Set when this number appears on the Account Holder's per-tenant DNC list. */
  is_internal_dnc?: boolean;
  /** Set when this number appears on the federal DNC registry. */
  is_federal_dnc?: boolean;
  /**
   * For TCPA marketing/auto-dial calls, prior express written consent is
   * required. Inbound calls and lead-form opt-ins satisfy this; cold
   * outbound to a number we have no relationship with does not.
   */
  has_express_written_consent?: boolean;
  /** Treat call as marketing/auto-dial (true) or as servicing/relationship (false). */
  is_marketing_call?: boolean;
  /** Account Holder's business name to weave into the disclosure. */
  business_name?: string;
  /** Override the default-when-unknown jurisdiction rule. */
  default_rule?: ConsentRule;
}

export function evaluateOutboundConsent(input: ConsentInputs): ConsentDecision {
  if (input.is_internal_dnc) {
    return {
      allowed: false,
      rule: "two_party",
      state: null,
      must_disclose_recording: false,
      must_offer_opt_out: false,
      abort_reason: "dnc_internal",
    };
  }
  if (input.is_federal_dnc && input.is_marketing_call !== false) {
    return {
      allowed: false,
      rule: "two_party",
      state: null,
      must_disclose_recording: false,
      must_offer_opt_out: false,
      abort_reason: "dnc_federal",
    };
  }
  if (input.is_marketing_call && !input.has_express_written_consent) {
    return {
      allowed: false,
      rule: "two_party",
      state: null,
      must_disclose_recording: false,
      must_offer_opt_out: false,
      abort_reason: "no_express_consent_required",
    };
  }

  const { rule, state } = getConsentRuleForPhone(input.phone, input.default_rule ?? "two_party");
  const mustDisclose = true; // Wireline policy: always disclose recording.
  const mustOffer = rule === "two_party";
  return {
    allowed: true,
    rule,
    state,
    must_disclose_recording: mustDisclose,
    must_offer_opt_out: mustOffer,
    disclosure_script: buildConsentDisclosure({
      rule,
      businessName: input.business_name,
      state,
    }),
  };
}

/** Two-party jurisdictions, exposed for UI/admin views. */
export function listTwoPartyStates(): string[] {
  return [...STATES_TWO_PARTY].sort();
}

// ─────────────────────────────────────────────────────────────────────
// Consent ledger — persisted record of every disclosure played + every
// recorded opt-out. Append-only; never UPDATE rows once written.
// ─────────────────────────────────────────────────────────────────────

export type ConsentLedgerEvent =
  | "disclosure_played"
  // Logged when a call completed but the required recording disclosure could
  // NOT be evidenced in the transcript. Recording this honestly (instead of
  // asserting "disclosure_played" for every call) turns the ledger into a
  // real compliance monitor: a business record that claims a disclosure the
  // transcript contradicts is worse than no record in TCPA litigation.
  | "disclosure_not_detected"
  // No transcript/evidence was available, so delivery cannot be asserted either way.
  | "disclosure_unverifiable"
  | "consent_granted"
  | "consent_revoked"
  | "opt_out_requested"
  | "recording_started"
  | "recording_stopped";

export interface ConsentLedgerEntry {
  user_id: string;
  call_id?: string | null;
  customer_number: string;
  event: ConsentLedgerEvent;
  rule_version: string;
  rule: ConsentRule;
  state: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Build the row payload for a consent ledger insert. The actual db.insert
 * call lives at the integration site (server.ts) so this module stays
 * pure / testable.
 */
export interface ConsentLedgerRow {
  user_id: string;
  call_id: string | null;
  customer_number: string;
  event: ConsentLedgerEvent;
  rule_version: string;
  rule: ConsentRule;
  state: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export function buildConsentLedgerRow(entry: ConsentLedgerEntry): ConsentLedgerRow {
  return {
    user_id: entry.user_id,
    call_id: entry.call_id ?? null,
    customer_number: entry.customer_number,
    event: entry.event,
    rule_version: entry.rule_version,
    rule: entry.rule,
    state: entry.state,
    metadata: entry.metadata ?? {},
    created_at: new Date().toISOString(),
  };
}

type OptOutKind = "dnc" | "recording";
type OptOutPattern = { pattern: RegExp; kind: OptOutKind };

/**
 * Future-contact revocations are intentionally evaluated before recording-only
 * revocations. A caller can say both in one call; DNC must win regardless of
 * where either phrase appears or how this list is ordered.
 */
const DNC_OPT_OUT_PATTERNS: OptOutPattern[] = [
  {
    pattern:
      /\b(?:do\s+not|don['’]?t|never)\s+(?:call|contact)\s+(?:me|us|this\s+number|my\s+number)(?:\s+again)?\b/i,
    kind: "dnc",
  },
  {
    pattern:
      /\bstop\s+(?:calling|contacting)\s+(?:me|us|this\s+number|my\s+number)\b/i,
    kind: "dnc",
  },
  {
    pattern:
      /\b(?:take|remove)\s+me\s+(?:off|from)\s+(?:(?:your|the)\s+)?(?:(?:call|calling|contact)\s+)?list\b/i,
    kind: "dnc",
  },
  {
    pattern: /\bput\s+me\s+on\s+(?:(?:your|the)\s+)?do[- ]not[- ]call\s+list\b/i,
    kind: "dnc",
  },
  { pattern: /\bno\s+more\s+(?:calls?|calling|contact)\b/i, kind: "dnc" },
];

const RECORDING_OPT_OUT_PATTERNS: OptOutPattern[] = [
  { pattern: /\bdo\s+not\s+record\b/i, kind: "recording" },
  { pattern: /\bdon['’]?t\s+record\b/i, kind: "recording" },
  { pattern: /\bstop\s+recording\b/i, kind: "recording" },
  { pattern: /\bturn\s+off\s+(the\s+)?recording\b/i, kind: "recording" },
  {
    pattern: /\bi\s+do\s+not\s+consent\s+to\s+(the\s+|this\s+)?recording\b/i,
    kind: "recording",
  },
];

function firstOptOutMatch(
  transcript: string,
  patterns: OptOutPattern[],
): { found: true; matched_pattern: string; kind: OptOutKind } | null {
  for (const { pattern, kind } of patterns) {
    const match = transcript.match(pattern);
    if (match) return { found: true, matched_pattern: match[0], kind };
  }
  return null;
}

/**
 * Detect explicit opt-out language in a transcript. Conservative: only
 * unambiguous future-contact or recording revocations match; soft rejection
 * such as "I'm not interested" does not.
 */
export function detectOptOut(transcript: string | null | undefined): {
  found: boolean;
  matched_pattern?: string;
  kind?: OptOutKind;
} {
  if (!transcript) return { found: false };
  return (
    firstOptOutMatch(transcript, DNC_OPT_OUT_PATTERNS) ||
    firstOptOutMatch(transcript, RECORDING_OPT_OUT_PATTERNS) ||
    { found: false }
  );
}

/**
 * Detect that the recording disclosure was actually delivered on the call by
 * matching the disclosure language in the transcript. Mirrors the phrasings
 * emitted by buildConsentDisclosure() ("this call is being recorded …",
 * "this call may be recorded …") plus close paraphrases an LLM agent may use.
 *
 * Conservative on purpose: it matches the *agent's* disclosure phrasing, not
 * a generic mention of the word "recorded", so a caller saying "are you
 * recording this?" does not by itself count as the agent having disclosed.
 *
 * Used by the post-call consent-ledger writer to decide between logging
 * `disclosure_played` (with the matched line as evidence) and
 * `disclosure_not_detected`. When no transcript is available the caller must
 * treat delivery as *unverifiable* rather than assuming either outcome.
 */
const RECORDING_DISCLOSURE_PATTERNS: RegExp[] = [
  /\bthis call (?:is being|is|may be|will be|could be) recorded\b/i,
  /\byour call (?:is being|is|may be|will be) recorded\b/i,
  /\b(?:the )?call (?:is being|may be|will be) recorded for\b/i,
  /\brecorded for (?:quality|training|compliance)\b/i,
  /\bbeing recorded for (?:quality|training|compliance)\b/i,
];

export function detectRecordingDisclosure(transcript: string | null | undefined): {
  found: boolean;
  /** A short excerpt around the matched disclosure, for the ledger evidence field. */
  excerpt?: string;
  matched_pattern?: string;
} {
  if (!transcript) return { found: false };
  for (const pat of RECORDING_DISCLOSURE_PATTERNS) {
    const m = transcript.match(pat);
    if (m && typeof m.index === "number") {
      const start = Math.max(0, m.index - 24);
      const end = Math.min(transcript.length, m.index + m[0].length + 64);
      const excerpt = transcript.slice(start, end).replace(/\s+/g, " ").trim();
      return { found: true, excerpt, matched_pattern: m[0] };
    }
  }
  return { found: false };
}
