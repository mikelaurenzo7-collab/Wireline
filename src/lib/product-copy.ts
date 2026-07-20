/** Shared product voice for public marketing, workspace copy, and audience positioning. */

export const BRAND_SYSTEM = {
  northStar: "The best employee you've ever had, for next to nothing.",
  productNoun: "AI employee",
  defaultRole: "Your best employee",
  brandSpine: ["Wire", "Work", "Win"],
  proofLoop: ["Brief", "Train", "Launch", "Improve"],
  toneRules: [
    "Lead with business outcomes before AI mechanics.",
    "Make the default feel like the owner's best employee, not another executive title.",
    "Keep the owner in control: guardrails, approvals, spend, handoffs, and escalation stay explicit.",
    "Present calling, texting, and email as channels of one trained employee, not three required employees.",
    "State that the included Wireline number applies to paid plans so the free builder is never misrepresented.",
    "Treat specialists as expansion, not setup homework.",
    "Show logged proof after every call, text, email, handoff, campaign, and follow-up.",
    "Never name the customer-facing role after the platform; Wireline is the platform and the customer owns the employee.",
  ],
} as const;

export type CustomerAgentPosture = "personal" | "business";

/**
 * Customer terminology is contextual even though the technical domain remains
 * `agent` in routes, schemas, events, and APIs.
 */
export const CUSTOMER_AGENT_LANGUAGE = {
  personal: {
    singular: "personal agent",
    indefiniteSingular: "a personal agent",
    plural: "personal agents",
    navLabel: "Agent",
    navShort: "Agent",
    createCta: "Create personal agent",
    setupLabel: "Personal agent in about a minute",
    setupPrompt: "What should your personal agent handle?",
    setupDescription: "Start with one call, appointment, or personal task.",
    nameLabel: "Agent name",
  },
  business: {
    singular: "AI employee",
    indefiniteSingular: "an AI employee",
    plural: "AI employees",
    navLabel: "AI Employee",
    navShort: "Employee",
    createCta: "Create AI employee",
    setupLabel: "AI employee in about a minute",
    setupPrompt: "What job should this AI employee own?",
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
    eyebrow: "Best employee · outbound growth",
    loop: ["Research", "Call", "Book", "Log"],
    promise:
      "Researches the lead, calls with context, texts or emails the follow-up, books the meeting, and logs proof that the work moved forward.",
  },
  inbound: {
    label: "Service",
    eyebrow: "Best employee · demand capture",
    loop: ["Answer", "Qualify", "Act", "Log"],
    promise:
      "Answers live demand before it leaks, continues by text or email when useful, and routes only what truly needs a person.",
  },
  hybrid: {
    label: "All-purpose",
    eyebrow: "Best employee · right-hand employee",
    loop: ["Answer", "Sell", "Follow up", "Sync"],
    promise:
      "Keeps calls, texts, email, sales, service, scheduling, and follow-through in one visible operating loop under the owner's direction.",
  },
} as const;

export const AGENT_NUMBER_PROMISE =
  "Every paid AI employee includes a Wireline number at no extra line fee, so it can call out, receive callbacks, text follow-ups, and own the handoff under your direction." as const;

export const OUTBOUND_WEDGE = {
  eyebrow: AGENT_DIRECTION_MODES.outbound.eyebrow,
  headline: "Your best employee for growth work.",
  subline:
    "Start with one all-in-one AI employee: it calls, texts, emails, researches, sells, books, revives stale leads, follows up, and logs proof before you add headcount.",
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
    "Wireline turns customer conversations across calls, texts, and email into booked appointments, revived leads, handled callbacks, recovered opportunities, and logged proof.",
  beforeStrip:
    "Build one best employee, train it once, connect calling, texting, and email, then improve from the logged outcomes. Specialists come later when volume proves the need.",
} as const;

export const MARKETING_VOICE = {
  eyebrow: null,
  headline: "Your next AI employee",
  subline:
    "One trained employee handles customer conversations across voice, SMS, and email—then follows up, books the next step, and logs every outcome.",
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
    "Send the page you are viewing into Studio as reference context—so your AI employee can prepare a call, draft a text, or follow up without you leaving the tab.",
  differentiator: OUTBOUND_WEDGE.differentiator,
} as const;

export const CLIENT_SURFACE_POSTURE = {
  summary:
    "Web is the canonical runtime. Browser Command, ChatGPT, Claude, and Cursor are early-access companions on the same account-bound MCP/handoff model. Android remains in internal beta; iPhone follows device QA and signing.",
  browser: {
    status: "Early access",
    action: "Install guide",
  },
  chatgpt: {
    status: "Early access",
    action: "Open MCP",
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
  eyebrow: "Best employee · business conversations",
  proof: ["Calls customers", "Texts follow-ups", "Sends email", "Logs outcomes"],
  differentiator:
    "Wireline keeps profit-focused conversations moving across voice, SMS, and email.",
  beforeStrip: OUTBOUND_WEDGE.beforeStrip,
} as const;

export const WORKSPACE_VOICE = {
  createHeadline: "Build your best employee.",
  runHeadline: "Your right-hand employee is live.",
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
  eyebrow: "All-purpose AI employee",
  tagline: "One best employee across every conversation channel.",
  short:
    "One trained AI employee for calling, texting, email, sales, marketing, appointment setting, lead revival, support, scheduling, follow-up, inbound conversion, recovery, and personal admin.",
  hero: "One employee for the conversations and work that keep moving.",
} as const;

export const PRODUCT_POSTURE = {
  personal: {
    badge: "Personal best employee",
    badgeShort: "Personal",
    createCta: "Build personal employee",
    emptyTitle: "Your best employee.",
    emptyBody: "Your calls. Your texts. Your email. Your outcomes.",
  },
  business: {
    badge: "Best employee",
    badgeShort: "Business",
    createCta: "Build best employee",
    emptyTitle: "Your best employee.",
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
    parts.push(`${personalCount} personal agent${personalCount === 1 ? "" : "s"}`);
  }
  if (businessCount > 0) {
    parts.push(`${businessCount} business agent${businessCount === 1 ? "" : "s"}`);
  }
  return parts.length ? parts.join(" / ") : "No agents yet";
}
