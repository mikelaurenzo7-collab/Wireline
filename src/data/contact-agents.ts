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
 */

export type ContactAgent = {
  name: string;
  role: string;
  scope: string;
  /** First-message template the agent opens calls with — keep it short, warm, scope-clear. */
  firstMessage: string;
  /** Public showcase lines are pinned to a specific ElevenLabs voice so syncs cannot drift. */
  voiceId?: string;
  /** Optional ElevenLabs fine-tuning overrides (defaults in showcase-assistant.ts). */
  voiceSettings?: {
    stability?: number;
    similarityBoost?: number;
    style?: number;
    speed?: number;
  };
  /** Comma-joined list of bucket labels this agent should handle. Used by routing logic in the CS playbook. */
  handles: string;
  tel: string;
  display: string;
  tint: string;
  /**
   * Default personality vibe for this showcase agent. Used by
   * /api/admin/sync-vapi-knowledge when pushing the system prompt
   * to each Vapi assistant — the right vibe per agent role.
   * "warm" for general CS / billing / success / tech (trustworthy
   * default), "playful" for sales / onboarding / outbound /
   * customer-facing-retail (memorable, differentiating),
   * "authoritative" for healthcare / insurance / legal-style
   * intake (gravity when it matters).
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
  "to the right department' — every employee can do everything.";

const ALL_ENCOMPASSING_HANDLES =
  "general, how-to, account, pricing, plans, demo, billing, invoice, refund, " +
  "signup, create account, payment link, API, webhooks, integration, voice quality, " +
  "onboarding, training, success, troubleshooting, enterprise";

export const WIRELINE_CONTACT_AGENTS: ReadonlyArray<ContactAgent> = [
  {
    name: "Sarah",
    role: "Wireline Specialist",
    scope: ALL_ENCOMPASSING_SCOPE,
    firstMessage:
      "Hi, thanks for calling Wireline — this is Sarah. Who do I have the pleasure of speaking with?",
    // Rachel · Warm — flagship Wireline CS voice.
    voiceId: "21m00Tcm4TlvDq8ikWAM",
    voiceSettings: {
      stability: 0.58,
      style: 0.2,
      similarityBoost: 0.9,
      speed: 0.95,
    },
    handles: ALL_ENCOMPASSING_HANDLES,
    tel: "+16306425661",
    display: "(630) 642-5661",
    tint: "#6B2B99",
    defaultVibe: "warm",
  },
  {
    name: "Liam",
    role: "Wireline Specialist",
    scope: ALL_ENCOMPASSING_SCOPE,
    firstMessage: "Hey, thanks for calling Wireline — this is Liam. Who am I speaking with?",
    handles: ALL_ENCOMPASSING_HANDLES,
    tel: "+16305811834",
    display: "(630) 581-1834",
    tint: "#6B2B99",
    defaultVibe: "playful",
    // Liam · Confident & Energetic — matches the agent name.
    voiceId: "TX3LPaxmHKxFdv7VOQHJ",
    voiceSettings: { stability: 0.55, style: 0.15, similarityBoost: 0.88, speed: 0.98 },
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
      "Thanks for calling the Wireline customer-service demo — this is Jordan. Who am I speaking with?",
    // Sarah Soft · Warm & Approachable — friendly front-desk, distinct from Sarah's Rachel.
    voiceId: "EXAVITQu4vr4xnSDxMaL",
    voiceSettings: {
      stability: 0.62,
      style: 0.08,
      similarityBoost: 0.88,
      speed: 0.95,
    },
    handles:
      "customer service, inbound, front desk, scheduling, FAQ, message taking, home services, after hours",
    tel: "+16306425927",
    display: "(630) 642-5927",
    tint: "#6B2B99",
    defaultVibe: "warm",
  },
  {
    name: "Ria",
    role: "Demo Concierge",
    scope:
      "Asks which Wireline demo the caller wants to hear, then role-plays that agent live: home services, medical, legal, real estate, insurance, restaurant, or outbound sales.",
    firstMessage:
      "Thanks for calling Wireline — this is Ria, your demo concierge. Which kind of agent would you like to hear: home services, medical, legal, real estate, insurance, restaurant, or outbound sales?",
    // Josh · Upbeat — energetic concierge who routes callers to vertical demos.
    voiceId: "TxGEqnHWrfWFTfGW9XjX",
    voiceSettings: { stability: 0.5, style: 0.25, similarityBoost: 0.85, speed: 1.0 },
    handles:
      "demo concierge, choose demo, home services, HVAC, plumbing, electrical, medical, legal, real estate, insurance, restaurant, outbound, SDR",
    tel: "+15642389455",
    display: "(564) 238-9455",
    tint: "#f59e0b",
    defaultVibe: "playful",
  },
  {
    name: "Marcus",
    role: "Medical Practice Demo",
    scope:
      "Role-plays a clinic front desk — greets patients, captures reason for visit, schedules appointments, handles insurance pre-check. Healthcare-style demo; not currently HIPAA-certified (BAA available on the Enterprise roadmap).",
    firstMessage:
      "Thanks for calling the Wireline Medical demo — this is Marcus. May I have your name?",
    // Brian · Deep & Narrative — calm clinical gravitas.
    voiceId: "nPczCjzI2devNBz1zQrb",
    voiceSettings: { stability: 0.72, style: 0.05, similarityBoost: 0.9, speed: 0.92 },
    handles: "medical, healthcare, clinic, patient intake, appointment",
    tel: "+16173134469",
    display: "(617) 313-4469",
    tint: "#6B2B99",
    defaultVibe: "authoritative",
  },
  {
    name: "Diana",
    role: "Law Firm Demo",
    scope:
      "Role-plays a law-firm intake line — runs the conflict check, captures matter type and urgency, books the consultation, takes a clean intake for the attorney.",
    firstMessage:
      "Thanks for calling the Wireline Legal demo — this is Diana. May I have your name?",
    // Charlotte · British, Refined — perfect law-firm intake tone.
    voiceId: "XB0fDUnXU5powFXDhCwa",
    voiceSettings: { stability: 0.68, style: 0.08, similarityBoost: 0.92, speed: 0.94 },
    handles: "legal, law firm, intake, conflict check, consultation",
    tel: "+15727269365",
    display: "(572) 726-9365",
    tint: "#8b5cf6",
    defaultVibe: "authoritative",
  },
  {
    name: "Aisha",
    role: "Real Estate Demo",
    scope:
      "Role-plays a real-estate front desk — answers listing inquiries, qualifies buyer budget + timeline, books showings, captures seller leads.",
    firstMessage:
      "Thanks for calling the Wireline Realty demo — this is Aisha. Who am I speaking with?",
    // Elli · Bright & Youthful — upbeat realtor energy.
    voiceId: "MF3mGyEYCl7XYWbV9V6O",
    voiceSettings: { stability: 0.52, style: 0.22, similarityBoost: 0.86, speed: 1.02 },
    handles: "real estate, realtor, listing, showing, buyer, seller lead",
    tel: "+19733638874",
    display: "(973) 363-8874",
    tint: "#C4B5A0",
    defaultVibe: "playful",
  },
  {
    name: "Elena",
    role: "Insurance Demo",
    scope:
      "Role-plays an insurance line — handles quote intake, walks claimants through first-notice-of-loss, captures incident detail, opens the case file.",
    firstMessage:
      "Thanks for calling the Wireline Insurance demo — this is Elena. Can I start with your name?",
    // Rachel · Calm & Professional — steady claims-line composure.
    voiceId: "bIHbv24MWmeRgasZH58o",
    voiceSettings: { stability: 0.7, style: 0.06, similarityBoost: 0.9, speed: 0.93 },
    handles: "insurance, claim, loss, FNOL, quote, policy",
    tel: "+19044601596",
    display: "(904) 460-1596",
    tint: "#06b6d4",
    defaultVibe: "authoritative",
  },
  {
    name: "Jake",
    role: "Outbound Sales Demo",
    scope:
      "Role-plays a cold-call SDR — calls a lead from a CSV, qualifies fit with a BANT pass, books discovery calls with closers, logs results to CRM.",
    firstMessage:
      "Hey, thanks for calling the Wireline sales demo — this is Jake. Who am I speaking with?",
    // Sam · Young & Casual — high-energy SDR cold-call vibe.
    voiceId: "yoZ06aMxZJJ28mfd3POQ",
    voiceSettings: { stability: 0.48, style: 0.28, similarityBoost: 0.84, speed: 1.05 },
    handles: "outbound, cold call, SDR, prospecting, qualification, BANT",
    tel: "+14692571581",
    display: "(469) 257-1581",
    tint: "#f59e0b",
    defaultVibe: "playful",
  },
];

/** Real employee line for /support and operator-facing help — not landing CTAs. */
export const WIRELINE_FEATURED_TEAM_AGENT = WIRELINE_CONTACT_AGENTS[0]!;

/** Primary public demos on the landing page — no owner escalation. */
export const LANDING_PUBLIC_DEMO_AGENTS: ReadonlyArray<ContactAgent> = [
  WIRELINE_DEMO_AGENTS.find((a) => a.name === "Jordan")!,
  WIRELINE_DEMO_AGENTS.find((a) => a.name === "Jake")!,
];
