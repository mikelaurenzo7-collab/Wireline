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

export const WIRELINE_URL = "https://trywireline.com";
export const WIRELINE_SUPPORT_EMAIL = "trywireline@yahoo.com";

export const WIRELINE_ONE_LINER =
  "Wireline runs your inbound support, outbound sales, and email follow-ups across one fleet of AI agents — trained on your playbook, available 24/7, and improving with every interaction.";

export const WIRELINE_VOICE_STACK =
  "Live voice calls run on Gemini 3 Flash Preview. When Wireline has to recover from a Vapi model provisioning failure, it falls back to GPT-4o. Claude remains the coaching and written-review layer, not the live phone runtime.";

export const WIRELINE_PLANS = [
  {
    name: "Personal",
    price: "$49/mo",
    bestFor: "Solo operators, side hustles, founders testing the waters.",
    includes: [
      "1 AI agent",
      "1 phone number",
      "400 voice minutes/mo (overage $0.20/min — rarely triggered)",
      "Email triage on a connected inbox",
    ],
  },
  {
    name: "Starter",
    price: "$149/mo",
    bestFor:
      "Small teams running a single playbook (inbound support, outbound SDR, or scheduling).",
    includes: [
      "3 AI agents",
      "2 phone numbers",
      "1,500 voice minutes/mo (overage $0.18/min)",
      "CRM sync (HubSpot or Salesforce)",
      "Two-way texting",
    ],
  },
  {
    name: "Pro",
    price: "$499/mo",
    bestFor:
      "Growing operators running multiple playbooks side by side — sales, support, and outbound.",
    includes: [
      "10 AI agents",
      "5 phone numbers",
      "6,000 voice minutes/mo (overage $0.15/min)",
      "All CRM integrations (HubSpot, Salesforce, Pipedrive, Apollo)",
      "Slack handoff for human escalations",
      "Custom playbooks + knowledge ingestion",
    ],
  },
  {
    name: "Business",
    price: "$1,499/mo",
    bestFor: "Multi-team operators who need supervisor visibility + call-center routing.",
    includes: [
      "25 AI agents",
      "10 phone numbers",
      "15,000 voice minutes/mo (overage $0.13/min)",
      "Supervisor cockpit with live call monitor",
      "Team-level routing + per-team text-message sender",
      "DocuSign + custom integrations",
      "SSO + audit log",
      "Dedicated onboarding call",
    ],
  },
  {
    name: "Enterprise",
    price: "Custom",
    bestFor: "Companies that need white-glove onboarding + dedicated support.",
    includes: [
      "Everything in Business",
      "Custom voice cloning",
      "Dedicated CSM",
      "Custom SLA",
      "Custom data residency",
      "Quarterly business review",
    ],
  },
] as const;

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
  "Pipedrive",
  "Apollo",
  "Slack",
  "DocuSign",
  "Google Calendar",
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
    "Encryption at rest (Supabase Postgres + Vercel)",
    "TLS 1.2+ in transit",
    "Per-tenant data isolation enforced on every query",
    "Append-only audit log on every state change",
    "TCPA opt-in/opt-out ledger with state-by-state jurisdiction rules in code",
    "DNC list honored automatically on outbound dialing",
    "Account deletion + 30-day retention queue (GDPR-style)",
  ],
  inProgress: [
    "SOC 2 Type II — auditor engaged, expected Q4 2026",
    "HIPAA BAA — available on the Enterprise tier on request (~30 day onboarding)",
    "EU data residency — planned for the EU launch",
  ],
} as const;
