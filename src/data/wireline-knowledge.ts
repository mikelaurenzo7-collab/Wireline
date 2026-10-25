/**
 * Canonical WIRELINE product knowledge - the single source of truth that gets:
 *   1. Injected into every Vapi agent system prompt as a "WIRELINE KNOWLEDGE" block.
 *   2. Rendered in the in-app /help route so signed-in account holders see the same story.
 *   3. Referenced by public-facing demo and marketing surfaces.
 */

import {
  PUBLIC_USAGE_TIERS,
  USAGE_ADDONS,
  USAGE_METERS,
  USAGE_TIERS,
} from "../lib/usage-billing-catalog";

export const WIRELINE_URL = "https://botbound.app";
export const WIRELINE_SUPPORT_EMAIL = "support@botbound.app";

export const WIRELINE_ONE_LINER =
  "BotBound gives your voice Bots a phone number, email address, and Computer to find prospects, start conversations, close deals, and support customers.";

export const WIRELINE_VOICE_STACK =
  "Live calls and private browser rehearsals run on separate BotBound managed voice paths, so a rehearsal cannot take over a customer phone Bot.";

export const WIRELINE_PLANS = PUBLIC_USAGE_TIERS.map((id) => {
  const plan = USAGE_TIERS[id];
  return {
    name: plan.name,
    price: `$${plan.monthlyUsd}/mo`,
    bestFor: "Inbound and outbound calls, SMS, email, and Computer with one shared allowance.",
    includes: [
      `$${plan.includedWorkUsd} of shared work each month`,
      `${plan.includedNumbers} phone number${plan.includedNumbers === 1 ? "" : "s"} included`,
      `${plan.includedEmailAddresses} email address${plan.includedEmailAddresses === 1 ? "" : "es"} included`,
      `Inbound and outbound calls $${USAGE_METERS.call_minutes.tiers[0].unitUsd.toFixed(2)}/minute; US SMS $${USAGE_METERS.sms_segments.tiers[0].unitUsd.toFixed(2)}/sent segment; email $${USAGE_METERS.emails_handled.tiers[0].unitUsd.toFixed(2)}/sent reply; Computer $${USAGE_METERS.computer_minutes.tiers[0].unitUsd.toFixed(2)}/minute`,
      `Extra numbers $${USAGE_ADDONS.number.usdMonthly}/month; extra email addresses $${USAGE_ADDONS.email_address.usdMonthly}/month`,
      "The allowance resets monthly with no rollover. A configurable monthly spending limit controls extra usage.",
      "SMS and outbound activation require approved senders and recipient permission. Registration fees may apply.",
    ],
  };
});

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
    title: "SMS",
    blurb:
      "Follow up, send reminders, and continue conversations by text from your business number. Sender registration, recipient permission, and opt-out controls apply.",
  },
] as const;

/**
 * Product-help prompts describe the full offer while preserving activation requirements.
 */
export const WIRELINE_GROWTH_ENGINE =
  "BotBound helps businesses research prospects, qualify leads, follow up on deals, answer incoming calls, and book available times. Sales Bots use calls, SMS, email, and Computer work together, with records and owner handoffs. Outbound marketing requires consent rules, federal DNC screening, and provider approval. A Bot must check its account's current activation status before promising or placing a live call or text; a paid plan alone does not clear those requirements.";

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
