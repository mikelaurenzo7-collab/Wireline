/** Shared product voice for public marketing, workspace copy, and audience positioning. */

export const BRAND_SYSTEM = {
  northStar: "AI voice agents that call, answer, follow up, and finish the work.",
  productNoun: "AI voice agent",
  /** Public buying-surface noun. Business contexts should use "business voice agent". */
  buyingNoun: "AI Voice Agent",
  defaultRole: "Your AI voice agent",
  brandSpine: ["Build", "Train", "Launch"],
  proofLoop: ["Brief", "Train", "Launch", "Improve"],
  toneRules: [
    "Lead with outcomes before AI mechanics.",
    "Welcome both personal and business use without making either audience feel secondary.",
    "Make clear that customers can start with one AI voice agent and add specialized AI voice agents as their needs grow.",
    "Keep the owner in control: guardrails, approvals, spend, handoffs, and escalation stay explicit.",
    "Present calling, texting, and email as channels each trained AI voice agent can use, not separate products customers must assemble.",
    "State that the included Wireline number applies to paid plans so the free builder is never misrepresented.",
    "Treat specialists as optional expansion, not setup homework.",
    "Show logged proof after every call, text, email, handoff, campaign, and follow-up.",
    "Never name the customer-facing role after the platform; Wireline is the platform and the customer owns the agent.",
    "On broad and default product surfaces, prefer AI Voice Agent; use personal voice agent or business voice agent when the audience context is explicit.",
    "Use sentence case for headlines, buttons, tabs, and labels.",
    "Prefer short sentences, concrete verbs, and specific outcomes.",
    "Avoid em dashes, inflated AI language, and stacked claims on public buying surfaces.",
  ],
} as const;

export type CustomerAgentPosture = "personal" | "business";

/**
 * Customer terminology is contextual even though the technical domain remains
 * `agent` in routes, schemas, events, and APIs.
 */
export const CUSTOMER_AGENT_LANGUAGE = {
  personal: {
    singular: "personal voice agent",
    indefiniteSingular: "a personal voice agent",
    plural: "personal voice agents",
    navLabel: "Voice Agent",
    navShort: "Agent",
    createCta: "Create personal voice agent",
    setupLabel: "Personal agent in 1 minute",
    setupPrompt: "What should your personal voice agent handle?",
    setupDescription: "Start with one call, appointment, or personal task.",
    nameLabel: "Agent name",
  },
  business: {
    singular: "business voice agent",
    indefiniteSingular: "a business voice agent",
    plural: "business voice agents",
    navLabel: "Voice Agent",
    navShort: "Agent",
    createCta: "Create business voice agent",
    setupLabel: "Business agent in 1 minute",
    setupPrompt: "What job should this voice agent own?",
    setupDescription: "Start with one customer-facing job.",
    nameLabel: "Agent name",
  },
} as const satisfies Record<
  CustomerAgentPosture,
  {
    singular: string;
    indefiniteSingular: string;
    plural: string;
    navLabel: string;
    navShort: string;
    createCta: string;
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
    eyebrow: "AI voice agent for outbound growth",
    loop: ["Research", "Call", "Book", "Log"],
    promise:
      "Researches the lead, calls with context, sends the follow up, books the meeting, and logs what moved forward.",
  },
  inbound: {
    label: "Service",
    eyebrow: "AI voice agent for demand capture",
    loop: ["Answer", "Qualify", "Act", "Log"],
    promise:
      "Answers live demand, continues by text or email when useful, and routes only what needs a person.",
  },
  hybrid: {
    label: "All purpose",
    eyebrow: "AI voice agent for daily operations",
    loop: ["Answer", "Sell", "Follow up", "Sync"],
    promise:
      "Keeps calls, texts, email, sales, service, scheduling, and follow through in one visible workflow under the owner's direction.",
  },
} as const;

export const AGENT_NUMBER_PROMISE =
  "Every paid AI voice agent includes a Wireline number at no extra line fee to call, answer, send texts, handle callbacks, and route handoffs." as const;

export const OUTBOUND_WEDGE = {
  eyebrow: AGENT_DIRECTION_MODES.outbound.eyebrow,
  headline: "A voice agent that moves growth work forward.",
  subline:
    "Start with one capable AI voice agent that researches leads, calls, texts, emails, sells, books, follows up, and logs proof. Add specialists only when volume or workflow complexity calls for them.",
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
    "Build one capable AI voice agent or a coordinated roster. Train each for its role, connect the right channels, and improve from logged outcomes.",
} as const;

export const MARKETING_VOICE = {
  eyebrow: null,
  headline: "AI voice agents that get the work done.",
  /** Public hero CTA broad enough for personal and business buyers. */
  primaryCta: "Build your voice agent",
  subline:
    "Build one for your business or your life. It can call, answer, text, email, book, and follow through while you stay in control.",
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
    "Launch on the web. Create, Train, Wire, and Run are complete in the browser. Browser Command, ChatGPT, Claude, and Cursor are optional early access companions. Android is in internal beta. iPhone is planned. None are required for the core product.",
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
  eyebrow: "Business voice agents",
  headline: "AI voice agents that keep customer work moving.",
  subline:
    "Answer calls, follow up by text or email, book appointments, route handoffs, and log outcomes under your direction.",
  primaryCta: "Build a business agent",
} as const;

export const PRODUCT_POSTURE = {
  personal: {
    eyebrow: "Personal voice agent",
    headline: "Your calls, follow ups, and appointments handled.",
    emptyTitle: "Create your personal voice agent",
    emptyBody: "Your calls. Your texts. Your email. Your outcomes.",
  },
  business: {
    eyebrow: "Business voice agents",
    headline: "Customer conversations handled from one workspace.",
    emptyTitle: "Create your first business voice agent",
    emptyBody: "Answer, sell, support, schedule, and follow up under your direction.",
  },
} as const;

export const WORKSPACE_VOICE = {
  headline: "Create, train, and run your voice agents.",
  subline:
    "Give each agent one clear job, test it before launch, then improve from real conversations.",
} as const;

export const PERSONAL_AGENT_PROMISE =
  "A personal voice agent can make and answer calls, send texts, draft email, book appointments, and follow up under your direction." as const;

export const BUSINESS_AGENT_PROMISE =
  "A business voice agent can answer, sell, support, schedule, follow up, and escalate under your direction." as const;

export function formatAgentRoleLabel(value?: string | null): string {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return "Voice Agent";
  if (normalized === "ceo") return "Lead Agent";
  return value!
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
