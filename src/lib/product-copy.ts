/** Shared customer-facing product voice. Technical routes, schemas, events, and APIs retain `agent` for compatibility. */

export const BRAND_SYSTEM = {
  northStar: "One Bot for calls, texts, email, and the work between them.",
  productNoun: "Bot",
  buyingNoun: "Bot",
  defaultRole: "Your Bot",
  brandSpine: ["Build", "Configure", "Launch"],
  proofLoop: ["Build", "Configure", "Launch", "Improve"],
  toneRules: [
    "Lead with the job and outcome before AI mechanics.",
    "Present one Wireline workspace, never separate personal and business workspaces.",
    "Use Bot as the customer-facing object while keeping agent as the technical domain.",
    "Treat employee roles as starting templates, not product categories or permanent limits.",
    "Make clear that one Bot can use voice, text, and email under one identity and memory.",
    "Let customers configure the playbook, voice, channels, knowledge, tools, guardrails, approvals, and handoffs.",
    "State that the included Wireline number applies to paid plans so the free builder is never misrepresented.",
    "Treat additional Bots as optional expansion for concurrency or genuinely separate roles.",
    "Show logged proof after every call, text, email, handoff, campaign, and follow-up.",
    "Never require customers to classify a Bot as personal or business before describing the work.",
    "Rank by case. Titles, headers, heroes, tabs, and buttons render uppercase; sentences do not.",
    "Write titles, labels, tabs, and buttons of three words or fewer in Title Case at the source, so they read as deliberate labels wherever the uppercase tier does not apply.",
    "Never end a cased title with a period. A period closes a sentence; a cased title is a label.",
    "Keep subheads, body copy, empty states, and anything the customer authored in sentence case.",
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
      "Answers live demand, continues by text or email when useful, and routes only what needs a person.",
  },
  hybrid: {
    label: "All-Purpose Bot",
    eyebrow: "Bot for flexible operations",
    loop: ["Answer", "Act", "Follow Up", "Sync"],
    promise:
      "Keeps calls, texts, email, sales, service, scheduling, and follow-through in one visible workflow under your direction.",
  },
} as const;

export const AGENT_NUMBER_PROMISE =
  "Every paid Bot includes a Wireline number at no extra line fee. It can call, take callbacks, send texts, and manage handoffs under your direction." as const;

export const OUTBOUND_WEDGE = {
  eyebrow: AGENT_DIRECTION_MODES.outbound.eyebrow,
  headline: "A Bot that moves growth work forward",
  subline:
    "Start with a Sales Associate Bot that researches leads, calls, texts, emails, sells, books, follows up, and logs proof. Change the role or add another Bot only when the work calls for it.",
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
    "Wireline turns calls, texts, and email into completed tasks, booked appointments, revived leads, handled callbacks, recovered opportunities, and logged proof.",
  beforeStrip:
    "Build one capable Bot or a coordinated roster. Configure each role, connect the right channels, and improve from logged outcomes.",
} as const;

export const MARKETING_VOICE = {
  eyebrow: null,
  headline: "Build a Bot for Any Job",
  primaryCta: "Build Your Bot",
  subline:
    "Choose a role or describe the work. Configure its voice, text, email, knowledge, tools, and rules in one workspace.",
  channelProof: [
    "Voice calls",
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
  browser: { status: "Early access", action: "Install guide" },
  chatgpt: { status: "Early access", action: "Open guide" },
  claude: { status: "Early access", action: "Add connector" },
  cursor: { status: "Early access", action: "Add in Cursor" },
  android: { status: "Internal beta", action: "Internal testing" },
  ios: { status: "Planned", action: "Join waitlist" },
} as const;

/** Retained export name for compatibility with older marketing modules. */
export const BUSINESS_MARKETING_VOICE = {
  eyebrow: "Bots for every customer conversation",
  proof: ["Calls customers", "Texts follow-ups", "Sends email", "Logs outcomes"],
  differentiator: "Wireline keeps valuable conversations moving across voice, text, and email.",
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
  eyebrow: "One Bot, any use case",
  tagline: "Start with one Bot. Add another only when a separate role or more capacity helps.",
  short:
    "Bots for calling, texting, email, sales, marketing, appointment setting, lead revival, support, scheduling, follow-up, inbound conversion, recovery, and personal admin.",
  hero: "One workspace for the Bots and conversations that keep work and life moving.",
} as const;

/** Legacy keys remain, but both render the same unified Bot posture. */
export const PRODUCT_POSTURE = {
  personal: {
    badge: "Bot",
    badgeShort: "Bot",
    createCta: "Build Your Bot",
    emptyTitle: "Your Bot",
    emptyBody: "Voice, text, email, tools, and outcomes in one workspace.",
  },
  business: {
    badge: "Bot",
    badgeShort: "Bot",
    createCta: "Build Your Bot",
    emptyTitle: "Your Bot",
    emptyBody: "Voice, text, email, tools, and outcomes in one workspace.",
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
