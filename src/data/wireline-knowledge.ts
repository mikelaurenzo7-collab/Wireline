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
  "Live calls run through Vapi with low-latency speech-to-text and ElevenLabs voice synthesis. Wireline uses fast voice models for the phone runtime, while Claude powers coaching, written review, and higher-reasoning workflows.";

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
    title: "Live Monitor & Insights",
    blurb:
      "Watch every conversation in real time. Sentiment, funnels, topic clusters, leaderboards — one dashboard.",
  },
  {
    title: "Supervisor Cockpit",
    blurb:
      "Business+ tier — see all live calls across your team, queue depth, average wait, and SLA flags at a glance.",
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
