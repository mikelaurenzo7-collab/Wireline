/**
 * Single source of truth for the 10 AI agents featured on the landing
 * page + in the in-app /help console.
 *
 * Layout (per Mike's call): 6 Wireline customer-service lines + 4
 * vertical demo agents. CS agents collectively cover every reason a
 * customer would call us — general support, sales, tech, billing,
 * scheduling, success — and route to each other when a call lands on
 * the wrong line.
 *
 * Used in:
 *   1. AuthPortal landing page — public "talk to Wireline" CTAs
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
  /** Comma-joined list of bucket labels this agent should handle. Used by routing logic in the CS playbook. */
  handles: string;
  tel: string;
  display: string;
  tint: string;
};

export const WIRELINE_CONTACT_AGENTS: ReadonlyArray<ContactAgent> = [
  {
    name: "Sarah",
    role: "General Customer Support",
    scope:
      "First line for any Wireline question — answers, account help, how-to, troubleshooting basics. Routes specialized calls to the right teammate.",
    firstMessage: "Hi, this is Sarah with Wireline support — how can I help you today?",
    handles: "general, how-to, account, password reset, navigation",
    tel: "+16306425661",
    display: "(630) 642-5661",
    tint: "#E040C0",
  },
  {
    name: "Liam",
    role: "Sales & Plan Comparison",
    scope:
      "Pricing, plan comparison, ROI questions, enterprise quotes, custom demos. Owns the deal cycle.",
    firstMessage:
      "Hey, this is Liam over at Wireline sales — looking to size up a plan or compare us to something else? Happy to help.",
    handles: "pricing, plans, demo, comparison, enterprise quote, ROI",
    tel: "+16305811834",
    display: "(630) 581-1834",
    tint: "#0AC8D4",
  },
  {
    name: "Tyler",
    role: "Technical Support",
    scope:
      "Integrations, webhooks, API, voice quality, CRM sync, knowledge ingestion, anything that needs a developer mindset.",
    firstMessage: "Hi, Tyler here from Wireline technical support — what are we troubleshooting?",
    handles: "API, webhooks, integration, CRM sync, voice quality, audio, latency",
    tel: "+15642389455",
    display: "(564) 238-9455",
    tint: "#8b5cf6",
  },
  {
    name: "Maya",
    role: "Book a Demo / Onboarding",
    scope:
      "Schedules white-glove onboarding for Business + Enterprise, custom training sessions, demo calls for prospects.",
    firstMessage:
      "Hi, this is Maya — I handle onboarding and demo scheduling at Wireline. What time zone are you in so I can find a slot that works?",
    handles: "demo, onboarding, training, white glove, calendar, scheduling",
    tel: "+16306425927",
    display: "(630) 642-5927",
    tint: "#9B59F5",
  },
  {
    name: "Devon",
    role: "Billing & Account Management",
    scope:
      "Stripe issues, plan changes, refunds, usage overages, invoice questions, cancellations, downgrades.",
    firstMessage:
      "Hi, this is Devon from Wireline billing — got an invoice question or want to make a change to your plan?",
    handles: "billing, invoice, refund, plan change, downgrade, cancel, Stripe, overage",
    tel: "+12075935155",
    display: "(207) 593-5155",
    tint: "#f43f5e",
  },
  {
    name: "Priya",
    role: "Customer Success",
    scope:
      "Proactive check-ins, quarterly business reviews, usage analysis, expansion ideas, best-practice coaching for existing accounts.",
    firstMessage:
      "Hi, this is Priya from Wireline customer success — calling to see how the agents are performing and whether there's anything we can tune. Got a few minutes?",
    handles: "success, check-in, QBR, expansion, best practice, training, optimization",
    tel: "+15727269365",
    display: "(572) 726-9365",
    tint: "#ec4899",
  },
];

export type DemoAgent = ContactAgent;

export const WIRELINE_DEMO_AGENTS: ReadonlyArray<DemoAgent> = [
  {
    name: "Marcus",
    role: "Healthcare-Style Demo",
    scope:
      "Role-plays a clinic front desk — greets patients, captures reason for visit, schedules appointments, handles insurance pre-check. Healthcare-style demo; not currently HIPAA-certified (BAA available on the Enterprise tier roadmap).",
    firstMessage:
      "Thanks for calling Wireline Medical, this is Marcus — are you booking an appointment or do you have a question about an existing one?",
    handles: "medical, healthcare, clinic, patient intake",
    tel: "+16173134469",
    display: "(617) 313-4469",
    tint: "#10B981",
  },
  {
    name: "Aisha",
    role: "Real Estate Lead Capture (demo)",
    scope:
      "Role-plays a real-estate front desk — answers listing inquiries, qualifies buyer budget + timeline, books showings.",
    firstMessage:
      "Wireline Realty, this is Aisha — calling about a listing or looking to set up a showing?",
    handles: "real estate, realtor, listing, showing, buyer",
    tel: "+19733638874",
    display: "(973) 363-8874",
    tint: "#FFC07D",
  },
  {
    name: "Elena",
    role: "Insurance Claims Intake (demo)",
    scope:
      "Role-plays a claims line — walks claimants through first-notice-of-loss, captures incident detail, opens the case file.",
    firstMessage:
      "Wireline Insurance claims, this is Elena — are you reporting a new claim or following up on an existing one?",
    handles: "insurance, claim, loss, FNOL",
    tel: "+19044601596",
    display: "(904) 460-1596",
    tint: "#06b6d4",
  },
  {
    name: "Jake",
    role: "Outbound SDR (demo)",
    scope:
      "Role-plays a cold-call SDR — calls a lead from a CSV, qualifies fit, books discovery calls with closers, logs results to CRM.",
    firstMessage:
      "Hey, this is Jake calling from Wireline — quick one, do you handle customer calls at your company today?",
    handles: "outbound, cold call, SDR, prospecting, qualification",
    tel: "+14692571581",
    display: "(469) 257-1581",
    tint: "#f59e0b",
  },
];
