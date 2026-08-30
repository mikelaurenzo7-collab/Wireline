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
 *   - 2 BotBound specialists (Sarah, Liam) — real CS/sales lines with owner
 *     escalation tools. Used in /help + /support, NOT on the landing page.
 *   - 7 vertical / skill demos — role-play showcases with NO owner escalation.
 *     Jordan + Jake are the two primary landing-page demos (inbound CS +
 *     outbound sales).
 *
 * Used in:
 *   1. Landing page — LANDING_PUBLIC_DEMO_AGENTS only (demo lines)
 *   2. In-app /help route — specialists + full demo catalog
 *   3. Founder fleet seeding — persists each OpenAI Realtime runtime profile
 *
 * Specialist lines can escalate via `escalate_to_human`. Demo lines cannot.
 *
 * Voice design: every agent uses a documented OpenAI Realtime voice so browser
 * and SIP calls sound identical across the public fleet.
 */

export type ContactAgent = {
  name: string;
  role: string;
  scope: string;
  /** First-message template the agent opens calls with — keep it short, warm, scope-clear. */
  firstMessage: string;
  /** OpenAI Realtime voice used by browser and SIP calls. */
  openaiVoiceId: "alloy" | "ash" | "ballad" | "coral" | "echo" | "sage" | "shimmer" | "verse" | "marin" | "cedar";
  /** Human label for marketing cards and audit logs. */
  voiceLabel?: string;
  /** Comma-joined list of bucket labels this agent should handle. Used by routing logic in the CS playbook. */
  handles: string;
  tel: string;
  display: string;
  tint: string;
  /**
   * Default personality vibe for this showcase agent. Used by
   * the founder seed when persisting each OpenAI Realtime profile.
   */
  defaultVibe: "warm" | "playful" | "authoritative";
};

/**
 * The 2 BotBound specialists. All on (630) numbers for company
 * uniformity. Each can answer verified product questions, guide callers
 * through self-service signup, email secure links, and record a human
 * follow-up request. Account-specific changes still require the relevant
 * authenticated workflow or a confirmed human follow-up.
 */
const ALL_ENCOMPASSING_SCOPE =
  "A BotBound front-line specialist who answers verified product, pricing, setup, " +
  "onboarding, and general troubleshooting questions. Can email a Free Builder " +
  "signup link or secure checkout link after confirmation, and can record a " +
  "callback or escalation request for team review. Does not create accounts, " +
  "issue refunds, change plans, alter billing, or promise a response time on the call.";

const ALL_ENCOMPASSING_HANDLES =
  "general, how-to, account guidance, pricing, plans, demo, billing questions, " +
  "signup link, payment link, API, webhooks, integration, voice quality, " +
  "onboarding, training, success, troubleshooting, enterprise";

export const WIRELINE_CONTACT_AGENTS: ReadonlyArray<ContactAgent> = [
  {
    name: "Sarah",
    role: "BotBound Specialist",
    scope: ALL_ENCOMPASSING_SCOPE,
    firstMessage: "Hey, Sarah with BotBound. Who do I have the pleasure of speaking with today?",
    voiceLabel: "Marin · Natural & Expressive",
    openaiVoiceId: "marin",
    handles: ALL_ENCOMPASSING_HANDLES,
    tel: "+16306425661",
    display: "(630) 642-5661",
    tint: CONTACT_AGENT_TINTS.primary,
    defaultVibe: "warm",
  },
  {
    name: "Liam",
    role: "BotBound Specialist",
    scope: ALL_ENCOMPASSING_SCOPE,
    firstMessage:
      "Hey, Liam with BotBound. I can walk you through plans, setup, or anything technical. Who am I speaking with?",
    voiceLabel: "Cedar · Grounded & Clear",
    openaiVoiceId: "cedar",
    handles: ALL_ENCOMPASSING_HANDLES,
    tel: "+16305811834",
    display: "(630) 581-1834",
    tint: CONTACT_AGENT_TINTS.deep,
    defaultVibe: "playful",
  },
];

/**
 * 7 vertical / skill demo agents — each role-plays one industry BotBound
 * sells into (plus Jordan for inbound CS and Jake for outbound sales).
 */
export const WIRELINE_DEMO_AGENTS: ReadonlyArray<ContactAgent> = [
  {
    name: "Jordan",
    role: "Inbound Customer Service Demo",
    scope:
      "Role-plays a small-business front desk: captures why the caller reached out, " +
      "schedules service or callback windows, answers common FAQs, and takes clean messages. " +
      "Home-services / general inbound CS showcase; never pages a human owner.",
    firstMessage:
      "Hi, Jordan on the BotBound inbound demo. I'll answer as your front desk. What's your name?",
    voiceLabel: "Verse · Smooth & Professional",
    openaiVoiceId: "verse",
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
      "Asks which BotBound demo the caller wants to hear, then role-plays that agent live: home services, medical, legal, real estate, insurance, restaurant, or outbound sales.",
    firstMessage:
      "Hey, Ria here. I can demo medical, legal, home services, insurance, real estate, or outbound sales. Which one sounds fun?",
    voiceLabel: "Coral · Warm & Conversational",
    openaiVoiceId: "coral",
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
      "Runs a synthetic clinic-scheduling role-play using fictional details only. It does not collect real patient, health, or insurance information. BotBound is not HIPAA-certified, and HIPAA and BAA support are not currently available.",
    firstMessage:
      "Good afternoon. Marcus on the BotBound medical demo. Please use fictional details and don't share health information. What kind of appointment should we role-play?",
    voiceLabel: "Cedar · Grounded & Clear",
    openaiVoiceId: "cedar",
    handles: "medical demo, healthcare demo, synthetic clinic scheduling, appointment role-play",
    tel: "+16173134469",
    display: "(617) 313-4469",
    tint: CONTACT_AGENT_TINTS.muted,
    defaultVibe: "authoritative",
  },
  {
    name: "Diana",
    role: "Law Firm Demo",
    scope:
      "Role-plays a law-firm intake line: runs the conflict check, captures matter type and urgency, books the consultation, takes a clean intake for the attorney.",
    firstMessage: "Diana here. BotBound legal intake demo. May I have your full name?",
    voiceLabel: "Marin · Natural & Expressive",
    openaiVoiceId: "marin",
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
      "Role-plays a real-estate front desk: answers listing inquiries, qualifies buyer budget + timeline, books showings, captures seller leads.",
    firstMessage:
      "Aisha here. BotBound real estate demo. Are you calling about a listing or looking to buy?",
    voiceLabel: "Coral · Warm & Conversational",
    openaiVoiceId: "coral",
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
      "Role-plays an insurance line: handles quote intake, walks claimants through first-notice-of-loss, captures incident detail, opens the case file.",
    firstMessage:
      "Elena with the BotBound insurance demo. Are you starting a quote or reporting a claim?",
    voiceLabel: "Marin · Natural & Expressive",
    openaiVoiceId: "marin",
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
      "Role-plays a cold-call SDR: calls a lead from a CSV, qualifies fit with a BANT pass, books discovery calls with closers, logs results to CRM.",
    firstMessage:
      "Hey, Jake on the BotBound outbound sales demo. You're hearing a live SDR open. Who's this?",
    voiceLabel: "Ash · Calm & Direct",
    openaiVoiceId: "ash",
    handles: "outbound, cold call, SDR, prospecting, qualification, BANT",
    tel: "+14692571581",
    display: "(469) 257-1581",
    tint: CONTACT_AGENT_TINTS.deep,
    defaultVibe: "playful",
  },
];

/** Real specialist line for /support and Account Holder-facing help — not landing CTAs. */
export const WIRELINE_FEATURED_TEAM_AGENT = WIRELINE_CONTACT_AGENTS[0]!;

/** Primary public demos on the landing page — no owner escalation. */
export const LANDING_PUBLIC_DEMO_AGENTS: ReadonlyArray<ContactAgent> = [
  WIRELINE_DEMO_AGENTS.find((a) => a.name === "Jordan")!,
  WIRELINE_DEMO_AGENTS.find((a) => a.name === "Jake")!,
];

/** All public lines — specialists + demos. Used for catalog invariants. */
export const ALL_SHOWCASE_CONTACT_AGENTS: ReadonlyArray<ContactAgent> = [
  ...WIRELINE_CONTACT_AGENTS,
  ...WIRELINE_DEMO_AGENTS,
];
