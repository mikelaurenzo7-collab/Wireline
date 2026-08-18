export type BotChannelKey = "voice" | "text" | "email";
export type BotTemplateCategory = "Business" | "Personal" | "Custom";
export type BotDirection = "inbound" | "outbound" | "hybrid";
export type BotProductTypeKey = "voice" | "conversation" | "human";

export const BOT_BRAND = {
  name: "Wireline",
  slogan: "BOTS THAT GET THE WORK DONE",
  supportingLine: "VOICE-FIRST BOTS FOR CALLS, LIVE CONVERSATIONS, TEXT, AND EMAIL",
  promise:
    "Start with voice. Build a Bot that answers and makes calls, holds natural conversations, continues by text and email, books next steps, and follows through from one workspace.",
} as const;

export const BOT_PRODUCT_TYPES = [
  {
    key: "voice" as const,
    name: "Voice Bot",
    label: "VOICE BOT",
    description:
      "Answer inbound calls, make outbound calls, qualify needs, book next steps, transfer, and recap.",
  },
  {
    key: "conversation" as const,
    name: "Conversation Bot",
    label: "CONVERSATION BOT",
    description:
      "Carry one continuous customer conversation across voice, text, and email with shared context.",
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
    label: "Voice",
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
    summary: "Answer every inquiry, route the right calls, capture details, and book appointments.",
    outcomes: ["Answer Calls", "Qualify Needs", "Book Appointments"],
  },
  {
    key: "sales-rep",
    name: "Sales Rep",
    category: "Business" as const,
    direction: "hybrid" as const,
    summary: "Respond to leads, explain the offer, follow up, and move qualified buyers forward.",
    outcomes: ["Respond to Leads", "Follow Up", "Advance Deals"],
  },
  {
    key: "appointment-setter",
    name: "Appointment Setter",
    category: "Business" as const,
    direction: "outbound" as const,
    summary: "Reach prospects, handle common questions, and schedule the next conversation.",
    outcomes: ["Reach Prospects", "Handle Questions", "Set Meetings"],
  },
  {
    key: "customer-support",
    name: "Customer Support",
    category: "Business" as const,
    direction: "inbound" as const,
    summary: "Resolve routine requests, collect context, and escalate complex issues with a clean handoff.",
    outcomes: ["Resolve Requests", "Collect Context", "Escalate Safely"],
  },
  {
    key: "lead-qualifier",
    name: "Lead Qualifier",
    category: "Business" as const,
    direction: "hybrid" as const,
    summary: "Ask the right questions, score fit, and route qualified opportunities to the right person.",
    outcomes: ["Discover Needs", "Score Fit", "Route Leads"],
  },
  {
    key: "recruiter",
    name: "Recruiter",
    category: "Business" as const,
    direction: "hybrid" as const,
    summary: "Screen candidates, answer role questions, and coordinate interviews across channels.",
    outcomes: ["Screen Candidates", "Answer Questions", "Schedule Interviews"],
  },
  {
    key: "collections",
    name: "Collections",
    category: "Business" as const,
    direction: "outbound" as const,
    summary: "Send respectful reminders, capture payment intent, and escalate exceptions for review.",
    outcomes: ["Send Reminders", "Capture Intent", "Escalate Exceptions"],
  },
  {
    key: "property-manager",
    name: "Property Manager",
    category: "Business" as const,
    direction: "hybrid" as const,
    summary: "Handle leasing questions, maintenance intake, resident updates, and vendor coordination.",
    outcomes: ["Handle Inquiries", "Open Work Orders", "Coordinate Updates"],
  },
  {
    key: "personal-assistant",
    name: "Personal Assistant",
    category: "Personal" as const,
    direction: "hybrid" as const,
    summary: "Manage scheduling, reminders, research, and routine communications from the same workspace.",
    outcomes: ["Manage Schedule", "Send Reminders", "Coordinate Tasks"],
  },
  {
    key: "family-concierge",
    name: "Family Concierge",
    category: "Personal" as const,
    direction: "hybrid" as const,
    summary: "Coordinate household plans, appointments, reservations, and recurring family logistics.",
    outcomes: ["Coordinate Plans", "Book Services", "Track Follow-Up"],
  },
  {
    key: "custom",
    name: "Create Your Own",
    category: "Custom" as const,
    direction: "hybrid" as const,
    summary: "Start from a blank Bot and define its role, channels, knowledge, tools, rules, and handoffs.",
    outcomes: ["Define Any Role", "Choose Channels", "Set the Rules"],
  },
] as const;

export const BOT_MARKETING_VOICE = {
  eyebrow: BOT_BRAND.supportingLine,
  headline: BOT_BRAND.slogan,
  subline: BOT_BRAND.promise,
  primaryCta: "Build Your Bot",
  spine: ["Choose a Role", "Connect Channels", "Train Your Bot", "Go Live"],
} as const;

export const BOT_WORKSPACE_PROMISE = {
  title: "ONE WORKSPACE. EVERY BOT.",
  description:
    "Start with a Voice Bot, Conversation Bot, Human Bot, business role, personal role, or custom workflow. Every Bot uses the same workspace, shared context, controls, inbox, and operating history.",
} as const;
