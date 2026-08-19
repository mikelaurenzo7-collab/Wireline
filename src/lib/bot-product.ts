export type BotChannelKey = "voice" | "text" | "email";
export type BotTemplateCategory = "Business" | "Personal" | "Custom";
export type BotDirection = "inbound" | "outbound" | "hybrid";
export type BotProductTypeKey = "voice" | "conversation" | "human";

export const BOT_BRAND = {
  name: "WIRELINE",
  slogan: "WIRE YOUR PHONE BOT",
  supportingLine: "CALL · TEXT · EMAIL",
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
    category: "Business" as const,
    direction: "inbound" as const,
    summary: "Own the first five minutes: answer, identify intent, capture the right details, and route or book the next step.",
    outcomes: ["Route Calls", "Capture Intake", "Book Appointments"],
  },
  {
    key: "sales-rep",
    name: "Sales Rep",
    category: "Business" as const,
    direction: "hybrid" as const,
    summary: "Work new leads while they are hot, handle objections from your playbook, follow up automatically, and push qualified buyers forward.",
    outcomes: ["Qualify Leads", "Handle Objections", "Advance Deals"],
  },
  {
    key: "appointment-setter",
    name: "Appointment Setter",
    category: "Business" as const,
    direction: "outbound" as const,
    summary: "Run outbound touches, confirm interest, answer the obvious questions, and put qualified meetings directly on the calendar.",
    outcomes: ["Run Outreach", "Confirm Interest", "Set Meetings"],
  },
  {
    key: "customer-support",
    name: "Customer Support",
    category: "Business" as const,
    direction: "inbound" as const,
    summary: "Resolve repeatable issues from approved knowledge, collect diagnostics, update the customer, and escalate with full context when needed.",
    outcomes: ["Resolve Requests", "Collect Diagnostics", "Escalate With Context"],
  },
  {
    key: "lead-qualifier",
    name: "Lead Qualifier",
    category: "Business" as const,
    direction: "hybrid" as const,
    summary: "Ask your qualification questions, score fit against your criteria, enrich the record, and route only the opportunities worth human time.",
    outcomes: ["Discover Needs", "Score Fit", "Route Qualified Leads"],
  },
  {
    key: "recruiter",
    name: "Recruiter",
    category: "Business" as const,
    direction: "hybrid" as const,
    summary: "Screen candidates against the role, answer job questions, collect availability, and coordinate interviews without inbox ping-pong.",
    outcomes: ["Screen Candidates", "Collect Availability", "Schedule Interviews"],
  },
  {
    key: "collections",
    name: "Collections",
    category: "Business" as const,
    direction: "outbound" as const,
    summary: "Run compliant reminder sequences, capture payment intent or disputes, document every contact, and route exceptions for human review.",
    outcomes: ["Run Reminders", "Capture Payment Intent", "Escalate Exceptions"],
  },
  {
    key: "property-manager",
    name: "Property Manager",
    category: "Business" as const,
    direction: "hybrid" as const,
    summary: "Handle leasing questions, open maintenance requests, notify residents, coordinate vendors, and keep every property thread moving.",
    outcomes: ["Handle Leasing Inquiries", "Open Work Orders", "Coordinate Vendors"],
  },
  {
    key: "personal-assistant",
    name: "Personal Assistant",
    category: "Personal" as const,
    direction: "hybrid" as const,
    summary: "Manage scheduling, reminders, research, follow-ups, and routine communications without turning every small task into another tab.",
    outcomes: ["Manage Schedule", "Research & Follow Up", "Coordinate Tasks"],
  },
  {
    key: "family-concierge",
    name: "Family Concierge",
    category: "Personal" as const,
    direction: "hybrid" as const,
    summary: "Coordinate appointments, reservations, household services, recurring reminders, and the logistics that usually live in someone’s head.",
    outcomes: ["Coordinate Plans", "Book Services", "Track Household Follow-Up"],
  },
  {
    key: "custom",
    name: "Create Your Own",
    category: "Custom" as const,
    direction: "hybrid" as const,
    summary: "Start blank and wire the exact job: triggers, knowledge, tools, approvals, channels, handoffs, and the outcomes that matter to you.",
    outcomes: ["Define Any Job", "Connect the Right Tools", "Set the Rules"],
  },
] as const;

export const BOT_MARKETING_VOICE = {
  eyebrow: BOT_BRAND.supportingLine,
  headline: BOT_BRAND.slogan,
  subline: BOT_BRAND.promise,
  primaryCta: "Start Free",
  spine: ["Call", "Text", "Email"],
} as const;

export const BOT_WORKSPACE_PROMISE = {
  title: "YOUR BOT. ALREADY MOVING.",
  description:
    "Calls come in. Follow-ups go out. Context carries forward. You step in when you want to.",
} as const;
