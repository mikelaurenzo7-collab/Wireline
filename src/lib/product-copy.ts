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
  brandSpine: ["Build", "Configure", "Launch"],
  proofLoop: ["Build", "Configure", "Launch", "Improve"],
  toneRules: [
    "Lead with voice, the job, and the outcome before AI mechanics.",
    "Present one Wireline workspace, never separate personal and business workspaces.",
    "Use Bot as the customer-facing object while keeping agent as the technical domain.",
    "Use Voice Bot, Conversation Bot, and Human Bot as configurable starting points, never separate products or workspaces.",
    "Treat employee roles as starting templates, not product categories or permanent limits.",
    "Make clear that one Bot can use voice, text, and email under one identity and memory.",
    "Let customers configure the playbook, voice, channels, knowledge, tools, guardrails, approvals, and handoffs.",
    "State that the included Wireline number applies to paid plans so the free builder is never misrepresented.",
    "Treat additional Bots as optional expansion for concurrency or genuinely separate roles.",
    "Show logged proof after every call, text, email, handoff, campaign, and follow-up.",
    "Never require customers to classify a Bot as personal or business before describing the work.",
    "Render slogans, heroes, titles, headers, tabs, buttons, navigation, and compact labels in uppercase.",
    "Keep the Wireline wordmark and named Bot types in Title Case when used inside prose.",
    "Keep subheads, body copy, empty states, and anything the customer authored in sentence case.",
    "Never end a cased title with a period. A period closes a sentence; a cased title is a label.",
    "Prefer short sentences, concrete verbs, and specific outcomes.",
    "Avoid em dashes, inflated AI language, and stacked claims on public buying surfaces.",
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
  navLabel: "Bot Studio",
  navShort: "Studio",
  createCta: "Create Bot",
  createCtaShort: "Create Bot",
  setupLabel: "Configure Your Bot",
  setupPrompt: "What should your Bot do?",
  setupDescription:
    "Choose a role starter or describe any workflow. You can change every capability later.",
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

export function customerAgentLanguage(_posture: CustomerAgentPosture) {
  return BOT_LANGUAGE;
}

/** Role starters. Keys remain stable because signup links and analytics use them. */
export const AGENT_DIRECTION_MODES = {
  outbound: {
    label: "Sales Associate",
    eyebrow: "Bot for sales and growth",
    loop: ["Research", "Call", "Book", "Log"],
    promise:
      "Researches the lead, calls with context, sends the follow-up, books the meeting, and logs what moved forward.",
  },
  inbound: {
    label: "Receptionist",
    eyebrow: "Bot for inbound demand",
    loop: ["Answer", "Qualify", "Act", "Log"],
    promise:
      "Answers live demand by voice, continues by text or email when useful, and routes only what needs a person.",
  },
  hybrid: {
    label: "All-Purpose Bot",
    eyebrow: "Bot for flexible operations",
    loop: ["Answer", "Act", "Follow Up", "Sync"],
    promise:
      "Keeps calls, live conversations, texts, email, sales, service, scheduling, and follow-through in one visible workflow under your direction.",
  },
} as const;

export const AGENT_NUMBER_PROMISE =
  "Every paid Bot includes a Wireline number at no extra line fee. It can answer and make calls, take callbacks, send texts, and manage handoffs under your direction." as const;

export const OUTBOUND_WEDGE = {
  eyebrow: AGENT_DIRECTION_MODES.outbound.eyebrow,
  headline: "A Bot That Moves Growth Work Forward",
  subline:
    "Start with a Sales Associate Bot that researches leads, calls, holds the conversation, texts, emails, sells, books, follows up, and logs proof. Change the role or add another Bot only when the work calls for it.",
  lanes: [
    "Appointment setting",
    "Lead revival",
    "Offer promotion",
    "Quote follow-up",
    "Payment recovery",
    "Inbound conversion",
  ],
  loop: AGENT_DIRECTION_MODES.outbound.loop,
  proof: ["Researches", "Calls", "Conversations", "Texts", "Emails", "Books", "Reports"],
  differentiator:
    "Wireline turns voice calls, live conversations, texts, and email into completed tasks, booked appointments, revived leads, handled callbacks, recovered opportunities, and logged proof.",
  beforeStrip:
    "Build one capable Bot or a coordinated roster. Configure each role, connect the right channels, and improve from logged outcomes.",
} as const;

export const MARKETING_VOICE = {
  eyebrow: BOT_BRAND.supportingLine,
  headline: BOT_BRAND.slogan,
  primaryCta: "Build Your Bot",
  subline: BOT_BRAND.promise,
  channelProof: [
    "Voice calls",
    "Live conversations",
    "Text messages",
    "Email follow-up",
    "Shared knowledge",
    "Connected tools",
    "Clear guardrails",
  ],
  spine: BRAND_SYSTEM.brandSpine,
  proof: BRAND_SYSTEM.proofLoop,
  extensionLead:
    "Send the page you are viewing into Studio as reference context. Your Bot can prepare a call, draft a text, or follow up without making you leave the tab.",
  differentiator: OUTBOUND_WEDGE.differentiator,
  buyingNoun: BRAND_SYSTEM.buyingNoun,
} as const;

export const CLIENT_SURFACE_POSTURE = {
  summary:
    "Launch on the web. Build, Configure, Launch, and Improve are complete in the browser; the rest are optional companions. None are required for the core product.",
  browser: { status: "Early access", action: "Install Guide" },
  chatgpt: { status: "Early access", action: "Open Guide" },
  claude: { status: "Early access", action: "Add Connector" },
  cursor: { status: "Early access", action: "Add in Cursor" },
  android: { status: "Internal beta", action: "Internal Testing" },
  ios: { status: "Planned", action: "Join Waitlist" },
} as const;

/** Retained export name for compatibility with older marketing modules. */
export const BUSINESS_MARKETING_VOICE = {
  eyebrow: "VOICE-FIRST BOTS FOR EVERY CUSTOMER CONVERSATION",
  proof: ["Answers calls", "Makes calls", "Continues by text", "Sends email", "Logs outcomes"],
  differentiator:
    "Wireline keeps valuable conversations moving across voice, live conversation, text, and email.",
  beforeStrip: OUTBOUND_WEDGE.beforeStrip,
} as const;

export const WORKSPACE_VOICE = {
  createHeadline: "Build Your Bot",
  runHeadline: "Your Bot Is Live",
  emptyCue: "Describe the job. Connect voice, text, email, knowledge, and tools.",
  configurePrompts: ["Adjust the greeting", "Change the tone", "Add a rule"],
  testPrompts: [
    "What can you help with?",
    "I want to book an appointment.",
    "Can you follow up by text?",
    "I need to speak with a person.",
  ],
} as const;

export const PRODUCT_VERSATILITY = {
  eyebrow: "ONE BOT. ANY USE CASE.",
  tagline:
    "Start with a Voice Bot, Conversation Bot, Human Bot, or role template. Add another only when a separate role or more capacity helps.",
  short:
    "Bots for calling, live conversation, texting, email, sales, marketing, appointment setting, lead revival, support, scheduling, follow-up, inbound conversion, recovery, and personal admin.",
  hero: "One workspace for every Bot and every conversation that keeps work and life moving.",
} as const;

/** Legacy keys remain, but both render the same unified Bot posture. */
export const PRODUCT_POSTURE = {
  personal: {
    badge: "Bot",
    badgeShort: "Bot",
    createCta: "Build Your Bot",
    emptyTitle: "Your Bot",
    emptyBody: "Voice, live conversation, text, email, tools, and outcomes in one workspace.",
  },
  business: {
    badge: "Bot",
    badgeShort: "Bot",
    createCta: "Build Your Bot",
    emptyTitle: "Your Bot",
    emptyBody: "Voice, live conversation, text, email, tools, and outcomes in one workspace.",
  },
} as const;

export function formatAgentRoleLabel(role?: string | null): string {
  if (role === "ceo") return "Lead Bot";
  return (role || "bot").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** Canonical trust posture for sales and regulated verticals. Policy driven, not stealth. */
export const TRUST_DISCLOSURE_FAQ =
  "Wireline Bots follow your disclosure policy, consent rules, and conversation purpose. When disclosure is required or enabled, Wireline logs it automatically. The goal is quick, clear qualification and real opportunities that move forward." as const;

export function rosterSummary(personalCount: number, businessCount: number): string {
  const total = personalCount + businessCount;
  if (total === 0) return "No Bots yet";
  return `${total} Bot${total === 1 ? "" : "s"}`;
}
