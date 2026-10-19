// ────────────────────────────────────────────────────────────────────────
//  Agent runtime — the bridge between an agent's stored business profile
//  (hours, compliance mode, variables, guardrails) and the live system
//  prompt that gets handed to Vapi/Claude on every call.
//
//  Pure functions only. No DB, no I/O. The server loads the agent row +
//  current time, calls these helpers, and ships the result.
//
//  Every helper is tested in src/lib/agent-runtime.test.ts.
// ────────────────────────────────────────────────────────────────────────

export type ComplianceMode = "none" | "hipaa" | "pci" | "gdpr" | "financial" | "legal" | "tcpa";

export type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

/**
 * A single day's open/close window. Both fields are 24h "HH:MM" strings.
 * `closed: true` overrides the times — the agent never engages on that day.
 */
export interface DayHours {
  open?: string;
  close?: string;
  closed?: boolean;
}

export type BusinessHours = Partial<Record<DayOfWeek, DayHours>>;

/**
 * The shape stored in wireline_agents — read-side only. The server is
 * tolerant of partial/null values; defaults are applied here.
 */
export interface AgentRuntimeProfile {
  timezone?: string | null;
  business_hours?: BusinessHours | null;
  compliance_mode?: ComplianceMode | string | null;
  disallowed_topics?: string[] | null;
  escalation_keywords?: string[] | null;
  business_variables?: Record<string, string | number> | null;
  out_of_hours_message?: string | null;
  kpi_focus?: string | null;
  /**
   * Personality vibe — drives the moat directive injected into the
   * system prompt. "warm" (default), "playful", "authoritative".
   * Source: agents.personalityVibe column.
   */
  personality_vibe?: string | null;
}

import { buildVibeBlock } from "./personality-vibes";

const DAY_INDEX: Record<DayOfWeek, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};
const DAY_KEYS = Object.keys(DAY_INDEX) as DayOfWeek[];

/**
 * Convert "HH:MM" → minutes since midnight. Returns null on bad input
 * (callers default to "always open" rather than "always closed" when
 * the schedule is malformed — surface gating bugs as availability, not
 * silent rejection).
 */
function parseHHMM(s?: string): number | null {
  if (!s || typeof s !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59)
    return null;
  return h * 60 + min;
}

/**
 * Get the local day-of-week + minutes-since-midnight for a given Date in
 * the agent's timezone. Pure JS Intl.DateTimeFormat — works in Node and
 * the browser without extra deps.
 */
function localizeNow(now: Date, timeZone: string): { day: DayOfWeek; minutes: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      weekday: "short",
    });
    parts = fmt.formatToParts(now);
  } catch {
    // Bad timezone string — fall back to UTC so we still produce *some*
    // gating signal rather than crashing the call path.
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      weekday: "short",
    });
    parts = fmt.formatToParts(now);
  }
  const wkdy = parts.find((p) => p.type === "weekday")?.value || "Mon";
  const hh = parts.find((p) => p.type === "hour")?.value || "00";
  const mm = parts.find((p) => p.type === "minute")?.value || "00";
  // Intl 'short' weekday in en-US → Mon, Tue, Wed, Thu, Fri, Sat, Sun
  const wkLower = wkdy.toLowerCase().slice(0, 3) as DayOfWeek;
  const day = DAY_KEYS.includes(wkLower) ? wkLower : "mon";
  // 24:00 sometimes appears for midnight in Intl en-US — normalize.
  const hour = (Number(hh) % 24) | 0;
  const minute = (Number(mm) % 60) | 0;
  return { day, minutes: hour * 60 + minute };
}

/**
 * Is the agent currently inside its business hours?
 *
 * Empty / undefined business_hours → always "in hours" (the default —
 * agents created before this feature shipped don't suddenly stop
 * answering). A day with `closed: true` is closed. A day with both
 * `open` and `close` set requires `open <= now < close`. Overnight
 * windows (close < open, e.g. 22:00 → 06:00) wrap correctly.
 */
export function isWithinBusinessHours(
  profile: AgentRuntimeProfile | null | undefined,
  now: Date = new Date(),
): boolean {
  const hours = profile?.business_hours;
  if (!hours || typeof hours !== "object" || Object.keys(hours).length === 0) return true;

  const tz = profile?.timezone || "America/New_York";
  const { day, minutes } = localizeNow(now, tz);
  const today = hours[day];
  if (!today) return true; // no rule for today → don't gate
  if (today.closed) return false;

  const open = parseHHMM(today.open);
  const close = parseHHMM(today.close);
  if (open == null || close == null) return true; // malformed → don't gate
  if (open === close) return false; // zero-length window ([open, open)) is never open

  if (close > open) {
    // Same-day window: open <= now < close
    return minutes >= open && minutes < close;
  }
  // Overnight window (e.g. 22:00 → 06:00): now >= open OR now < close
  return minutes >= open || minutes < close;
}

/**
 * Compliance presets — opt-in guardrails woven into the agent's SYSTEM prompt.
 * The text is short and intentionally generic; account holders must consult
 * counsel for the binding language in their jurisdiction.
 *
 * A system-prompt instruction alone does not GUARANTEE what the agent says
 * first, so modes with an at-start-of-call disclosure requirement (currently
 * `tcpa`) also get a spoken disclosure prepended to the opening line — see
 * complianceFirstMessagePrefix().
 *
 * 'none' returns an empty block.
 */
export function complianceDisclosure(mode: ComplianceMode | string | null | undefined): string {
  switch (mode) {
    case "hipaa":
      return [
        "## COMPLIANCE: HIPAA",
        "Treat all caller-provided health information as PHI:",
        "- Verify identity (full name + date of birth + one secondary identifier) before discussing any account or health detail.",
        "- Never repeat or summarize PHI to anyone other than the verified caller or a documented authorized representative.",
        "- If a caller asks for medical advice, decline and offer to schedule a clinician consult.",
      ].join("\n");
    case "pci":
      return [
        "## COMPLIANCE: PCI DSS",
        "Cardholder data handling:",
        "- Do not record, repeat, or write down card numbers, expiry dates, or CVVs.",
        "- For payment, route the caller to the secure IVR or send a tokenized payment link.",
        '- Acknowledge receipt without restating the value: "I have your card details, processing now."',
      ].join("\n");
    case "gdpr":
      return [
        "## COMPLIANCE: GDPR",
        "Personal data handling:",
        "- Disclose at the start of the call that the conversation is recorded for service quality, retained for the Account Holder-specified period, and that the caller has rights of access, rectification, and erasure.",
        '- Honor opt-out, deletion, and "speak to a human" requests immediately.',
      ].join("\n");
    case "financial":
      return [
        "## COMPLIANCE: Financial services",
        "Regulated-conduct guardrails:",
        "- Do not provide tax, investment, or specific financial advice. Offer to schedule a licensed advisor.",
        "- Quote products and rates only when explicitly stored in your knowledge base; never improvise figures.",
        '- Disclose any required statements (e.g. "Calls may be recorded for quality and compliance.") at the start of the call.',
      ].join("\n");
    case "legal":
      return [
        "## COMPLIANCE: Legal services",
        "Unauthorized-practice guardrails:",
        "- Do not provide legal advice. You may share general public information only.",
        "- Schedule consultations with the attorney rather than answering jurisdictional questions.",
        '- State on the first interaction: "This conversation does not establish an attorney-client relationship."',
      ].join("\n");
    case "tcpa":
      // AI-voice / automated-calling disclosure. Grounded in the FCC's Feb 8, 2024
      // Declaratory Ruling (FCC 24-17), which classifies AI-generated voices as
      // "artificial or prerecorded voice" under the TCPA — with no carve-out for
      // tech that "purports to provide the equivalent of a live agent" — and
      // requires identification of the entity responsible for the call.
      // Explicit AI identification is BotBound policy; FCC 24-84 was a proposal.
      // Generic by design;
      // Account Holders must confirm the binding language for their jurisdiction.
      return [
        "## COMPLIANCE: TCPA (AI voice disclosure)",
        "Automated / AI-voice calling rules:",
        "- At the start of the call, clearly disclose that this is an automated AI assistant, and state the name of the business you are calling on behalf of.",
        '- Honor any "do not call", "stop calling", "remove me", or opt-out request immediately: confirm the removal, do not re-solicit, and end the call.',
        '- Honor "speak to a human" / "is this a real person" requests directly and without deflecting.',
        "- Do not place or continue a marketing or telemarketing call without verified prior express written consent from this recipient for this business and purpose.",
      ].join("\n");
    case "none":
    default:
      return "";
  }
}

/**
 * Spoken opening disclosure. Outbound AI calls identify the automation and
 * responsible entity regardless of a tenant-selected preset. Any call that
 * Wireline records also receives a compact recording notice. The `tcpa`
 * preset keeps its legacy AI disclosure behavior for inbound calls.
 *
 * Telemarketing calls additionally announce the voice-activated opt-out
 * mechanism immediately after the identity sentence. 47 CFR 64.1200(b)(3)
 * requires telemarketing artificial/prerecorded-voice calls — which FCC 24-17
 * confirms includes AI-generated voices — to provide an automated, interactive
 * voice- and/or keypress-activated opt-out mechanism WITH a brief explanation
 * of how to use it, within two seconds of the 64.1200(b)(1) identification.
 * The conversational agent itself is the voice-activated mechanism (backed by
 * the add_to_dnc tool and the post-call transcript DNC failsafe); this
 * sentence is the required explanation, so it must directly follow the
 * identity sentence, ahead of the recording notice.
 */
export function complianceFirstMessagePrefix(
  mode: ComplianceMode | string | null | undefined,
  businessName?: string | null,
  options?: {
    outboundAiCall?: boolean;
    recordingEnabled?: boolean;
    /** True for marketing_or_sales calls — appends the 64.1200(b)(3) opt-out announcement. */
    telemarketing?: boolean;
  },
): string {
  const shouldDiscloseAi = mode === "tcpa" || options?.outboundAiCall === true;
  const shouldDiscloseRecording = options?.recordingEnabled === true;
  const shouldAnnounceOptOut = options?.telemarketing === true;
  if (!shouldDiscloseAi && !shouldDiscloseRecording && !shouldAnnounceOptOut) return "";

  const name = (businessName ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  const sentences: string[] = [];
  if (shouldDiscloseAi) {
    const onBehalf = name ? ` on behalf of ${name}` : "";
    sentences.push(`This call uses an automated AI assistant${onBehalf}.`);
  }
  if (shouldAnnounceOptOut) {
    sentences.push("You can say stop calling at any time to be placed on the do not call list.");
  }
  if (shouldDiscloseRecording) {
    sentences.push("This call may be recorded for quality and compliance.");
  }
  return `${sentences.join(" ")} `;
}

const CALLBACK_DIGIT_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
] as const;

function speakDigitChunk(digits: string): string {
  return [...digits].map((digit) => CALLBACK_DIGIT_WORDS[Number(digit)] || digit).join(" ");
}

/**
 * 64.1200(b)(2) requires a spoken callback number, not merely caller ID.
 * Group NANP numbers the way a person would read them so Speech-to-Speech
 * does not slur "+15551234567" into an unusable string.
 */
export function formatCallbackNumberForSpeech(value: string | null | undefined): string {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length === 10) {
    return `${speakDigitChunk(national.slice(0, 3))}, ${speakDigitChunk(national.slice(3, 6))}, ${speakDigitChunk(national.slice(6))}`;
  }
  return speakDigitChunk(national);
}

/**
 * Soft topic guardrails — produces a directive block instructing the
 * agent to refuse or redirect when a disallowed topic comes up. Empty
 * input returns an empty string.
 */
export function disallowedTopicsBlock(topics: string[] | null | undefined): string {
  if (!Array.isArray(topics) || topics.length === 0) return "";
  const safe = topics
    .map((t) => (typeof t === "string" ? t.trim() : ""))
    .filter(Boolean)
    .slice(0, 24); // upper bound to keep the prompt budget in line
  if (safe.length === 0) return "";
  return [
    "## DO-NOT-DISCUSS TOPICS",
    "You must not discuss the following topics. If a caller raises one, briefly acknowledge that you are not the right channel and offer to route them to the appropriate team:",
    safe.map((t) => `- ${t}`).join("\n"),
  ].join("\n");
}

/**
 * Escalation triggers — words/phrases that force an immediate human
 * handoff regardless of normal escalation logic. Matched case-insensitively.
 * Returns a directive block describing the rule; the actual matching
 * happens at the conversation-update message level (handled in the
 * webhook flow), not in this string.
 */
export function escalationKeywordsBlock(keywords: string[] | null | undefined): string {
  if (!Array.isArray(keywords) || keywords.length === 0) return "";
  const safe = keywords
    .map((k) => (typeof k === "string" ? k.trim() : ""))
    .filter(Boolean)
    .slice(0, 24);
  if (safe.length === 0) return "";
  return [
    "## IMMEDIATE-ESCALATION TRIGGERS",
    "If the caller uses any of these phrases or asks about any of these topics, escalate to a human IMMEDIATELY using the escalate_to_human tool. Do not attempt to resolve yourself:",
    safe.map((k) => `- ${k}`).join("\n"),
  ].join("\n");
}

/**
 * Replace `{variable}` placeholders in `text` with values from `vars`.
 * Unknown variables are left intact (so the Account Holder can spot them in
 * test calls). Values are coerced to strings; very long values are
 * truncated at 500 chars to keep the prompt budget bounded.
 */
export function applyBusinessVariables(
  text: string,
  vars: Record<string, string | number> | null | undefined,
): string {
  if (!text || !vars) return text;
  return text.replace(/\{([a-zA-Z_][a-zA-Z0-9_]{0,40})\}/g, (full, key) => {
    if (!Object.prototype.hasOwnProperty.call(vars, key)) return full;
    const v = vars[key];
    if (v == null) return full;
    const s = String(v);
    return s.length > 500 ? s.slice(0, 500) + "…" : s;
  });
}

/**
 * KPI focus → a single line appended to the system prompt that nudges
 * the agent toward the Account Holder-selected outcome. Subtle — the actual
 * scoring happens server-side post-call, but a focused agent
 * out-performs an unfocused one on its target metric.
 */
export function kpiFocusLine(focus: string | null | undefined): string {
  switch (focus) {
    case "conversions":
      return "PRIMARY OUTCOME: every call should advance toward a concrete commitment (booked appointment, signed agreement, paid order).";
    case "qualifications":
      return "PRIMARY OUTCOME: every call should produce a clean BANT/MEDDIC qualification record. Pipeline quality over volume.";
    case "resolutions":
      return "PRIMARY OUTCOME: every call should resolve the caller's issue end-to-end. Aim for first-contact resolution; never punt.";
    case "satisfaction":
      return "PRIMARY OUTCOME: every call should leave the caller feeling heard, respected, and better than when they started.";
    case "general":
    default:
      return "";
  }
}

/**
 * Compose the final runtime prompt the call layer ships to Vapi.
 *
 *   basePrompt  — the role-derived system prompt assembled by the caller
 *                 (existing logic in placeOutboundCall builds this).
 *   profile     — the agent row's business-profile fields.
 *   now         — current Date (injected for testability).
 *
 * Returns:
 *   prompt          — the augmented system prompt
 *   inHours         — boolean; false means the caller should run the
 *                     out-of-hours flow (voicemail / message playback).
 *   outOfHoursMessage — the Account Holder's custom message, if set.
 */
export interface RuntimeBuildResult {
  prompt: string;
  inHours: boolean;
  outOfHoursMessage: string | null;
}

export const RUNTIME_ACTION_SAFETY_BLOCK = `## ACTION AND RESULT SAFETY
- Enabled tools and server permissions define what you can do. A role, template, Training item, or Account Holder instruction never grants a capability by itself.
- State that an external action happened, a record changed, or a delivery time is confirmed only after the relevant enabled tool explicitly reports success.
- If a tool is unavailable, fails, times out, or returns an uncertain result, say the action was not confirmed and offer a safe next step without promising timing.
- Before sending a customer email or saving an email follow-up request, read back the exact email address and wait for the caller to confirm it. Use that confirmed address; never guess a spelling or correction.
- A saved follow-up request is not a sent email. Say a request was saved only after a tool confirms persistence. If email is unavailable, offer a manual follow-up only when an enabled task tool can save it; otherwise give a direct contact option.
- Never tell a caller to look out for an email or check their inbox when sending is unconfirmed. A successful submission does not prove inbox delivery. After an uncertain send, do not retry automatically; leave manual review to avoid duplicates.
- Get the caller's confirmation before a consequential change. Never expose secrets or request sensitive data a tool does not require.`;

export const RUNTIME_VOICE_DELIVERY_CONSISTENCY_BLOCK = `## VOICE AND DELIVERY CONSISTENCY
- Use this Bot's selected voice for the whole session. Never switch speakers or characters mid-call. The Account Holder can choose a different OpenAI voice for this Bot between sessions.
- Keep the configured identity and personality recognizable throughout the call. Consistent does not mean monotone.
- Adapt delivery to the moment: be concise with a rushed caller, slow down for names and numbers, show care when someone is distressed, and use the level of formality the situation requires.
- Do not mechanically mimic the caller or impersonate another person. Adjust pace, warmth, energy, and wording without losing this Bot's configured personality.
- Treat knowledge, facts, and directives as background you have internalized. Paraphrase naturally instead of reciting a list or sounding like a brochure.
- Playbook lines marked word for word are the exception: say them exactly as written.`;

export function buildAgentRuntimeContext(
  basePrompt: string,
  profile: AgentRuntimeProfile | null | undefined,
  now: Date = new Date(),
): RuntimeBuildResult {
  const inHours = isWithinBusinessHours(profile, now);

  const sections: string[] = [];

  // Sections only get appended if they have content — keeps the prompt
  // tight when the Account Holder hasn't configured anything.
  const compliance = complianceDisclosure(profile?.compliance_mode ?? "none");
  if (compliance) sections.push(compliance);

  const disallowed = disallowedTopicsBlock(profile?.disallowed_topics);
  if (disallowed) sections.push(disallowed);

  const escalation = escalationKeywordsBlock(profile?.escalation_keywords);
  if (escalation) sections.push(escalation);

  const kpi = kpiFocusLine(profile?.kpi_focus);
  if (kpi) sections.push(kpi);

  // Personality vibe — the agent moat. Injected as its own section so
  // the LLM treats it as first-class guidance, not optional flavor.
  // Empty when vibe is unset / unknown so legacy agents stay unaffected.
  const vibeBlock = buildVibeBlock(profile?.personality_vibe);
  if (vibeBlock) sections.push(vibeBlock.trim());

  // Always finish tenant-owned prompt material with one provider-neutral
  // capability boundary. Role prose, template playbooks, Training, and saved
  // overrides can describe intended work, but only the actual tool surface can
  // authorize or prove an external side effect.
  sections.push(RUNTIME_ACTION_SAFETY_BLOCK);

  // Voice and delivery consistency is appended to every assistant so the
  // selected speaker and configured identity remain recognizable without
  // forcing a flat, context-blind performance.
  sections.push(RUNTIME_VOICE_DELIVERY_CONSISTENCY_BLOCK);

  const composed = sections.length > 0 ? `${basePrompt}\n\n${sections.join("\n\n")}` : basePrompt;

  // Apply variable substitution as the FINAL step so it can fill
  // placeholders in BOTH the base prompt and any compliance / guardrail
  // sections we just appended.
  const prompt = applyBusinessVariables(composed, profile?.business_variables);

  const outOfHoursMessage = inHours
    ? null
    : typeof profile?.out_of_hours_message === "string" && profile.out_of_hours_message.trim()
      ? applyBusinessVariables(profile.out_of_hours_message.trim(), profile?.business_variables)
      : null;

  return { prompt, inHours, outOfHoursMessage };
}

/**
 * Resolve the base identity prompt for a Vapi assistant.
 *
 * Priority: Account Holder override → Wireline persona overlay → auto-composed.
 *
 * When an Account Holder override is present (non-empty after trimming) it
 * REPLACES the base identity, exactly the way the persona overlay does:
 * the override text leads and the call-specific dynamic context blocks
 * (caller profile, intel, sentiment, lead, flow, personality,
 * directives, knowledge, lessons, date) are appended after it. The
 * auto-composed prompt already embeds those dynamic blocks inline, so it
 * is returned untouched.
 *
 * This function deliberately does NOT add the runtime guardrails
 * (compliance / escalation / do-not-discuss / voice-consistency) — those
 * are layered on afterwards by buildAgentRuntimeContext, so they can
 * never be silently dropped by an override.
 */
export function resolveAssistantBasePrompt(opts: {
  override?: string | null;
  personaPrompt?: string | null;
  autoComposedPrompt: string;
  callSpecificContext: string;
}): string {
  const override = typeof opts.override === "string" ? opts.override.trim() : "";
  if (override) {
    return `${override}\n\n${opts.callSpecificContext}`;
  }
  const persona = typeof opts.personaPrompt === "string" ? opts.personaPrompt.trim() : "";
  if (persona) {
    return `${persona}\n\n${opts.callSpecificContext}`;
  }
  return opts.autoComposedPrompt;
}
