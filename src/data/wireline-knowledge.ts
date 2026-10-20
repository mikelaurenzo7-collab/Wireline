/**
 * Canonical WIRELINE product knowledge - the single source of truth that gets:
 *   1. Injected into every Vapi agent system prompt as a "WIRELINE KNOWLEDGE" block.
 *   2. Rendered in the in-app /help route so signed-in account holders see the same story.
 *   3. Referenced by public-facing demo and marketing surfaces.
 */

import { STRIPE_PLANS, FLAT_OVERAGE_PER_MIN_USD } from "../lib/plan-catalog";

export const WIRELINE_URL = "https://botbound.app";
export const WIRELINE_SUPPORT_EMAIL = "support@botbound.app";

export const WIRELINE_ONE_LINER =
  "BotBound gives your voice Bots a computer, phone number, and email address to answer calls, handle requests, and get everyday work done.";

export const WIRELINE_VOICE_STACK =
  "Live calls and private browser rehearsals run on separate BotBound managed voice paths, so a rehearsal cannot take over a customer phone Bot.";

export const WIRELINE_PLANS = [
  {
    name: "BotBound Free Builder",
    price: "Free to create, train, and privately rehearse",
    bestFor: "Trying BotBound before going live.",
    includes: [
      "One private draft Bot",
      "Setup and bounded private rehearsal",
      "Private rehearsals only: no live calls, texts, or number until you activate a paid plan",
    ],
  },
  ...STRIPE_PLANS.filter(
    (plan) => plan.catalogFamily === "channels" && !plan.channels.includes("sms"),
  ).map((plan) => ({
    name: plan.name,
    price: `$${plan.price_usd_monthly}/mo or $${plan.price_usd_annual}/year`,
    bestFor: `One Bot with ${plan.channels.map((channel) => (channel === "voice" ? "Calls" : channel === "email" ? "Email" : "SMS")).join(" + ")} at ${plan.capacityTier} monthly capacity.`,
    includes: [
      "1 Bot; only selected channels are included",
      ...(plan.channels.includes("voice")
        ? [
            `${plan.voice_minutes_monthly} call minutes/month; extra minutes $${FLAT_OVERAGE_PER_MIN_USD.toFixed(2)}/min`,
          ]
        : []),
      ...(plan.included_phone_numbers
        ? [`${plan.included_phone_numbers} local number included, selected by the customer`]
        : []),
      ...(plan.included_mailboxes
        ? [`${plan.included_mailboxes} managed Bot mailbox included`]
        : []),
      `$${plan.ai_spend_allowance_usd_monthly.toFixed(2)} managed AI allowance/month`,
      "Managed AI and any included call minutes renew on the monthly subscription anniversary, including annual plans; no rollover",
      ...(plan.runtime_allowance_usd_monthly
        ? [`$${plan.runtime_allowance_usd_monthly.toFixed(2)} Runtime Allowance/month`]
        : []),
      "Activation depends on live checkout availability",
    ],
  })),
  {
    name: "BotBound Enterprise",
    price: "Custom committed usage",
    bestFor: "Governed rollout for organizations that need 25 or more Bots.",
    includes: [
      "Custom Bot and production number capacity",
      "SSO, security review, retention controls, and implementation support",
      "Custom integrations, channel economics, and service commitments",
      "Guided scoping with the founder",
    ],
  },
  {
    name: "Runtime Balance",
    price: "Optional prepaid funding for usage beyond your plan",
    bestFor: "Customers who want direct control over usage funding.",
    includes: [
      "Web checkout only",
      "One time balance purchases",
      "Ledger backed funding for calls and eligible live actions beyond included capacity",
      "Calls can use up to 10 minutes of completion credit within their session limit. Any amount due pauses new calls and prepaid extras until topped up",
    ],
  },
] as const;

export const WIRELINE_FEATURES = [
  {
    title: "Inbound Support",
    blurb:
      "Configured Bots answer inbound calls, handle approved questions, route requests, schedule appointments, and capture intent.",
  },
  {
    title: "Personal Calls",
    blurb:
      "Prepare personal coordination calls and specific business service or appointment calls, then review each one before placement. Recipient permission is required. Illinois callers and recipients are currently supported.",
  },
  {
    title: "Email Workflows",
    blurb:
      "Bots manage their inbox, answer replies, send approved recaps, and escalate threads you need to see personally.",
  },
  {
    title: "Cloud Computer",
    blurb:
      "Give your Bot a web task. It researches, navigates sites, and fills in forms with your instructions. Every paid plan includes a cloud computer.",
  },
  {
    title: "Recaps and Oversight",
    blurb: "Keep calls, email, tasks, and next steps in one workspace.",
  },
  {
    title: "SMS Coming Soon",
    blurb:
      "Texting is not part of the current launch offer. Sender registration and approval must be complete before activation.",
  },
] as const;

/**
 * Compatibility export for product-help prompts. Describe the current launch
 * offer rather than promoting the retained outbound campaign implementation.
 */
export const WIRELINE_GROWTH_ENGINE =
  "BotBound helps small businesses answer incoming calls, place reviewed service and appointment calls, capture requests, book available times, and send approved email recaps. Business outbound campaigns are not part of the current launch offer. Marketing calls still require consent rules, federal DNC screening, and provider approval; they are unavailable today.";

/**
 * Pain -> capability map. When a caller names a problem, the Bot should
 * surface the matching WIRELINE capability without being asked.
 */
export const WIRELINE_PAIN_SOLUTIONS = [
  {
    pain: "Losing incoming inquiries while busy",
    solution:
      "a Bot that answers incoming questions, captures customer needs, and offers the next available appointment",
  },
  {
    pain: "Missing calls or losing business after hours",
    solution:
      "inbound Bots that answer 24/7, capture intent, and book or route the work so missed calls do not die in voicemail",
  },
  {
    pain: "No time to organize customer requests",
    solution: "clear call records, approved email recaps, and next steps in one workspace",
  },
  {
    pain: "Drowning in the inbox",
    solution:
      "Bots that manage their inbox, answer replies, and escalate messages that need a human",
  },
  {
    pain: "Can't justify or afford more staff",
    solution: "Bots covering inbound calls, email, and computer tasks in the same workspace",
  },
  {
    pain: "Worried quality will slip or Bots will ignore instructions",
    solution:
      "a supervised workroom with transcripts, approvals, and a feedback loop that keeps improving what the Bots do",
  },
] as const;

/**
 * Keep the launch story focused on supported ways to use the workspace.
 * Optional connections are not a prerequisite for the native calendar or inbox.
 */
export const WIRELINE_INTEGRATIONS = [
  "ChatGPT through account authorized MCP",
  "Claude through account authorized MCP",
  "Cursor through account authorized MCP",
  "Google Calendar busy times when connected",
  "Outlook Calendar busy times when connected",
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
    "SOC 2 readiness work is in progress; BotBound is not SOC 2 certified today",
    "HIPAA and BAA support are not currently available; do not present BotBound as HIPAA-certified",
    "Database policy and exposure reviews continue as the product surface expands",
    "EU data residency is not currently available",
  ],
} as const;
