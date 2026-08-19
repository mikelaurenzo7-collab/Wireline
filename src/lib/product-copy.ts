/** Shared product voice for public marketing, workspace copy, and audience positioning. */

export const BRAND_SYSTEM = {
  northStar: "Voice agents that call, answer, follow up, and finish the work.",
  productNoun: "Voice agent",
  /** Public buying-surface noun. Specialize by role, never by workspace brand. */
  buyingNoun: "Voice Agent",
  defaultRole: "Your voice agent",
  brandSpine: ["Build", "Train", "Launch"],
  proofLoop: ["Build", "Train", "Launch", "Improve"],
  toneRules: [
    "Lead with outcomes before AI mechanics.",
    "Welcome every use case without splitting the product into personal and business workspaces.",
    "Make clear that customers can start with one voice agent and add specialized voice agents as their needs grow.",
    "Keep the owner in control: guardrails, approvals, spend, handoffs, and escalation stay explicit.",
    "Present calling, texting, and email as channels each trained voice agent can use, not separate products customers must assemble.",
    "State that the included Wireline number applies to paid plans so the free builder is never misrepresented.",
    "Treat specialists as optional expansion, not setup homework.",
    "Show logged proof after every call, text, email, handoff, campaign, and follow-up.",
    "Never name the customer-facing role after the platform; Wireline is the platform and the customer owns the agent.",
    "On every customer surface, use Voice Agent. Specialize by role, not by workspace brand.",
    "Rank by case. Titles, headers, heroes, tabs, and buttons render uppercase; sentences do not.",
    "Write titles, labels, tabs, and buttons of three words or fewer in Title Case at the source, so they read as deliberate labels wherever the uppercase tier does not apply.",
    "Never end a cased title with a period. A period closes a sentence; a cased title is a label.",
    "Keep subheads, body copy, empty states, and anything the customer authored in sentence case.",
    "Prefer short sentences, concrete verbs, and specific outcomes.",
    "Avoid em dashes, inflated AI language, and stacked claims on public buying surfaces.",
  ],
} as const;

export type CustomerAgentPosture = "personal" | "business";

const VOICE_AGENT_LANGUAGE = {
  singular: "voice agent",
  indefiniteSingular: "a voice agent",
  plural: "voice agents",
  navLabel: "Voice Agent",
  navShort: "Agent",
  createCta: "Create Voice Agent",
  createCtaShort: "Create Voice Agent",
  setupLabel: "Voice Agent in About a Minute",
  setupPrompt: "What should this voice agent handle?",
  setupDescription: "Start with one job. Change the role anytime.",
  nameLabel: "Agent Name",
} as const;

/**
 * One customer noun: Voice Agent. The technical domain remains `agent` in
 * routes, schemas, events, and APIs. Both posture keys return the same
 * language so leftover callers keep compiling without a second product.
 */
export const CUSTOMER_AGENT_LANGUAGE = {
  personal: VOICE_AGENT_LANGUAGE,
  business: VOICE_AGENT_LANGUAGE,
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

export function customerAgentLanguage(posture: CustomerAgentPosture) {
  return CUSTOMER_AGENT_LANGUAGE[posture];
}

export const AGENT_DIRECTION_MODES = {
  outbound: {
    label: "Sales",
    eyebrow: "Voice agent for outbound growth",
    loop: ["Research", "Call", "Book", "Log"],
    promise:
      "Researches the lead, calls with context, sends the follow up, books the meeting, and logs what moved forward.",
  },
  inbound: {
    label: "Service",
    eyebrow: "Voice agent for demand capture",
    loop: ["Answer", "Qualify", "Act", "Log"],
    promise:
      "Answers live demand, continues by text or email when useful, and routes only what needs a person.",
  },
  hybrid: {
    // Title Case, not sentence case: this is a two-word tab label, not a
    // sentence. Wireline's case rule is that anything three words or fewer in a
    // title/label/tab/button slot is Title Case at the source and UPPERCASE
    // where the tier applies, so it reads as a deliberate label in the places
    // that do not uppercase it (native clients, aria labels, document titles).
    label: "All Purpose",
    eyebrow: "Voice agent for daily operations",
    loop: ["Answer", "Sell", "Follow up", "Sync"],
    promise:
      "Keeps calls, texts, email, sales, service, scheduling, and follow through in one visible workflow under the owner's direction.",
  },
} as const;

export const AGENT_NUMBER_PROMISE =
  "Every paid voice agent includes a Wireline number at no extra line fee. It can call, take callbacks, send texts, and manage handoffs under your direction." as const;

export const OUTBOUND_WEDGE = {
  eyebrow: AGENT_DIRECTION_MODES.outbound.eyebrow,
  headline: "A voice agent that moves growth work forward",
  subline:
    "Start with one capable voice agent that researches leads, calls, texts, emails, sells, books, follows up, and logs proof. Add specialists only when volume or workflow complexity calls for them.",
  lanes: [
    "Appointment setting",
    "Lead revival",
    "Offer promotion",
    "Quote follow up",
    "Payment recovery",
    "Inbound conversion",
  ],
  loop: AGENT_DIRECTION_MODES.outbound.loop,
  proof: ["Researches", "Calls", "Texts", "Emails", "Books", "Reports"],
  differentiator:
    "Wireline turns calls, texts, and email into completed tasks, booked appointments, revived leads, handled callbacks, recovered opportunities, and logged proof.",
  beforeStrip:
    "Build one capable voice agent or a coordinated roster. Train each for its role, connect the right channels, and improve from logged outcomes.",
} as const;

export const MARKETING_VOICE = {
  eyebrow: null,
  /* No terminal period. The hero renders in the cased display tier at up to
     76px, where a full stop after seven words of caps reads as a stray mark rather
     than as punctuation. Sentence-case copy keeps its periods; cased titles are
     labels and do not take them. */
  headline: "Voice agents that get the work done",
  /** Public hero CTA. One product; the customer configures the role. */
  primaryCta: "Build Your Voice Agent",
  subline:
    "Configure one for any role. It can call, answer, text, email, book, and follow through while you stay in control.",
  channelProof: [
    "Calls and answers",
    "Text messages",
    "Email follow up",
    "Number on paid plans",
    "One inbox",
    "Shared memory",
  ],
  spine: BRAND_SYSTEM.brandSpine,
  proof: BRAND_SYSTEM.proofLoop,
  extensionLead:
    "Send the page you are viewing into Studio as reference context. Your voice agent can prepare a call, draft a text, or follow up without making you leave the tab.",
  differentiator: OUTBOUND_WEDGE.differentiator,
  buyingNoun: BRAND_SYSTEM.buyingNoun,
} as const;

export const CLIENT_SURFACE_POSTURE = {
  summary:
    "Launch on the web. Create, Train, Wire, and Run are complete in the browser; the rest are optional companions. None are required for the core product.",
  browser: {
    status: "Early access",
    action: "Install guide",
  },
  chatgpt: {
    status: "Early access",
    action: "Open guide",
  },
  claude: {
    status: "Early access",
    action: "Add connector",
  },
  cursor: {
    status: "Early access",
    action: "Add in Cursor",
  },
  android: {
    status: "Internal beta",
    action: "Internal testing",
  },
  ios: {
    status: "Planned",
    action: "Join waitlist",
  },
} as const;

export const BUSINESS_MARKETING_VOICE = {
  eyebrow: "Voice agents",
  proof: ["Calls customers", "Texts follow ups", "Sends email", "Logs outcomes"],
  differentiator: "Wireline keeps valuable conversations moving across voice, SMS, and email.",
  beforeStrip: OUTBOUND_WEDGE.beforeStrip,
} as const;

export const WORKSPACE_VOICE = {
  createHeadline: "Build your next voice agent.",
  runHeadline: "Your voice agent is live.",
  emptyCue: "Brief it. Train it once. Connect calls, texts, and email.",
  configurePrompts: ["Adjust the greeting", "Change the tone", "Add a business rule"],
  testPrompts: [
    "What services do you offer?",
    "I want to book an appointment.",
    "How much does it cost?",
    "I need to speak with a person.",
  ],
} as const;

export const PRODUCT_VERSATILITY = {
  eyebrow: "Voice agents for any role",
  tagline: "Start with one voice agent. Build a team when you need one.",
  short:
    "Voice agents for calling, texting, email, sales, marketing, appointment setting, lead revival, support, scheduling, follow up, inbound conversion, recovery, and personal admin.",
  hero: "One platform for the voice agents and conversations that keep work moving.",
} as const;

const VOICE_AGENT_POSTURE = {
  badge: "Voice Agent",
  badgeShort: "Agent",
  createCta: "Build Voice Agent",
  emptyTitle: "Your Voice Agent",
  emptyBody: "Calls, texts, and email handled. Outcomes logged.",
} as const;

export const PRODUCT_POSTURE = {
  personal: VOICE_AGENT_POSTURE,
  business: VOICE_AGENT_POSTURE,
} as const;

export function formatAgentRoleLabel(role?: string | null): string {
  if (role === "ceo") return "Lead Agent";
  return (role || "agent").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** Canonical trust posture for sales and regulated verticals. Policy driven, not stealth. */
export const TRUST_DISCLOSURE_FAQ =
  "Wireline agents follow your disclosure policy, consent rules, and conversation purpose. When disclosure is required or enabled, Wireline logs it automatically. The goal is quick, clear qualification and real opportunities that move forward." as const;

export function rosterSummary(personalCount: number, businessCount: number): string {
  const total = personalCount + businessCount;
  if (!total) return "No agents yet";
  return `${total} voice agent${total === 1 ? "" : "s"}`;
}
