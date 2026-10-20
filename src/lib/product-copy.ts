import { BOT_BRAND, BOT_PRODUCT_TYPES } from "./bot-product";

/** Shared customer-facing product voice. Technical routes, schemas, events, and APIs retain `agent` for compatibility. */

export const BRAND_SYSTEM = {
  northStar: BOT_BRAND.promise,
  slogan: BOT_BRAND.slogan,
  supportingLine: BOT_BRAND.supportingLine,
  productNoun: "Bot",
  buyingNoun: "Bot",
  defaultRole: "Your Bot",
  productTypes: BOT_PRODUCT_TYPES,
  toneRules: [
    "Lead with the job or outcome before AI mechanics.",
    "Lead with Voice Bots with a computer, phone number, and email address. Call, Email, and Computer are the compact capability proof.",
    "Do not stack BotBound with Phone Bot or Voice Bot as a compound noun. The brand already contains Bot. Say BotBound, or say Phone Bot, not both.",
    "Treat workspace architecture as product proof, never as a marketing headline.",
    "Use Bot as the customer-facing object while keeping agent as the technical domain.",
    "Use Phone Bot, Conversation Bot, and Human Bot as configuration lenses, never separate products or workspaces.",
    "Treat employee roles as starting templates, not product categories or permanent limits.",
    "Show incoming business calls, email, computer tasks, and personal calling as the launch uses. SMS and business outbound are coming soon.",
    "Let customers train the playbook, channels, knowledge, tools, guardrails, approvals, and handoffs.",
    "Only promise a number for launch plans that include Calls, and an inbox for plans that include Email. Preserve existing SMS access without promoting new SMS setup.",
    "Treat additional Bots as optional expansion for concurrency or genuinely separate roles.",
    "Show logged proof after calls, emails, computer tasks, and handoffs when proof helps the decision.",
    "Never present Personal or Business as a customer-facing product, workspace, signup, or pricing classification.",
    "Public headlines must create desire, tension, leverage, or curiosity before they explain architecture.",
    "Leave room for curiosity; do not explain every capability before account entry.",
    "Author every product title and heading in Title Case, including heroes, page titles, section titles, cards, dialogs, and empty-state titles. Never uppercase headings with CSS.",
    "Keep deliberate uppercase styling limited to compact overlines, operational labels, buttons, tabs, and navigation; a control style must not change a title.",
    "Render the BotBound brand name in canonical mixed case everywhere it is customer-visible, including prose, metadata, and legal copy.",
    "Keep technical wireline identifiers, URLs, domains, email addresses, API names, event keys, and persisted values in their native casing.",
    "Never use Wire as a customer-facing setup step, nav label, or CTA. Keep changing the Bot and trying it privately together in the Workspace's Set Up before Launch.",
    "Keep explanatory body copy, supporting descriptions, and status messages in sentence case. Preserve customer-authored text exactly, including its casing.",
    "Preserve proper names and acronyms in titles. Keep short articles, conjunctions, and prepositions lowercase unless they begin or end a title.",
    "Do not end a title with a period; retain a question mark when the title is a question.",
    "Prefer short sentences, concrete verbs, and specific outcomes.",
    "Public marketing leads with capabilities, outcomes, and a clear signup action. Do not add a public setup sequence or repeat process slogans. Keep operational setup guidance inside the product.",
    "Avoid hyphens, en dashes, and em dashes in product prose. Preserve technical identifiers, URLs, and customer text. Avoid inflated AI language, repetitive descriptions, and stacked claims.",
  ],
} as const;

/**
 * Retained as an internal compatibility type while legacy account and agent
 * records are migrated. It must not create separate customer-facing workspaces.
 */
export type CustomerAgentPosture = "personal" | "business";

const BOT_LANGUAGE = {
  singular: "Bot",
  indefiniteSingular: "a Bot",
  plural: "Bots",
  navLabel: "Workspace",
  navShort: "Workspace",
  createCta: "Create Bot",
  createCtaShort: "Create Bot",
  setupLabel: "Set Up Your Bot",
  setupPrompt: "What Should Your Bot Do?",
  setupDescription: "Choose a role or describe a job.",
  nameLabel: "Bot Name",
} as const;

/** Both legacy postures deliberately resolve to the same customer language. */
export const CUSTOMER_AGENT_LANGUAGE = {
  personal: BOT_LANGUAGE,
  business: BOT_LANGUAGE,
} as const satisfies Record<
  CustomerAgentPosture,
  {
    singular: string;
    indefiniteSingular: string;
    plural: string;
    navLabel: string;
    navShort: string;
    createCta: string;
    createCtaShort: string;
    setupLabel: string;
    setupPrompt: string;
    setupDescription: string;
    nameLabel: string;
  }
>;

export function customerAgentLanguage(_posture?: CustomerAgentPosture) {
  return BOT_LANGUAGE;
}

/** Role starters. Keys remain stable because signup links and analytics use them. */
export const AGENT_DIRECTION_MODES = {
  outbound: {
    label: "Personal Assistant",
    eyebrow: "Bot for everyday coordination",
    loop: ["Research", "Review", "Call", "Log"],
    promise:
      "Researches the task and helps coordinate personal plans through calls you review. Business outbound is coming soon.",
  },
  inbound: {
    label: "Receptionist",
    eyebrow: "Bot for incoming calls",
    loop: ["Answer", "Understand", "Help", "Log"],
    promise:
      "Answers incoming calls, captures requests, continues by email, and brings you in when needed.",
  },
  hybrid: {
    label: "Flexible Assistant",
    eyebrow: "Bot for life and work",
    loop: ["Answer", "Research", "Reply", "Log"],
    promise: "Keeps calls, email, and computer tasks together under your direction.",
  },
} as const;

export const AGENT_NUMBER_PROMISE =
  "Plans with calls include a BotBound number at no extra line fee. Answer incoming calls or coordinate personal plans with recipient permission. SMS is coming soon." as const;

export const OUTBOUND_WEDGE = {
  eyebrow: AGENT_DIRECTION_MODES.outbound.eyebrow,
  headline: "A Bot That Helps With Everyday Plans",
  subline:
    "Research options, prepare email, and review personal calls for appointments and service requests. Business outbound is coming soon.",
  lanes: [
    "Appointment requests",
    "Service coordination",
    "Web research",
    "Email preparation",
    "Personal admin",
    "Incoming questions",
  ],
  loop: AGENT_DIRECTION_MODES.outbound.loop,
  proof: ["Researches", "Prepares", "Calls", "Emails", "Coordinates", "Reports"],
  differentiator:
    "Your Bot answers calls, works with email, and uses a computer to help with the next step.",
  beforeStrip:
    "Build one capable Bot or a coordinated roster. Train each role, connect the right channels, and improve from logged outcomes.",
} as const;

export const MARKETING_VOICE = {
  eyebrow: BOT_BRAND.supportingLine,
  headline: BOT_BRAND.slogan,
  primaryCta: "Start Free",
  subline: BOT_BRAND.promise,
  channelProof: ["Call", "Email", "Computer"],
  extensionLead:
    "Send this page to your Workspace to research it, draft an email, or prepare a personal call for review.",
  differentiator: OUTBOUND_WEDGE.differentiator,
  buyingNoun: BRAND_SYSTEM.buyingNoun,
} as const;

export const CLIENT_SURFACE_POSTURE = {
  summary: "Your Bots work from the web. Optional companion apps keep them close at hand.",
  browser: { status: "Early access", action: "Install Guide" },
  chatgpt: { status: "Early access", action: "Open Guide" },
  claude: { status: "Early access", action: "Add Connector" },
  cursor: { status: "Early access", action: "Add in Cursor" },
  android: { status: "Internal beta", action: "Internal Testing" },
  ios: { status: "Planned", action: "Join Waitlist" },
} as const;

/** Retained export name for compatibility with older marketing modules. */
export const BUSINESS_MARKETING_VOICE = {
  eyebrow: "VOICE BOTS WITH A COMPUTER, PHONE NUMBER, AND EMAIL ADDRESS",
  proof: [
    "Answers calls",
    "Captures requests",
    "Uses a computer",
    "Replies by email",
    "Logs outcomes",
  ],
  differentiator: "BotBound helps small businesses answer incoming calls and continue by email.",
  beforeStrip: OUTBOUND_WEDGE.beforeStrip,
} as const;

export const WORKSPACE_VOICE = {
  createHeadline: "Create Your Bot",
  runHeadline: "Your Bot Is Live",
  emptyCue: "Describe the job. Connect calls, email, knowledge, and computer tasks.",
  configurePrompts: ["Adjust the greeting", "Change the tone", "Add a rule"],
  testPrompts: [
    "What can you help with?",
    "I want to book an appointment.",
    "Can you send the details by email?",
    "I need to speak with a person.",
  ],
} as const;

export const PRODUCT_VERSATILITY = {
  eyebrow: "YOUR BOT. ANY USE CASE.",
  tagline:
    "Start with a Phone Bot, Conversation Bot, Human Bot, or role template. Add another only when a separate role or more capacity helps.",
  short:
    "Bots for incoming calls, email, web research, support, appointment requests, and personal coordination.",
  hero: "Give the Work a Bot. Step In Only When You Want To",
} as const;

/** Legacy keys remain, but both render the same unified Bot posture. */
export const PRODUCT_POSTURE = {
  personal: {
    badge: "Bot",
    badgeShort: "Bot",
    createCta: "Create Your Bot",
    emptyTitle: "Your Bot",
    emptyBody: "Calls, email, computer tasks, and outcomes with your Bot.",
  },
  business: {
    badge: "Bot",
    badgeShort: "Bot",
    createCta: "Create Your Bot",
    emptyTitle: "Your Bot",
    emptyBody: "Calls, email, computer tasks, and outcomes with your Bot.",
  },
} as const;

export function formatAgentRoleLabel(role?: string | null): string {
  if (role === "ceo") return "Lead Bot";
  return (role || "bot")
    .replace(/^wireline_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** Canonical trust posture for sales and regulated verticals. Policy driven, not stealth. */
export const TRUST_DISCLOSURE_FAQ =
  "BotBound Bots follow your disclosure policy, consent rules, and conversation purpose. When disclosure is required or enabled, BotBound logs it automatically. Personal calling still requires recipient permission." as const;

export function rosterSummary(personalCount: number, businessCount: number): string {
  const total = personalCount + businessCount;
  if (total === 0) return "No Bots yet";
  return `${total} Bot${total === 1 ? "" : "s"}`;
}
