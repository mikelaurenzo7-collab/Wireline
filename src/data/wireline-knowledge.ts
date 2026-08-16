/**
 * Canonical Wireline product knowledge - the single source of truth that gets:
 *   1. Injected into every Vapi agent system prompt as a "WIRELINE KNOWLEDGE" block.
 *   2. Rendered in the in-app /help route so signed-in account holders see the same story.
 *   3. Referenced by public-facing demo and marketing surfaces.
 */

export const WIRELINE_URL = "https://trywireline.com";
export const WIRELINE_SUPPORT_EMAIL = "support@trywireline.com";

export const WIRELINE_ONE_LINER =
  "Wireline runs calls, texts, follow-up, browser context, email, and integrations through trained agents that stay on your playbook.";

export const WIRELINE_VOICE_STACK =
  "Live calls run through the managed Wireline voice bridge with low-latency transcription, speech, and an OpenAI-first conversation runtime. Provider routing and fallbacks are managed by Wireline and can change without changing the customer workflow.";

export const WIRELINE_PLANS = [
  {
    name: "Wireline Free Builder",
    price: "Free to create, train, and privately simulate",
    bestFor: "Trying Wireline before going live.",
    includes: [
      "One private draft agent",
      "Full setup, training, and knowledge tools unlocked",
      "Private simulation only: no live calls, texts, or number until you activate a paid plan",
    ],
  },
  {
    name: "Wireline Starter",
    price: "$19/mo",
    bestFor: "Solo or founder use going live for the first time.",
    includes: [
      "1 live agent and 1 production number, provisioned when needed",
      "50 guaranteed live-voice minutes each month",
      "$1 monthly Runtime Allowance + $1.50 managed AI allowance",
      "Lead Hunt access and connected email workflows",
    ],
  },
  {
    name: "Wireline Starter Plus",
    price: "$39/mo",
    bestFor: "Founders who need a personal Concierge and a business voice agent.",
    includes: [
      "2 live agents and 2 production numbers, provisioned when needed",
      "100 guaranteed live-voice minutes each month",
      "$3 monthly Runtime Allowance + $3 managed AI allowance",
      "Full Lead Hunt, enrichment, research, email, and SMS workflows",
    ],
  },
  {
    name: "Wireline Pro",
    price: "$79/mo",
    bestFor: "Revenue, support, and front desk teams.",
    includes: [
      "Up to 5 live agents and 5 production numbers, provisioned when needed",
      "190 guaranteed live-voice minutes each month",
      "$6 monthly Runtime Allowance + $6 managed AI allowance",
      "CRM sync, routing, approvals, and campaign workflows",
    ],
  },
  {
    name: "Wireline Scale & Enterprise",
    price: "Custom committed usage",
    bestFor: "Governed rollout for organizations that need 25 or more agents.",
    includes: [
      "Custom agent and production-number capacity",
      "SSO, security review, retention controls, and implementation support",
      "Custom integrations, channel economics, and service commitments",
      "Founder-led scoping instead of self-serve checkout",
    ],
  },
  {
    name: "Runtime Balance",
    price: "Optional top-up funding for usage beyond your plan",
    bestFor: "Customers who want direct control over usage funding.",
    includes: [
      "Web checkout only",
      "One-time top-ups",
      "Ledger-backed funding for calls, texts, and follow-up beyond included capacity",
      "Active calls always finish normally. Depleted coverage only blocks the next action",
    ],
  },
] as const;

export const WIRELINE_FEATURES = [
  {
    title: "Inbound support",
    blurb:
      "Agents pick up 24/7, answer questions, route urgent calls, schedule appointments, and capture intent.",
  },
  {
    title: "Outbound sales",
    blurb:
      "Upload a CSV, pick a playbook, launch outbound campaigns, and hand qualified meetings to the calendar.",
  },
  {
    title: "Email agents",
    blurb:
      "Agents triage your inbox, reply on-brand, follow up, and escalate the threads you need to see personally.",
  },
  {
    title: "Two-way texting",
    blurb:
      "Agents text customers and reply in-thread when customers text back, with STOP and UNSUBSCRIBE handling in place.",
  },
  {
    title: "Recaps and oversight",
    blurb: "Unified recaps keep calls, texts, follow-up, and operating visibility in one place.",
  },
] as const;

/**
 * The growth-engine story - Wireline's autonomous outbound and follow-up stack,
 * framed as the answer to "I need more leads" or "my pipeline is dry."
 */
export const WIRELINE_GROWTH_ENGINE =
  "Wireline's autonomous growth engine works leads across calls, texts, and email: upload a list or sync a CRM, qualify with a defined playbook, book meetings onto the calendar, and keep improving from the best completed conversations.";

/**
 * Pain -> capability map. When a caller names a problem, the agent should
 * surface the matching Wireline capability without being asked.
 */
export const WIRELINE_PAIN_SOLUTIONS = [
  {
    pain: "Struggling with leads, dry pipeline, or need more customers",
    solution:
      "the autonomous growth engine - outbound campaigns that dial and qualify leads, run multi-touch follow-up, and book qualified meetings without adding SDR headcount",
  },
  {
    pain: "Missing calls or losing business after hours",
    solution:
      "inbound agents that answer 24/7, capture intent, and book or route the work so missed calls do not die in voicemail",
  },
  {
    pain: "No time to follow up or leads going cold",
    solution:
      "cadences and email agents that follow up automatically across call, text, and email until the lead responds or opts out",
  },
  {
    pain: "Drowning in the inbox",
    solution:
      "email agents that triage, reply on-brand, and escalate only the messages that need a human",
  },
  {
    pain: "Can't justify or afford more staff",
    solution:
      "one operating layer of trained agents covering inbound, outbound, and email for a fraction of another full-time hire",
  },
  {
    pain: "Worried quality will slip or agents will go off-script",
    solution:
      "a supervised workroom with transcripts, approvals, and a feedback loop that keeps improving what the agents do",
  },
] as const;

/**
 * Connector names are examples, not unconditional availability promises. Every
 * public prompt must retain the "when connected" qualifier because OAuth app
 * configuration, provider authorization, and provider-side limits vary.
 */
export const WIRELINE_INTEGRATIONS = [
  "HubSpot when connected",
  "Salesforce when connected",
  "Apollo when configured",
  "Slack when connected",
  "Microsoft Teams when connected",
  "DocuSign when configured",
  "Google Calendar when connected",
  "Google Sheets when connected",
  "Microsoft 365 (Outlook + Excel) when connected",
  "Shopify when connected",
  "Square when connected",
  "Zoom when connected",
  "Meta (Facebook + Instagram Ads) when connected",
  "X (Twitter) when connected",
  "Stripe for Wireline billing",
  "bring-your-own carrier where supported",
] as const;

/**
 * Current compliance posture. Keep this deliberately conservative: public
 * assistants may describe controls that are live, but must never imply a
 * certification, BAA, audit schedule, or regional deployment that has not been
 * completed and independently verified.
 */
export const WIRELINE_COMPLIANCE_STATUS = {
  done: [
    "Encryption at rest through the managed database and hosting providers",
    "TLS in transit",
    "Per-tenant data isolation in the application and database policy layers",
    "Audit logging for protected state changes",
    "TCPA consent and opt-out records for outbound workflows",
    "DNC enforcement on outbound dialing",
    "Account deletion with a delayed hard-delete workflow",
  ],
  inProgress: [
    "SOC 2 readiness work is in progress; Wireline is not SOC 2 certified today",
    "HIPAA and BAA support are not currently available; do not present Wireline as HIPAA-certified",
    "Database policy and exposure reviews continue as the product surface expands",
    "EU data residency is not currently available",
  ],
} as const;
