import { BRAND } from "../constants/brand-colors";

/** Mono card tints — semantic surface tokens for in-app help + marketing cards. */
export const CONTACT_AGENT_TINTS = {
  primary: BRAND.colors.primary,
  deep: BRAND.colors.primaryVariant,
  muted: BRAND.colors.onSurfaceMuted,
  cream: BRAND.colors.outlineVariant,
} as const;

/**
 * Single source of truth for public showcase phone lines.
 *
 * Layout:
 *   - 2 Wireline employees (Sarah, Liam) — real CS/sales lines with owner
 *     escalation tools. Used in /help + /support, NOT on the landing page.
 *   - 7 vertical / skill demos — role-play showcases with NO owner escalation.
 *     Jordan + Jake are the two primary landing-page demos (inbound CS +
 *     outbound sales).
 *
 * Used in:
 *   1. Landing page — LANDING_PUBLIC_DEMO_AGENTS only (demo lines)
 *   2. In-app /help route — employees + full demo catalog
 *   3. /api/admin/sync-vapi-knowledge — PATCHes each Vapi assistant prompt
 *
 * Employee lines can escalate via `escalate_to_human`. Demo lines cannot.
 *
 * Voice design: every agent uses a curated Vapi managed voice (V2 roster)
 * so prospects hear a varied, role-authentic team — not the same voice on
 * every line. Sync via POST /api/admin/sync-vapi-knowledge after edits.
 */

export type ContactAgent = {
  name: string;
  role: string;
  scope: string;
  /** First-message template the agent opens calls with — keep it short, warm, scope-clear. */
  firstMessage: string;
  /** Vapi curated voice ID (e.g. "Savannah", "Elliot"). All showcase lines use provider: "vapi". */
  vapiVoiceId?: string;
  /** Human label for marketing cards / sync logs — not sent to Vapi. */
  voiceLabel?: string;
  /** Comma-joined list of bucket labels this agent should handle. Used by routing logic in the CS playbook. */
  handles: string;
  tel: string;
  display: string;
  tint: string;
  /**
   * Default personality vibe for this showcase agent. Used by
   * /api/admin/sync-vapi-knowledge when pushing the system prompt
   * to each Vapi assistant — the right vibe per agent role.
   */
  defaultVibe: "warm" | "playful" | "authoritative";
  /**
   * STT override — default is Flux EOT everywhere. Set "nova-livekit" only
   * for experiments / rollback.
   */
  transcriberMode?: "nova-livekit" | "flux-eot";
};

/**
 * The 2 Wireline employees. All on (630) numbers for company
 * uniformity. Each is a FULL GENERALIST — every employee can handle
 * every kind of Wireline call: support, pricing, billing, technical,
 * onboarding, success. They can also sign a caller up for a Wireline
 * account on the spot. No call ever needs to be "transferred to the
 * right department" — whoever picks up can do it all.
 */
const ALL_ENCOMPASSING_SCOPE =
  "A complete Wireline specialist — handles every kind of call end to end: " +
  "general support and how-to, account help, pricing and plan comparison, " +
  "ROI questions, enterprise quotes, billing (invoices, refunds, plan changes, " +
  "overages), technical questions (integrations, webhooks, API, voice quality, " +
  "CRM sync), onboarding, and customer success. Can email a sign-up link, email " +
  "a payment/checkout link, AND create a Wireline account for the caller right " +
  "on the call if they want to sign up by phone. Never says 'let me transfer you " +
  "to the right department' — every employee can do it all.";

const ALL_ENCOMPASSING_HANDLES =
  "general, how-to, account, pricing, plans, demo, billing, invoice, refund, " +
  "signup, create account, payment link, API, webhooks, integration, voice quality, " +
  "onboarding, training, success, troubleshooting, enterprise";

export const WIRELINE_CONTACT_AGENTS: ReadonlyArray<ContactAgent> = [
  {
    name: "Sarah",
    role: "Wireline Specialist",
    scope: ALL_ENCOMPASSING_SCOPE,
    firstMessage: "Hey — Sarah with Wireline. Who do I have the pleasure of speaking with today?",
    voiceLabel: "Savannah · Warm & Confident",
    vapiVoiceId: "Savannah",
    handles: ALL_ENCOMPASSING_HANDLES,
    tel: "+16306425661",
    display: "(630) 642-5661",
    tint: CONTACT_AGENT_TINTS.primary,
    defaultVibe: "warm",
  },
  {
    name: "Liam",
    role: "Wireline Specialist",
    scope: ALL_ENCOMPASSING_SCOPE,
    firstMessage:
      "Hey — Liam with Wireline. I can walk you through plans, setup, or anything technical. Who am I speaking with?",
    voiceLabel: "Elliot · Steady & Professional",
    vapiVoiceId: "Elliot",
    handles: ALL_ENCOMPASSING_HANDLES,
    tel: "+16305811834",
    display: "(630) 581-1834",
    tint: CONTACT_AGENT_TINTS.deep,
    defaultVibe: "playful",
  },
];

/**
 * 7 vertical / skill demo agents — each role-plays one industry Wireline
 * sells into (plus Jordan for inbound CS and Jake for outbound sales).
 */
export const WIRELINE_DEMO_AGENTS: ReadonlyArray<ContactAgent> = [
  {
    name: "Jordan",
    role: "Inbound Customer Service Demo",
    scope:
      "Role-plays a small-business front desk — captures why the caller reached out, " +
      "schedules service or callback windows, answers common FAQs, and takes clean messages. " +
      "Home-services / general inbound CS showcase; never pages a human owner.",
    firstMessage:
      "Hi — Jordan on the Wireline inbound demo. I'll answer as your front desk — what's your name?",
    voiceLabel: "Kai · Friendly & Relaxed",
    vapiVoiceId: "Kai",
    handles:
      "customer service, inbound, front desk, scheduling, FAQ, message taking, home services, after hours",
    tel: "+16306425927",
    display: "(630) 642-5927",
    tint: CONTACT_AGENT_TINTS.primary,
    defaultVibe: "warm",
  },
  {
    name: "Ria",
    role: "Demo Concierge",
    scope:
      "Asks which Wireline demo the caller wants to hear, then role-plays that agent live: home services, medical, legal, real estate, insurance, restaurant, or outbound sales.",
    firstMessage:
      "Hey, Ria here — I can demo medical, legal, home services, insurance, real estate, or outbound sales. Which one sounds fun?",
    voiceLabel: "Emma · Warm & Conversational",
    vapiVoiceId: "Emma",
    handles:
      "demo concierge, choose demo, home services, HVAC, plumbing, electrical, medical, legal, real estate, insurance, restaurant, outbound, SDR",
    tel: "+15642389455",
    display: "(564) 238-9455",
    tint: CONTACT_AGENT_TINTS.deep,
    defaultVibe: "playful",
  },
  {
    name: "Marcus",
    role: "Medical Practice Demo",
    scope:
      "Role-plays a clinic front desk — greets patients, captures reason for visit, schedules appointments, handles insurance pre-check. Healthcare-style demo; not currently HIPAA-certified (BAA available on the Enterprise roadmap).",
    firstMessage:
      "Good afternoon — Marcus on the Wireline medical demo. May I have your name, please?",
    voiceLabel: "Sagar · Steady & Professional",
    vapiVoiceId: "Sagar",
    handles: "medical, healthcare, clinic, patient intake, appointment",
    tel: "+16173134469",
    display: "(617) 313-4469",
    tint: CONTACT_AGENT_TINTS.muted,
    defaultVibe: "authoritative",
  },
  {
    name: "Diana",
    role: "Law Firm Demo",
    scope:
      "Role-plays a law-firm intake line — runs the conflict check, captures matter type and urgency, books the consultation, takes a clean intake for the attorney.",
    firstMessage: "Diana here — Wireline legal intake demo. May I have your full name?",
    voiceLabel: "Clara · Warm & Professional",
    vapiVoiceId: "Clara",
    handles: "legal, law firm, intake, conflict check, consultation",
    tel: "+15727269365",
    display: "(572) 726-9365",
    tint: CONTACT_AGENT_TINTS.primary,
    defaultVibe: "authoritative",
  },
  {
    name: "Aisha",
    role: "Real Estate Demo",
    scope:
      "Role-plays a real-estate front desk — answers listing inquiries, qualifies buyer budget + timeline, books showings, captures seller leads.",
    firstMessage:
      "Aisha here — Wireline real estate demo. Are you calling about a listing or looking to buy?",
    voiceLabel: "Layla · Warm & Cheerful",
    vapiVoiceId: "Layla",
    handles: "real estate, realtor, listing, showing, buyer, seller lead",
    tel: "+19733638874",
    display: "(973) 363-8874",
    tint: CONTACT_AGENT_TINTS.cream,
    defaultVibe: "playful",
  },
  {
    name: "Elena",
    role: "Insurance Demo",
    scope:
      "Role-plays an insurance line — handles quote intake, walks claimants through first-notice-of-loss, captures incident detail, opens the case file.",
    firstMessage:
      "Elena with the Wireline insurance demo — are you starting a quote or reporting a claim?",
    voiceLabel: "Naina · Calm & Professional",
    vapiVoiceId: "Naina",
    handles: "insurance, claim, loss, FNOL, quote, policy",
    tel: "+19044601596",
    display: "(904) 460-1596",
    tint: CONTACT_AGENT_TINTS.muted,
    defaultVibe: "authoritative",
  },
  {
    name: "Jake",
    role: "Outbound Sales Demo",
    scope:
      "Role-plays a cold-call SDR — calls a lead from a CSV, qualifies fit with a BANT pass, books discovery calls with closers, logs results to CRM.",
    firstMessage:
      "Hey — Jake on the Wireline outbound sales demo. You're hearing a live SDR open — who's this?",
    voiceLabel: "Godfrey · Young & Energetic",
    vapiVoiceId: "Godfrey",
    handles: "outbound, cold call, SDR, prospecting, qualification, BANT",
    tel: "+14692571581",
    display: "(469) 257-1581",
    tint: CONTACT_AGENT_TINTS.deep,
    defaultVibe: "playful",
  },
];

/** Real employee line for /support and Account Holder-facing help — not landing CTAs. */
export const WIRELINE_FEATURED_TEAM_AGENT = WIRELINE_CONTACT_AGENTS[0]!;

/** Primary public demos on the landing page — no owner escalation. */
export const LANDING_PUBLIC_DEMO_AGENTS: ReadonlyArray<ContactAgent> = [
  WIRELINE_DEMO_AGENTS.find((a) => a.name === "Jordan")!,
  WIRELINE_DEMO_AGENTS.find((a) => a.name === "Jake")!,
];

/** All public lines — employees + demos. Used for catalog invariants. */
export const ALL_SHOWCASE_CONTACT_AGENTS: ReadonlyArray<ContactAgent> = [
  ...WIRELINE_CONTACT_AGENTS,
  ...WIRELINE_DEMO_AGENTS,
];
