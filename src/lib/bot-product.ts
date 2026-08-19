export type BotChannelKey = "voice" | "text" | "email";
export type BotTemplateCategory = "Business" | "Personal" | "Custom";
export type BotDirection = "inbound" | "outbound" | "hybrid";
export type BotProductTypeKey = "voice" | "conversation" | "human";

export const BOT_BRAND = {
  name: "WIRELINE",
  slogan: "WIRE YOUR PHONE BOT",
  supportingLine: "CALL · EMAIL · TEXT",
  promise: "Put a Bot on the line and let the work start moving.",
} as const;

export const BOT_PRODUCT_TYPES = [
  {
    key: "voice" as const,
    name: "Phone Bot",
    label: "PHONE BOT",
    description:
      "Handle inbound and outbound calls, qualify needs, book next steps, transfer, and recap.",
  },
  {
    key: "conversation" as const,
    name: "Conversation Bot",
    label: "CONVERSATION BOT",
    description:
      "Carry one continuous conversation across calls, email, and text with shared context.",
  },
  {
    key: "human" as const,
    name: "Human Bot",
    label: "HUMAN BOT",
    description:
      "Configure a Bot around a real human role, playbook, tone, approvals, tools, and handoffs.",
  },
] as const satisfies ReadonlyArray<{
  key: BotProductTypeKey;
  name: string;
  label: string;
  description: string;
}>;

export const BOT_CHANNELS = [
  {
    key: "voice" as const,
    label: "Call",
    description:
      "Answer and make calls, hold natural conversations, qualify needs, book, transfer, and recap.",
  },
  {
    key: "email" as const,
    label: "Email",
    description:
      "Read, reply, follow up, and preserve the complete conversation and outcome record.",
  },
  {
    key: "text" as const,
    label: "Text",
    description:
      "Continue the same conversation by SMS for follow-up, reminders, confirmations, and updates.",
  },
] as const;

export const BOT_ROLE_TEMPLATES = [
  {
    key: "front-desk",
    name: "Front Desk",
    category: "Business" as const,
    direction: "inbound" as const,
    summary: "Own the first five minutes of every inbound conversation.",
    outcomes: ["Route Calls", "Capture Intake", "Book Appointments"],
    moves: [
      "Identify intent, urgency, and the right destination",
      "Capture caller, service, and intake details",
      "Book into a connected calendar and confirm the next step",
    ],
  },
  {
    key: "sales-rep",
    name: "Sales Rep",
    category: "Business" as const,
    direction: "hybrid" as const,
    summary: "Work new leads while they are hot and keep qualified buyers moving.",
    outcomes: ["Qualify Leads", "Handle Objections", "Advance Deals"],
    moves: [
      "Respond to fresh leads by call, email, or text",
      "Qualify against your offer, fit, and buying criteria",
      "Handle approved objections and run the next follow-up",
    ],
  },
  {
    key: "appointment-setter",
    name: "Appointment Setter",
    category: "Business" as const,
    direction: "outbound" as const,
    summary: "Turn outreach into qualified calendar time.",
    outcomes: ["Run Outreach", "Confirm Interest", "Set Meetings"],
    moves: [
      "Work an outbound contact list through approved call windows",
      "Confirm interest and answer the obvious questions",
      "Book the meeting and send confirmations or reminders",
    ],
  },
  {
    key: "customer-support",
    name: "Customer Support",
    category: "Business" as const,
    direction: "inbound" as const,
    summary: "Resolve the repeatable work and make every escalation cleaner.",
    outcomes: ["Resolve Requests", "Collect Diagnostics", "Escalate With Context"],
    moves: [
      "Answer from the knowledge and policies you approve",
      "Collect account, issue, and troubleshooting context",
      "Escalate with the transcript, summary, and next action attached",
    ],
  },
  {
    key: "lead-qualifier",
    name: "Lead Qualifier",
    category: "Business" as const,
    direction: "hybrid" as const,
    summary: "Keep human time focused on the opportunities that deserve it.",
    outcomes: ["Discover Needs", "Score Fit", "Route Qualified Leads"],
    moves: [
      "Ask the qualification questions that matter to your business",
      "Capture fit signals, disqualifiers, timing, and intent",
      "Route qualified opportunities with a complete handoff",
    ],
  },
  {
    key: "recruiter",
    name: "Recruiter",
    category: "Business" as const,
    direction: "hybrid" as const,
    summary: "Move candidates from first contact to a scheduled interview faster.",
    outcomes: ["Screen Candidates", "Collect Availability", "Schedule Interviews"],
    moves: [
      "Screen against role requirements and approved questions",
      "Answer candidate questions and collect availability",
      "Coordinate the interview and send confirmations",
    ],
  },
  {
    key: "collections",
    name: "Collections",
    category: "Business" as const,
    direction: "outbound" as const,
    summary: "Run respectful, controlled follow-up without losing the paper trail.",
    outcomes: ["Run Reminders", "Capture Payment Intent", "Escalate Exceptions"],
    moves: [
      "Run approved reminder sequences across call, email, and text",
      "Capture promise-to-pay, dispute, or callback intent",
      "Escalate exceptions and sensitive commitments for review",
    ],
  },
  {
    key: "property-manager",
    name: "Property Manager",
    category: "Business" as const,
    direction: "hybrid" as const,
    summary: "Keep leasing, maintenance, residents, and vendors from stalling out.",
    outcomes: ["Handle Leasing Inquiries", "Open Work Orders", "Coordinate Vendors"],
    moves: [
      "Triage leasing questions and maintenance intake",
      "Capture property, unit, issue, access, and urgency details",
      "Coordinate resident and vendor updates through resolution",
    ],
  },
  {
    key: "personal-assistant",
    name: "Personal Assistant",
    category: "Personal" as const,
    direction: "hybrid" as const,
    summary: "Get the small coordination work out of your head and off your list.",
    outcomes: ["Manage Schedule", "Research & Follow Up", "Coordinate Tasks"],
    moves: [
      "Coordinate calendar changes, reminders, and routine follow-ups",
      "Research, summarize, and keep the useful answer attached to the task",
      "Draft or send routine communications within your rules",
    ],
  },
  {
    key: "family-concierge",
    name: "Family Concierge",
    category: "Personal" as const,
    direction: "hybrid" as const,
    summary: "Handle the household logistics that usually live in someone’s memory.",
    outcomes: ["Coordinate Plans", "Book Services", "Track Household Follow-Up"],
    moves: [
      "Coordinate appointments, reservations, and service windows",
      "Track recurring household tasks and reminders",
      "Follow up with providers until the loose end is closed",
    ],
  },
  {
    key: "custom",
    name: "Create Your Own",
    category: "Custom" as const,
    direction: "hybrid" as const,
    summary: "Wire the exact job you wish somebody would just own.",
    outcomes: ["Define Any Job", "Connect the Right Tools", "Set the Rules"],
    moves: [
      "Define the trigger, goal, context, and success condition",
      "Connect only the channels and actions the job requires",
      "Set approvals, boundaries, handoffs, and outcome logging",
    ],
  },
] as const;

export const BOT_MARKETING_VOICE = {
  eyebrow: BOT_BRAND.supportingLine,
  headline: BOT_BRAND.slogan,
  subline: BOT_BRAND.promise,
  primaryCta: "Start Free",
  spine: ["Call", "Email", "Text"],
} as const;

export const BOT_WORKSPACE_PROMISE = {
  title: "YOUR BOT. ALREADY MOVING.",
  description:
    "Calls come in. Follow-ups go out. Context carries forward. You step in when you want to.",
} as const;
