export type BotChannelKey = "voice" | "text" | "email";
export type BotTemplateCategory = "Operations" | "Everyday" | "Custom";
export type BotDirection = "inbound" | "outbound" | "hybrid";
export type BotProductTypeKey = "voice" | "conversation" | "human";

export const BOT_BRAND = {
  name: "BotBound",
  slogan: "Your Next Hire Is a Bot",
  supportingLine: "CALL · TEXT · EMAIL",
  promise: "Your Bot for calls, texts, and email.",
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
      "Carry one continuous conversation across calls, text, and email with shared context.",
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
    key: "text" as const,
    label: "Text",
    description:
      "Continue the same conversation by SMS for follow-up, reminders, confirmations, and updates.",
  },
  {
    key: "email" as const,
    label: "Email",
    description:
      "Read, reply, follow up, and preserve the complete conversation and outcome record.",
  },
] as const;

export const BOT_ROLE_TEMPLATES = [
  {
    key: "front-desk",
    name: "Front Desk",
    category: "Operations" as const,
    direction: "inbound" as const,
    summary: "Welcome callers, answer questions, and book appointments.",
    outcomes: ["Route Calls", "Capture Intake", "Book Appointments"],
    moves: [
      "Intent + urgency + routing",
      "Caller + service intake",
      "Calendar booking + confirmations",
    ],
  },
  {
    key: "sales-rep",
    name: "Sales Rep",
    category: "Operations" as const,
    direction: "hybrid" as const,
    summary: "Work new leads while they are hot and keep qualified buyers moving.",
    outcomes: ["Qualify Leads", "Handle Objections", "Advance Deals"],
    moves: [
      "Instant lead response",
      "Fit + timing + objection handling",
      "CRM handoff + next follow-up",
    ],
  },
  {
    key: "appointment-setter",
    name: "Appointment Setter",
    category: "Operations" as const,
    direction: "outbound" as const,
    summary: "Turn outreach into qualified calendar time.",
    outcomes: ["Run Outreach", "Confirm Interest", "Set Meetings"],
    moves: [
      "Outbound list + call windows",
      "Interest + approved FAQ handling",
      "Calendar booking + reminders",
    ],
  },
  {
    key: "customer-support",
    name: "Customer Support",
    category: "Operations" as const,
    direction: "inbound" as const,
    summary: "Resolve the repeatable work and make every escalation cleaner.",
    outcomes: ["Resolve Requests", "Collect Diagnostics", "Escalate With Context"],
    moves: [
      "Knowledge-grounded answers",
      "Account + issue diagnostics",
      "Transcript + context escalation",
    ],
  },
  {
    key: "lead-qualifier",
    name: "Lead Qualifier",
    category: "Operations" as const,
    direction: "hybrid" as const,
    summary: "Keep human time focused on the opportunities that deserve it.",
    outcomes: ["Discover Needs", "Score Fit", "Route Qualified Leads"],
    moves: [
      "Qualification questions",
      "Fit + disqualifier + timing signals",
      "Qualified handoff + next action",
    ],
  },
  {
    key: "recruiter",
    name: "Recruiter",
    category: "Operations" as const,
    direction: "hybrid" as const,
    summary: "Move candidates from first contact to a scheduled interview faster.",
    outcomes: ["Screen Candidates", "Collect Availability", "Schedule Interviews"],
    moves: [
      "Role-screening questions",
      "Candidate FAQ + availability",
      "Interview booking + confirmations",
    ],
  },
  {
    key: "property-manager",
    name: "Property Manager",
    category: "Operations" as const,
    direction: "hybrid" as const,
    summary: "Keep leasing, maintenance, residents, and vendors from stalling out.",
    outcomes: ["Handle Leasing Inquiries", "Open Work Orders", "Coordinate Vendors"],
    moves: [
      "Leasing + maintenance triage",
      "Unit + access + urgency intake",
      "Resident + vendor coordination",
    ],
  },
  {
    key: "personal-assistant",
    name: "Personal Assistant",
    category: "Everyday" as const,
    direction: "hybrid" as const,
    summary: "Get the small coordination work out of your head and off your list.",
    outcomes: ["Manage Schedule", "Research & Follow Up", "Coordinate Tasks"],
    moves: [
      "Calendar + reminder coordination",
      "Research + concise briefs",
      "Routine email + text follow-through",
    ],
  },
  {
    key: "family-concierge",
    name: "Family Concierge",
    category: "Everyday" as const,
    direction: "hybrid" as const,
    summary: "Handle the household logistics that usually live in someone’s memory.",
    outcomes: ["Coordinate Plans", "Book Services", "Track Household Follow-Up"],
    moves: [
      "Appointments + reservations",
      "Recurring household reminders",
      "Provider follow-up to closure",
    ],
  },
  {
    key: "custom",
    name: "Create Your Own",
    category: "Custom" as const,
    direction: "hybrid" as const,
    summary: "Build the exact job you wish somebody would just own.",
    outcomes: ["Define Any Job", "Connect the Right Tools", "Set the Rules"],
    moves: [
      "Trigger + goal + success condition",
      "Channels + actions + connected tools",
      "Approvals + handoffs + outcome log",
    ],
  },
] as const;

export const BOT_MARKETING_VOICE = {
  eyebrow: BOT_BRAND.supportingLine,
  headline: BOT_BRAND.slogan,
  subline: BOT_BRAND.promise,
  activationLine: "Answers calls, books appointments, and takes messages for your business.",
  primaryCta: "Start Free",
  spine: ["Call", "Text", "Email"],
} as const;

export const BOT_WORKSPACE_PROMISE = {
  title: "Your Bot. Already Moving",
  description:
    "Calls come in. Follow-ups go out. Context carries forward. You step in when you want to.",
} as const;
