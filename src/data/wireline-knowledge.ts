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
  "Live calls run through the Wireline voice bridge with low-latency speech-to-text and Wireline voice synthesis. Wireline uses fast voice models for the phone runtime and deeper reasoning models for coaching, written review, and higher-reasoning workflows.";

export const WIRELINE_PLANS = [
  {
    name: "Wireline Personal",
    price: "Create free, then fund live work with Conversation Balance",
    bestFor: "Solo or founder use.",
    includes: [
      "One active agent and one number",
      "All templates unlocked",
      "Short Create intake with deeper setup in Training",
      "Live work funded only when the account holder adds Conversation Balance",
    ],
  },
  {
    name: "Wireline Team",
    price: "Shared capacity tier plus Conversation Balance",
    bestFor: "Shared SMB coverage.",
    includes: [
      "Several active agents with shared inbox coverage",
      "Routing, approvals, and core integrations",
      "Connected numbers and follow-up controls",
      "Conversation Balance alongside shared operations",
    ],
  },
  {
    name: "Wireline Business",
    price: "Operating-capacity subscription plus pooled Conversation Balance",
    bestFor: "Revenue, support, and front desk teams.",
    includes: [
      "CRM sync, policies, and role-aware controls",
      "Approvals, analytics, and shared routing",
      "Outbound, inbound, and follow-up in one workspace",
      "Pooled live-work funding through Conversation Balance",
    ],
  },
  {
    name: "Wireline Enterprise",
    price: "Annual committed usage and contract terms",
    bestFor: "Governed rollout for larger organizations.",
    includes: [
      "SSO, SCIM, and audit support",
      "Custom policy, telephony, and implementation support",
      "Governed rollout planning",
      "Committed annual usage structure",
    ],
  },
  {
    name: "Conversation Balance",
    price: "One-time top-up funding for live work",
    bestFor: "Customers who want direct control over usage funding.",
    includes: [
      "Web checkout only",
      "One-time top-ups",
      "Ledger-backed funding for calls, texts, and follow-up",
      "No template lock or artificial seat wall",
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

export const WIRELINE_INTEGRATIONS = [
  "HubSpot",
  "Salesforce",
  "Apollo",
  "Slack",
  "Microsoft Teams",
  "DocuSign",
  "Google Calendar",
  "Google Sheets",
  "Microsoft 365 (Outlook + Excel)",
  "Shopify",
  "Square",
  "Zoom",
  "Meta (Facebook + Instagram Ads)",
  "X (Twitter)",
  "Stripe",
  "Bring-your-own carrier",
  "Wireline voice cloning",
] as const;

/**
 * What Wireline has done and is planning for compliance. Updated honestly so
 * agents never over-promise on a sales call.
 */
export const WIRELINE_COMPLIANCE_STATUS = {
  done: [
    "Encryption at rest (Postgres + Vercel)",
    "TLS 1.2+ in transit",
    "Per-tenant data isolation enforced in application queries",
    "Append-only audit log on every state change",
    "TCPA opt-in and opt-out ledger with state-by-state jurisdiction rules in code",
    "DNC list honored automatically on outbound dialing",
    "Account deletion plus 30-day retention queue (GDPR-style)",
  ],
  inProgress: [
    "SOC 2 Type II - auditor engaged, target Q4 2026",
    "HIPAA BAA - Enterprise tier only, on request (~30 day onboarding)",
    "Supabase RLS policy coverage and GraphQL exposure cleanup for all tenant tables",
    "EU data residency - planned for the EU launch",
  ],
} as const;
