/**
 * Single source of truth for the 10 AI agents featured on the landing
 * page + in the in-app /help console.
 *
 * Layout (per Mike's call): 3 Wireline employees + 7 vertical demo
 * agents. The 3 employees all run on (630) numbers for company
 * uniformity — they ARE Wireline's customer-service team and route to
 * each other when a call lands on the wrong line. The 7 demo agents
 * each role-play one industry vertical Wireline sells into.
 *
 * Used in:
 *   1. Landing page — public "talk to Wireline" CTAs
 *   2. In-app /help route — signed-in operators reach the same agents
 *      without leaving the console.
 *   3. /api/admin/sync-vapi-knowledge — resolves each tel back to its
 *      Vapi assistantId via the live number list, then PATCHes the
 *      assistant's system prompt with the latest Wireline knowledge
 *      (and points serverUrl at trywireline.com).
 *
 * Each tel is a live Vapi-routed number — calls hit the matching
 * assistant + can escalate to a human via `escalate_to_human`
 * (POSTs to /api/escalate).
 */

export type ContactAgent = {
  name: string;
  role: string;
  scope: string;
  /** First-message template the agent opens calls with — keep it short, warm, scope-clear. */
  firstMessage: string;
  /** Public showcase lines are pinned to a specific ElevenLabs voice so syncs cannot drift. */
  voiceId?: string;
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
};

/**
 * The 3 Wireline employees. All on (630) numbers for company
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
    voiceId: "EXAVITQu4vr4xnSDxMaL",
    handles: ALL_ENCOMPASSING_HANDLES,
    tel: "+16306425661",
    display: "(630) 642-5661",
    tint: "#0A0A0A",
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
    tint: "#0A0A0A",
    defaultVibe: "playful",
    voiceId: "TX3LPaxmHKxFdv7VOQHJ",
  },
  {
    name: "Maya",
    role: "Wireline Specialist",
    scope: ALL_ENCOMPASSING_SCOPE,
    firstMessage: "Hi, thanks for calling Wireline — this is Maya. Who am I speaking with?",
    voiceId: "XB0fDUnXU5powFXDhCwa",
    handles: ALL_ENCOMPASSING_HANDLES,
    tel: "+16306425927",
    display: "(630) 642-5927",
    tint: "#0A0A0A",
    defaultVibe: "warm",
  },
];

/**
 * 7 vertical demo agents — each role-plays one industry Wireline
 * sells into, so a prospect can call the line for their own vertical
 * and hear exactly what their customers would experience.
 */
export const WIRELINE_DEMO_AGENTS: ReadonlyArray<ContactAgent> = [
  {
    name: "Ria",
    role: "Demo Concierge",
    scope:
      "Asks which Wireline demo the caller wants to hear, then role-plays that agent live: home services, medical, legal, real estate, insurance, restaurant, or outbound sales.",
    firstMessage:
      "Thanks for calling Wireline — this is Ria, your demo concierge. Which kind of agent would you like to hear: home services, medical, legal, real estate, insurance, restaurant, or outbound sales?",
    voiceId: "TxGEqnHWrfWFTfGW9XjX",
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
    voiceId: "pNInz6obpgDQGcFmaJgB",
    handles: "medical, healthcare, clinic, patient intake, appointment",
    tel: "+16173134469",
    display: "(617) 313-4469",
    tint: "#10B981",
    defaultVibe: "authoritative",
  },
  {
    name: "Diana",
    role: "Law Firm Demo",
    scope:
      "Role-plays a law-firm intake line — runs the conflict check, captures matter type and urgency, books the consultation, takes a clean intake for the attorney.",
    firstMessage:
      "Thanks for calling the Wireline Legal demo — this is Diana. May I have your name?",
    voiceId: "XB0fDUnXU5powFXDhCwa",
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
    voiceId: "21m00Tcm4TlvDq8ikWAM",
    handles: "real estate, realtor, listing, showing, buyer, seller lead",
    tel: "+19733638874",
    display: "(973) 363-8874",
    tint: "#FFC07D",
    defaultVibe: "playful",
  },
  {
    name: "Elena",
    role: "Insurance Demo",
    scope:
      "Role-plays an insurance line — handles quote intake, walks claimants through first-notice-of-loss, captures incident detail, opens the case file.",
    firstMessage:
      "Thanks for calling the Wireline Insurance demo — this is Elena. Can I start with your name?",
    voiceId: "bIHbv24MWmeRgasZH58o",
    handles: "insurance, claim, loss, FNOL, quote, policy",
    tel: "+19044601596",
    display: "(904) 460-1596",
    tint: "#06b6d4",
    defaultVibe: "authoritative",
  },
  {
    name: "Nico",
    role: "Restaurant Demo",
    scope:
      "Role-plays a restaurant phone host — takes reservations, captures takeout orders accurately, handles allergen questions, fields private-event inquiries.",
    firstMessage:
      "Thanks for calling the Wireline restaurant demo — this is Nico! Who am I speaking with?",
    voiceId: "pNInz6obpgDQGcFmaJgB",
    handles: "restaurant, reservation, takeout, catering, private event",
    tel: "+12075935155",
    display: "(207) 593-5155",
    tint: "#f43f5e",
    defaultVibe: "playful",
  },
  {
    name: "Jake",
    role: "Outbound Sales / SDR Demo",
    scope:
      "Role-plays a cold-call SDR — calls a lead from a CSV, qualifies fit with a BANT pass, books discovery calls with closers, logs results to CRM.",
    firstMessage:
      "Hey, thanks for calling the Wireline SDR demo — this is Jake. Who am I speaking with?",
    voiceId: "yoZ06aMxZJJ28mfd3POQ",
    handles: "outbound, cold call, SDR, prospecting, qualification, BANT",
    tel: "+14692571581",
    display: "(469) 257-1581",
    tint: "#f59e0b",
    defaultVibe: "playful",
  },
];

export const WIRELINE_FEATURED_TEAM_AGENT = WIRELINE_CONTACT_AGENTS[0]!;
