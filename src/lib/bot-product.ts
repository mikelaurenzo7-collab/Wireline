export type BotChannelKey = "voice" | "text" | "email";
export type BotTemplateCategory = "Operations" | "Everyday" | "Custom";
export type BotDirection = "inbound" | "outbound" | "hybrid";
export type BotProductTypeKey = "voice" | "conversation" | "human";

export const BOT_BRAND = {
  name: "BotBound",
  slogan: "For You. For Your Business.",
  supportingLine: "CALL · EMAIL · COMPUTER",
  promise: "Your Bot for incoming calls, reviewed calls, email, and computer tasks.",
} as const;

export const BOT_PRODUCT_TYPES = [
  {
    key: "voice" as const,
    name: "Phone Bot",
    label: "PHONE BOT",
    description:
      "Answer incoming calls, place reviewed personal or business calls, and capture requests.",
  },
  {
    key: "conversation" as const,
    name: "Conversation Bot",
    label: "CONVERSATION BOT",
    description: "Keep calls and email together with shared context and clear next steps.",
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
    description: "Answer incoming calls, capture requests, and route callers to the right person.",
  },
  {
    key: "text" as const,
    label: "Text",
    description: "Send and reply to texts. Recipient permission still applies.",
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
    summary: "Greet every caller, answer questions, and take appointment requests.",
    outcomes: ["Route Calls", "Capture Intake", "Request Appointments"],
    moves: [
      "Intent + urgency + routing",
      "Caller + service intake",
      "Appointment requests + owner review",
    ],
  },
  {
    key: "sales-rep",
    name: "Sales Rep",
    category: "Operations" as const,
    direction: "inbound" as const,
    summary: "Answer incoming product questions and capture interest for owner review.",
    outcomes: ["Answer Questions", "Understand Needs", "Capture Interest"],
    moves: [
      "Incoming product questions",
      "Needs + timing + approved answers",
      "Owner handoff + next steps",
    ],
  },
  {
    key: "appointment-setter",
    name: "Appointment Setter",
    category: "Operations" as const,
    direction: "inbound" as const,
    summary: "Take scheduling calls, gather preferred times, and pass along booking requests.",
    outcomes: ["Collect Availability", "Confirm Details", "Request Appointments"],
    moves: [
      "Availability + preferred times",
      "Questions + appointment details",
      "Booking requests + owner review",
    ],
  },
  {
    key: "customer-support",
    name: "Customer Support",
    category: "Operations" as const,
    direction: "inbound" as const,
    summary: "Answer the everyday questions and hand off the rest with full context.",
    outcomes: ["Resolve Requests", "Collect Diagnostics", "Escalate With Context"],
    moves: [
      "Answers from your knowledge",
      "Account + issue diagnostics",
      "Transcript + context escalation",
    ],
  },
  {
    key: "lead-qualifier",
    name: "Lead Qualifier",
    category: "Operations" as const,
    direction: "inbound" as const,
    summary: "Understand incoming inquiries and send the owner a useful summary.",
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
    direction: "inbound" as const,
    summary: "Answer candidate questions and capture availability for owner review.",
    outcomes: ["Answer Role Questions", "Collect Availability", "Capture Interview Requests"],
    moves: [
      "Approved role information",
      "Candidate FAQ + availability",
      "Interview requests + owner review",
    ],
  },
  {
    key: "property-manager",
    name: "Property Manager",
    category: "Operations" as const,
    direction: "inbound" as const,
    summary: "Answer leasing questions and capture maintenance requests for the owner.",
    outcomes: ["Handle Leasing Inquiries", "Capture Requests", "Notify the Owner"],
    moves: [
      "Leasing + maintenance triage",
      "Unit + access + urgency intake",
      "Owner handoff + next steps",
    ],
  },
  {
    key: "personal-assistant",
    name: "Personal Assistant",
    category: "Everyday" as const,
    direction: "hybrid" as const,
    summary: "Answer your calls, sort your email, and research what is on your list.",
    outcomes: ["Organize Plans", "Research Options", "Coordinate Tasks"],
    moves: ["Incoming calls + messages", "Research + concise briefs", "Email + next steps"],
  },
  {
    key: "family-concierge",
    name: "Family Concierge",
    category: "Everyday" as const,
    direction: "hybrid" as const,
    summary: "Keep household plans, requests, and details in one place.",
    outcomes: ["Coordinate Plans", "Research Services", "Track Household Tasks"],
    moves: ["Plans + shared details", "Household requests + owner review", "Email + next steps"],
  },
  {
    key: "custom",
    name: "Create Your Own",
    category: "Custom" as const,
    direction: "inbound" as const,
    summary: "Describe any job you need covered and build a Bot around it.",
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
  primaryCta: "Get Started",
  spine: ["Call", "Email", "Computer"],
} as const;

export const BOT_WORKSPACE_PROMISE = {
  title: "Your Bot. Already Moving",
  description: "Calls, conversations, and tasks stay together. You step in when you want to.",
} as const;
