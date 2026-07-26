/** Shared product voice for public marketing, workspace copy, and audience positioning. */

export const BRAND_SYSTEM = {
  northStar: "AI voice agents for every conversation—personal or business.",
  productNoun: "AI voice agent",
  /** Public buying-surface noun. Business contexts may still use "AI employee". */
  buyingNoun: "AI Voice Agent",
  defaultRole: "Your AI voice agent",
  brandSpine: ["Wire", "Work", "Win"],
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
    "On broad public surfaces, prefer AI Voice Agent; use personal agent or AI employee only when the audience context is explicit.",
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
    setupLabel: "Personal voice agent in about a minute",
    setupPrompt: "What should your personal voice agent handle?",
    setupDescription: "Start with one call, appointment, or personal task.",
    nameLabel: "Agent name",
  },
  business: {
    singular: "AI voice employee",
    indefiniteSingular: "an AI voice employee",
    plural: "AI voice employees",
    navLabel: "AI Voice Employee",
    navShort: "Employee",
    createCta: "Create AI voice employee",
    setupLabel: "AI voice employee in about a minute",
    setupPrompt: "What job should this AI voice employee own?",
    setupDescription: "Start with one customer-facing job.",
    nameLabel: "Employee name",
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
    eyebrow: "AI voice agent · outbound growth",
    loop: ["Research", "Call", "Book", "Log"],
    promise:
      "Researches the lead, calls with context, texts or emails the follow-up, books the meeting, and logs proof that the work moved forward.",
  },
  inbound: {
    label: "Service",
    eyebrow: "AI voice agent · demand capture",
    loop: ["Answer", "Qualify", "Act", "Log"],
    promise:
      "Answers live demand before it leaks, continues by text or email when useful, and routes only what truly needs a person.",
  },
  hybrid: {
    label: "All-purpose",
    eyebrow: "AI voice agent · right-hand support",
    loop: ["Answer", "Sell", "Follow up", "Sync"],
    promise:
      "Keeps calls, texts, email, sales, service, scheduling, and follow-through in one visible operating loop under the owner's direction.",
  },
} as const;

export const AGENT_NUMBER_PROMISE =
  "Every paid AI voice agent includes a Wireline number at no extra line fee—so it can call, take callbacks, text follow-ups, and own the handoff under your direction." as const;

export const OUTBOUND_WEDGE = {
  eyebrow: AGENT_DIRECTION_MODES.outbound.eyebrow,
  headline: "Your AI voice agent for growth work.",
  subline:
    "Start with an all-in-one AI voice agent that calls, texts, emails, researches, sells, books, revives stale leads, follows up, and logs proof—then add specialized AI voice agents when volume or workflows demand them.",
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
    "Wireline turns conversations across calls, texts, and email into completed tasks, booked appointments, revived leads, handled callbacks, recovered opportunities, and logged proof.",
  beforeStrip:
    "Build one capable AI voice agent or a coordinated roster, train each for its role, connect calling, texting, and email, then improve from logged outcomes.",
} as const;

export const MARKETING_VOICE = {
  eyebrow: null,
  headline: "AI VOICE AGENTS",
  /** Public hero CTA — broad enough for personal and business buyers. */
  primaryCta: "Build your AI Voice Agent",
  subline:
    "Build one AI voice agent—or a coordinated team—for personal tasks and business conversations, with follow-through across voice, SMS, and email.",
  channelProof: [
    "Voice calling",
    "Text / SMS",
    "Email messaging",
    "Paid-plan number",
    "Connected inbox",
    "Shared memory",
  ],
  spine: BRAND_SYSTEM.brandSpine,
  proof: BRAND_SYSTEM.proofLoop,
  extensionLead:
    "Send the page you are viewing into Studio as reference context—so an AI voice agent can prepare a call, draft a text, or follow up without you leaving the tab.",
  differentiator: OUTBOUND_WEDGE.differentiator,
  buyingNoun: BRAND_SYSTEM.buyingNoun,
} as const;

export const CLIENT_SURFACE_POSTURE = {
  summary:
    "Launch on the web — Create, Train, Wire, and Run are complete in the browser. Browser Command, ChatGPT, Claude, and Cursor are optional early-access companions; Android is internal beta; iPhone is planned. None are required for the core product.",
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
  eyebrow: "AI voice employees · business conversations",
  proof: ["Calls customers", "Texts follow-ups", "Sends email", "Logs outcomes"],
  differentiator:
    "Wireline keeps profit-focused conversations moving across voice, SMS, and email.",
  beforeStrip: OUTBOUND_WEDGE.beforeStrip,
} as const;

export const WORKSPACE_VOICE = {
  createHeadline: "Build your next AI voice agent.",
  runHeadline: "Your AI voice agent is live.",
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
  eyebrow: "AI voice agents for life and work",
  tagline: "Start with one AI voice agent. Build a team when you need one.",
  short:
    "AI voice agents for calling, texting, email, sales, marketing, appointment setting, lead revival, support, scheduling, follow-up, inbound conversion, recovery, and personal admin.",
  hero: "One platform for the AI voice agents and conversations that keep life and work moving.",
} as const;

export const PRODUCT_POSTURE = {
  personal: {
    badge: "Personal voice agent",
    badgeShort: "Personal",
    createCta: "Build personal voice agent",
    emptyTitle: "Your personal voice agent.",
    emptyBody: "Your calls. Your texts. Your email. Your outcomes.",
  },
  business: {
    badge: "AI voice employee",
    badgeShort: "Business",
    createCta: "Build AI voice employee",
    emptyTitle: "Your AI voice employee.",
    emptyBody: "Calls, texts, and email handled. Outcomes logged.",
  },
} as const;

export function formatAgentRoleLabel(role?: string | null): string {
  if (role === "ceo") return "Best Employee";
  return (role || "agent").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** Canonical trust posture for sales and regulated verticals — policy-driven, not stealth. */
export const TRUST_DISCLOSURE_FAQ =
  "Wireline agents are configured around your disclosure policy, consent rules, and conversation purpose. When disclosure is required or enabled, it is logged automatically. The goal is quick, clear qualification and real opportunities that move forward." as const;

export function rosterSummary(personalCount: number, businessCount: number): string {
  const parts: string[] = [];
  if (personalCount > 0) {
    parts.push(`${personalCount} personal voice agent${personalCount === 1 ? "" : "s"}`);
  }
  if (businessCount > 0) {
    parts.push(`${businessCount} business voice agent${businessCount === 1 ? "" : "s"}`);
  }
  return parts.length ? parts.join(" / ") : "No agents yet";
}
