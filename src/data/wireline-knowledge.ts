/**
 * Canonical Wireline product knowledge — the single source of truth that
 * gets:
 *   1. Injected into every Vapi assistant's system prompt as a
 *      "WIRELINE KNOWLEDGE" block (so all 10 landing-page agents answer
 *      questions about Wireline the same way).
 *   2. Rendered in the in-app /help route so signed-in operators see
 *      the same product story.
 *   3. Surfaced in the public landing copy.
 *
 * Edit this file → run POST /api/admin/sync-vapi-knowledge → all live
 * agents get the updated prompt within seconds.
 */

import { STRIPE_PLANS } from "../lib/plan-catalog";

export const WIRELINE_URL = "https://trywireline.com";
export const WIRELINE_SUPPORT_EMAIL = "trywireline@yahoo.com";

export const WIRELINE_ONE_LINER =
  "Wireline runs your inbound support, outbound sales, and email follow-ups across one fleet of AI agents — trained on your playbook, available 24/7, and improving with every interaction.";

export const WIRELINE_VOICE_STACK =
  "Live calls run through our voice bridge with low-latency speech-to-text and ElevenLabs voice synthesis. Wireline uses fast voice models for the phone runtime, while Claude powers coaching, written review, and higher-reasoning workflows.";

const PLAN_BEST_FOR: Record<string, string> = {
  personal: "Solo operators, side hustles, founders testing the waters.",
  starter: "Small teams running a single playbook: inbound support, outbound SDR, or scheduling.",
  pro: "Growing operators running multiple playbooks side by side: sales, support, and outbound.",
  business: "Multi-team operators who need supervisor visibility, SSO, and serious volume.",
  enterprise: "Companies that need white-glove onboarding, dedicated support, and custom terms.",
};

function formatPlanPrice(plan: (typeof STRIPE_PLANS)[number]): string {
  return plan.price_usd_monthly > 0 ? `$${plan.price_usd_monthly.toLocaleString()}/mo` : "Custom";
}

export const WIRELINE_PLANS = STRIPE_PLANS.map((plan) => ({
  name: plan.name,
  price: formatPlanPrice(plan),
  bestFor: PLAN_BEST_FOR[plan.id],
  includes: plan.features,
})) as ReadonlyArray<{
  name: string;
  price: string;
  bestFor: string;
  includes: readonly string[];
}>;

export const WIRELINE_FEATURES = [
  {
    title: "Inbound Support",
    blurb:
      "Agents pick up 24/7 — answer questions, route urgent calls, schedule appointments, and capture intent.",
  },
  {
    title: "Outbound Sales",
    blurb:
      "Upload a CSV, pick a playbook, launch auto-dial campaigns. Qualified meetings on your calendar by morning.",
  },
  {
    title: "Email Agents",
    blurb:
      "Agents triage your inbox, reply on-brand, follow up, and escalate the ones you need to see personally.",
  },
  {
    title: "Two-way texting",
    blurb:
      "Agents text customers and reply in-thread when customers text back. TCPA-clean with STOP/UNSUBSCRIBE handling.",
  },
  {
    title: "Live Ops",
    blurb:
      "Unified command center — live callers on the floor, supervisor listen-in & whisper-coach, action queue, and fleet analytics in one place.",
  },
] as const;

/**
 * The growth-engine story — Wireline's autonomous outbound + follow-up
 * stack, framed as the answer to "I need more leads / my pipeline is dry."
 * Agents reach for this the moment a caller mentions leads, pipeline,
 * follow-up, or growth. Kept truthful: every claim maps to a shipped
 * capability (outbound campaigns, multi-touch cadences, BANT lead
 * qualification, and the self-improvement loop that mines lessons from
 * high-scoring calls).
 */
export const WIRELINE_GROWTH_ENGINE =
  "Wireline's autonomous growth engine works your leads for you: upload a list or sync your CRM, and the fleet dials out, qualifies with BANT, runs multi-touch cadences across calls, texts, and email, and books meetings straight onto your calendar — 24/7, no SDR headcount. Every call sharpens the next through the self-improvement loop, so the agents get better at booking the more they run.";

/**
 * Pain → capability map. When a caller names a problem, the agent should
 * surface the matching Wireline capability without being asked — so it
 * never whiffs a layup like "I'm struggling with leads" (→ the growth
 * engine). Each solution is a one-breath spoken answer the agent
 * paraphrases in its own voice, never a list it reads aloud.
 */
export const WIRELINE_PAIN_SOLUTIONS = [
  {
    pain: "Struggling with leads, dry pipeline, or need more customers",
    solution:
      "the autonomous growth engine — outbound campaigns that dial and qualify leads, multi-touch cadences, and qualified meetings booked onto their calendar without adding headcount",
  },
  {
    pain: "Missing calls or losing business after hours",
    solution:
      "inbound agents that answer 24/7, capture intent, and book the job so no missed call ever goes to voicemail",
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
      "one fleet covering inbound, outbound, and email for a fraction of a single hire — and it scales instantly",
  },
  {
    pain: "Worried quality will slip or agents will go off-script",
    solution:
      "a live supervisor cockpit with listen-in and whisper-coach, full transcripts, and a self-improvement loop that learns from every call",
  },
] as const;

export const WIRELINE_INTEGRATIONS = [
  "HubSpot",
  "Salesforce",
  "Apollo",
  "Slack",
  "DocuSign",
  "Google Calendar",
  "Google Sheets",
  "Microsoft 365",
  "Stripe",
  "Twilio (BYO carrier)",
] as const;

/**
 * What Wireline has done and is planning for compliance. Updated honestly so
 * agents never over-promise on a sales call — a single false claim ends a
 * healthcare or finance deal at legal review.
 */
export const WIRELINE_COMPLIANCE_STATUS = {
  done: [
    "Encryption at rest (Postgres + Vercel)",
    "TLS 1.2+ in transit",
    "Per-tenant data isolation enforced in application queries",
    "Append-only audit log on every state change",
    "TCPA opt-in/opt-out ledger with state-by-state jurisdiction rules in code",
    "DNC list honored automatically on outbound dialing",
    "Account deletion + 30-day retention queue (GDPR-style)",
  ],
  inProgress: [
    "SOC 2 Type II — auditor engaged, target Q4 2026",
    "HIPAA BAA — Enterprise tier only, on request (~30 day onboarding)",
    "Supabase RLS policy coverage + GraphQL exposure cleanup for all tenant tables",
    "EU data residency — planned for the EU launch",
  ],
} as const;
