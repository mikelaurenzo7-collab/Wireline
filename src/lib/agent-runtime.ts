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

import { OUTBOUND_OPT_OUT_NOTICE, OUTBOUND_RECORDING_NOTICE } from "./voice/outbound-opening";

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
/** Saved account zone wins. A blank zone keeps the previous Eastern fallback. */
export const BUSINESS_HOURS_FALLBACK_TIME_ZONE = "America/New_York";

export function businessHoursTimeZone(profile: AgentRuntimeProfile | null | undefined): string {
  const zone = profile?.timezone?.trim();
  return zone || BUSINESS_HOURS_FALLBACK_TIME_ZONE;
}

export function isWithinBusinessHours(
  profile: AgentRuntimeProfile | null | undefined,
  now: Date = new Date(),
): boolean {
  const hours = profile?.business_hours;
  if (!hours || typeof hours !== "object" || Object.keys(hours).length === 0) return true;

  const tz = businessHoursTimeZone(profile);
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

const WEEK_ORDER: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_NAMES: Record<DayOfWeek, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

function clockInWords(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const half = hour < 12 ? "AM" : "PM";
  return minute === 0
    ? `${hour12} ${half}`
    : `${hour12}:${String(minute).padStart(2, "0")} ${half}`;
}

/**
 * The saved weekly hours in plain words, for a Bot to answer "when are you
 * open?": "Monday to Friday 8 AM to 5 PM. Saturday 9 AM to 1 PM. Sunday
 * closed." Empty when no hours are saved, so a Bot is never told hours nobody
 * set.
 *
 * Every day is named once any is saved, read the way `isWithinBusinessHours`
 * reads it: Set Up saves a day that is open all day as a day with no rule, so
 * a missing day is "open all day", and so is one whose times cannot be read.
 * Leaving those days out told a Bot the business keeps Friday hours only while
 * the same Bot was told it was open on a Tuesday.
 */
export function businessHoursInWords(hours: unknown): string {
  if (!hours || typeof hours !== "object" || Array.isArray(hours)) return "";
  const rules = hours as Partial<
    Record<DayOfWeek, { open?: string; close?: string; closed?: boolean } | null>
  >;
  const saved = (day: DayOfWeek) => {
    const rule = rules[day];
    return rule && typeof rule === "object" ? rule : null;
  };
  if (!WEEK_ORDER.some((day) => saved(day))) return "";
  const groups: Array<{ from: DayOfWeek; to: DayOfWeek; text: string }> = [];
  WEEK_ORDER.forEach((day, index) => {
    const rule = saved(day);
    const open = parseHHMM(rule?.open);
    const close = parseHHMM(rule?.close);
    const text = !rule
      ? "open all day"
      : rule.closed
        ? "closed"
        : open == null || close == null
          ? "open all day"
          : open === close
            ? "closed"
            : `${clockInWords(open)} to ${clockInWords(close)}`;
    const last = groups.at(-1);
    if (last && last.text === text && WEEK_ORDER.indexOf(last.to) === index - 1) last.to = day;
    else groups.push({ from: day, to: day, text });
  });
  if (!groups.length) return "";
  return `${groups
    .map(
      (group) =>
        `${group.from === group.to ? DAY_NAMES[group.from] : `${DAY_NAMES[group.from]} to ${DAY_NAMES[group.to]}`} ${group.text}`,
    )
    .join(". ")}.`;
}

/**
 * The owner's saved weekly hours, and whether the business is open right now.
 * Empty when no hours are saved. Until this existed a Bot on a call was never
 * given the hours at all: an owner who entered them heard the Bot offer to
 * take a message when a caller asked what time the business closes. Text
 * replies were given them as raw JSON.
 */
export function businessHoursContext(
  agent: { businessHours?: unknown; timezone?: string | null },
  now = new Date(),
): string {
  const hours = businessHoursInWords(agent.businessHours);
  if (!hours) return "";
  const profile = {
    business_hours: agent.businessHours as never,
    timezone: agent.timezone ?? null,
  };
  // The day and time are given in the zone the hours are kept in, beside
  // them. A Bot with no zone of its own is told the date in UTC, and the
  // after-hours message-taker is told no date at all, so "when do you next
  // open?" had no answer from the hours alone.
  const zone = businessHoursTimeZone(profile);
  const state = isWithinBusinessHours(profile, now) ? "open" : "closed";
  let clock = "";
  try {
    clock = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      weekday: "long",
      hour: "numeric",
      minute: "2-digit",
    }).format(now);
  } catch {
    // A zone that cannot be read leaves the clock out; the hours still stand.
  }
  return [
    `BUSINESS HOURS (${zone}): ${hours}`,
    `${clock ? `It is ${clock} there, and the` : "The"} business is ${state} right now. Say these hours when someone asks when the business is open. They are opening hours, not appointment availability.`,
  ].join("\n");
}

/**
 * Compliance presets: the conduct rules a Bot follows when its owner sets a
 * compliance mode. The text is short and intentionally generic; account
 * holders must consult counsel for the binding language in their jurisdiction.
 *
 * These reach a live call through `ownerLimitsBlock`. For a long time they did
 * not: the builder that printed them was replaced, and a Bot set to HIPAA was
 * told only "Compliance mode: hipaa." while this text sat unused.
 *
 * A system-prompt instruction alone does not GUARANTEE what the agent says
 * first, so modes with an at-start-of-call disclosure requirement (currently
 * `tcpa`) also get a spoken disclosure prepended to the opening line: see
 * complianceFirstMessagePrefix().
 *
 * 'none' and the stored default 'standard' return an empty block.
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
        "- Never ask for, record, repeat, or write down card numbers, expiry dates, or CVVs. You cannot take a payment on the call.",
        "- If the caller starts reading a card number, stop them politely before they finish and say the team will send a secure way to pay or take it directly.",
        "- Offer a message for the team about the payment; never say a payment was taken or is being processed.",
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
 * A compliance mode as lines any prompt can carry: the mode's conduct rules,
 * or its name when it has no preset. Empty for 'none' and for 'standard',
 * the stored default, which tells a Bot nothing.
 */
export function complianceRulesText(mode: string | null | undefined): string {
  const value = String(mode ?? "").trim();
  if (!value || value === "none" || value === "standard") return "";
  const preset = complianceDisclosure(value);
  return preset ? preset.replace(/^#+\s*/gm, "") : `Compliance mode: ${value.slice(0, 80)}.`;
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
    sentences.push(OUTBOUND_OPT_OUT_NOTICE);
  }
  if (shouldDiscloseRecording) {
    sentences.push(OUTBOUND_RECORDING_NOTICE);
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

export const RUNTIME_ACTION_SAFETY_BLOCK = `## ACTION AND RESULT SAFETY
- Enabled tools and server permissions define what you can do. A role, template, Training item, or Account Holder instruction never grants a capability by itself.
- State that an external action happened, a record changed, or a delivery time is confirmed only after the relevant enabled tool explicitly reports success.
- If a tool is unavailable, fails, times out, or returns an uncertain result, say the action was not confirmed and offer a safe next step without promising timing.
- A correction replaces the previous request. Acknowledge it once and act on the corrected department, service or contact detail. Carry forward facts the caller already confirmed, including their exact spelling. Ask how to spell a name only when the distinction matters and you are unsure.
- If a destination or calendar cannot be verified, offer a message for that team. Once the caller accepts, stay with the message. Ask one question for the missing contact detail and save it with create_followup_task when enabled. Resume scheduling only if the caller asks again and a matching calendar is verified.
- A request for confirmation refers to the current action. Confirm a saved callback request as a request. Only send a booking confirmation after a successful booking. For email approval queues, report a pending request accurately and never promise delivery before submission.
- Before sending a customer email or saving an email follow-up request, read back the exact email address and wait for the caller to confirm it. Use that confirmed address; never guess a spelling or correction.
- A caller asking you to email information has already requested that send. Once the address is confirmed and the requested content is clear, call the enabled send_email tool immediately. Do not ask "Shall I send it?" again, read the draft aloud, or substitute a spoken overview for the requested email. Ask a new question only if a necessary detail is missing or the requested action changes.
- Keep requested email content in the email. Before the tool call, a brief "Of course" is enough; saying "sending it" does not perform the send. After confirmed submission, say something natural such as "I've sent that over. Is there anything else I can help with?" and pause. If the caller is already saying goodbye, close warmly without another question. Give an overview aloud only if the caller asks to hear it too.
- In a requested email summary, include relevant verified website, pricing, or booking URLs from this Bot's approved knowledge, configured business website, or successful tool results when they help fulfill the request. Preserve the exact URLs. Never invent a URL or path, add unrelated promotion, or substitute BotBound links for another business.
- The mail service adds this Bot's configured business signature. Supply the requested message body without a second sign-off, invented contact details, or internal test and verification notes.
- Include prices, channels, and features only when current approved knowledge or a successful lookup verifies them; actions must also be enabled for this Bot. Caller assumptions and earlier Bot statements are not verification. If pricing is unverified or sources conflict, omit the price and include a verified pricing page when available.
- A saved follow-up request is not a sent email. Say a request was saved only after a tool confirms persistence. If email is unavailable, offer a manual follow-up only when an enabled task tool can save it; otherwise give a direct contact option.
- When a tool confirms email submission or returns SUBMISSION_OK, tell the caller the email was sent to the confirmed address. Unverified inbox arrival does not mean sending failed. Do not offer to retry an accepted send. Only claim inbox delivery when the recipient or a delivery result confirms it.
- Never tell a caller to look out for an email or check their inbox when sending is unconfirmed. A successful submission does not prove inbox delivery. After an uncertain send, do not retry automatically; leave manual review to avoid duplicates.
- Get the caller's confirmation before a consequential change. Never expose secrets or request sensitive data a tool does not require.`;

export const RUNTIME_VOICE_DELIVERY_CONSISTENCY_BLOCK = `## VOICE AND DELIVERY CONSISTENCY
- Use this Bot's selected voice for the whole session. Never switch speakers or characters mid-call.
- Keep the configured identity and personality recognizable; consistent is not monotone.
- Use the saved opening greeting once. When the phone connection supplies the opening, continue with the caller’s first request. If asked whether you are AI, answer plainly and truthfully. Never claim to be human.
- Talk like a capable person at this business: contractions, short sentences, one question at a time. After a correction, move to the next useful step.
- Never narrate your work (searching, checking, looking up, tools) or mention records, a knowledge base, or verification. If you need a moment, say "One sec." and then answer; when the Playbook gives a line for asking the caller to wait, say that line instead.
- If you do not know, say so plainly and offer the next step: "I'm not sure. I can take a message for the team."
- If you could not make out what the caller said, ask them to say it again; never guess. Noise or another voice in the room is not a request.
- To book, ask for the day and time first, then name and contact. Do not ask about departments the caller did not raise.
- Confirm a detail once. Do not spell names letter by letter unless asked. After a yes, do not repeat it; ask for the next thing.
- Vary or skip acknowledgments. Do not open consecutive replies with the same word. If the caller is mid-thought, wait.
- Adapt delivery to the moment: be concise with a rushed caller, slow down for names, say phone numbers and codes digit by digit in short groups, show care when someone is distressed, and match the formality the situation requires.
- Do not mimic the caller or impersonate anyone. Adjust pace, warmth and wording to them.
- Treat knowledge and directives as background you know. Paraphrase; never recite a list or sound like a brochure.
- Playbook lines marked word for word are the exception: say them exactly as written.`;
