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
  brandSpine: ["Build", "Train", "Launch"],
  proofLoop: ["Build", "Train", "Launch"],
  toneRules: [
    "Lead with the job, leverage, or outcome before AI mechanics.",
    "Use Phone Bot as the public acquisition wedge; Call, Text, and Email are the compact channel proof.",
    "Do not stack BotBound with Phone Bot or Voice Bot as a compound noun. The brand already contains Bot. Say BotBound, or say Phone Bot, not both.",
    "Treat workspace architecture as product proof, never as a marketing headline.",
    "Use Bot as the customer-facing object while keeping agent as the technical domain.",
    "Use Phone Bot, Conversation Bot, and Human Bot as configuration lenses, never separate products or workspaces.",
    "Treat employee roles as starting templates, not product categories or permanent limits.",
    "Make clear only when useful that one Bot can call, text, and email with shared context.",
    "Let customers train the playbook, channels, knowledge, tools, guardrails, approvals, and handoffs.",
    "State that the included BotBound number applies to paid plans so the free builder is never misrepresented.",
    "Treat additional Bots as optional expansion for concurrency or genuinely separate roles.",
    "Show logged proof after calls, texts, emails, handoffs, campaigns, and follow-up when proof helps the decision.",
    "Never present Personal or Business as a customer-facing product, workspace, signup, or pricing classification.",
    "Public headlines must create desire, tension, leverage, or curiosity before they explain architecture.",
    "Leave room for curiosity; do not explain every capability before account entry.",
    "Render slogans, heroes, titles, headers, tabs, buttons, navigation, and compact labels in uppercase when the design system calls for cased controls.",
    "Render the BotBound brand name in canonical mixed case everywhere it is customer-visible, including prose, metadata, and legal copy.",
    "Keep technical wireline identifiers, URLs, domains, email addresses, API names, event keys, and persisted values in their native casing.",
    "Never use Wire as a customer-facing setup step, nav label, or CTA. After create, the guide is Train, Test, Launch.",
    "Keep subheads, body copy, empty states, and anything the customer authored in sentence case.",
    "Never end a cased title with a period. A period closes a sentence; a cased title is a label.",
    "Prefer short sentences, concrete verbs, and specific outcomes.",
    "The public setup journey ends at Launch. Present conversation review and later refinements as optional controls, never a fourth setup step.",
    "Avoid em dashes, inflated AI language, repetitive descriptor copy, and stacked claims on public buying surfaces.",
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
  setupLabel: "Set Up Your Bot",
  setupPrompt: "What should your Bot do?",
  setupDescription: "Start with a role or your own idea. Refine it anytime.",
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
      "Answers live demand by phone, continues by text or email when useful, and routes only what needs a person.",
  },
  hybrid: {
    label: "All-Purpose Bot",
    eyebrow: "Bot for flexible operations",
    loop: ["Answer", "Act", "Follow Up", "Sync"],
    promise:
      "Keeps calls, text, email, sales, service, scheduling, and follow-through moving under your direction.",
  },
} as const;

export const AGENT_NUMBER_PROMISE =
  "Every paid Bot includes a BotBound number at no extra line fee. It can answer and make calls, take callbacks, send texts, and manage handoffs under your direction." as const;

export const OUTBOUND_WEDGE = {
  eyebrow: AGENT_DIRECTION_MODES.outbound.eyebrow,
  headline: "A Bot That Moves Growth Work Forward",
  subline:
    "Start with a Sales Associate Bot that researches leads, calls, handles the conversation, texts, emails, books, follows up, and logs proof. Change the role or add another Bot only when the work calls for it.",
  lanes: [
    "Appointment setting",
    "Lead revival",
    "Offer promotion",
    "Quote follow-up",
    "Payment recovery",
    "Inbound conversion",
  ],
  loop: AGENT_DIRECTION_MODES.outbound.loop,
  proof: ["Researches", "Calls", "Texts", "Emails", "Books", "Reports"],
  differentiator:
    "BotBound turns calls, text, and email into completed tasks, booked appointments, revived leads, handled callbacks, recovered opportunities, and logged proof.",
  beforeStrip:
    "Build one capable Bot or a coordinated roster. Train each role, connect the right channels, and improve from logged outcomes.",
} as const;

export const MARKETING_VOICE = {
  eyebrow: BOT_BRAND.supportingLine,
  headline: BOT_BRAND.slogan,
  primaryCta: "Start Free",
  subline: BOT_BRAND.promise,
  channelProof: ["Call", "Text", "Email"],
  spine: BRAND_SYSTEM.brandSpine,
  proof: BRAND_SYSTEM.proofLoop,
  extensionLead:
    "Send this page into Studio. Your Bot can prepare a call, draft a text, or follow up without leaving the tab.",
  differentiator: OUTBOUND_WEDGE.differentiator,
  buyingNoun: BRAND_SYSTEM.buyingNoun,
} as const;

export const CLIENT_SURFACE_POSTURE = {
  summary:
    "Build, train, and launch on the web. Optional companion apps keep your Bot close at hand.",
  browser: { status: "Early access", action: "Install Guide" },
  chatgpt: { status: "Early access", action: "Open Guide" },
  claude: { status: "Early access", action: "Add Connector" },
  cursor: { status: "Early access", action: "Add in Cursor" },
  android: { status: "Internal beta", action: "Internal Testing" },
  ios: { status: "Planned", action: "Join Waitlist" },
} as const;

/** Retained export name for compatibility with older marketing modules. */
export const BUSINESS_MARKETING_VOICE = {
  eyebrow: "PHONE BOTS FOR CALLS, TEXT, AND EMAIL",
  proof: ["Answers calls", "Makes calls", "Sends texts", "Continues by email", "Logs outcomes"],
  differentiator: "BotBound keeps valuable conversations moving across calls, text, and email.",
  beforeStrip: OUTBOUND_WEDGE.beforeStrip,
} as const;

export const WORKSPACE_VOICE = {
  createHeadline: "Build Your Bot",
  runHeadline: "Your Bot Is Live",
  emptyCue: "Describe the job. Connect calls, text, email, knowledge, and tools.",
  configurePrompts: ["Adjust the greeting", "Change the tone", "Add a rule"],
  testPrompts: [
    "What can you help with?",
    "I want to book an appointment.",
    "Can you follow up by text?",
    "I need to speak with a person.",
  ],
} as const;

export const PRODUCT_VERSATILITY = {
  eyebrow: "YOUR BOT. ANY USE CASE.",
  tagline:
    "Start with a Phone Bot, Conversation Bot, Human Bot, or role template. Add another only when a separate role or more capacity helps.",
  short:
    "Bots for calling, texting, email, sales, marketing, appointment setting, lead revival, support, scheduling, follow-up, inbound conversion, recovery, and personal admin.",
  hero: "Give the work a Bot. Step in only when you want to.",
} as const;

/** Legacy keys remain, but both render the same unified Bot posture. */
export const PRODUCT_POSTURE = {
  personal: {
    badge: "Bot",
    badgeShort: "Bot",
    createCta: "Build Your Bot",
    emptyTitle: "Your Bot",
    emptyBody: "Calls, text, email, tools, and outcomes with your Bot.",
  },
  business: {
    badge: "Bot",
    badgeShort: "Bot",
    createCta: "Build Your Bot",
    emptyTitle: "Your Bot",
    emptyBody: "Calls, text, email, tools, and outcomes with your Bot.",
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
  "BotBound Bots follow your disclosure policy, consent rules, and conversation purpose. When disclosure is required or enabled, BotBound logs it automatically. The goal is quick, clear qualification and real opportunities that move forward." as const;

export function rosterSummary(personalCount: number, businessCount: number): string {
  const total = personalCount + businessCount;
  if (total === 0) return "No Bots yet";
  return `${total} Bot${total === 1 ? "" : "s"}`;
}
