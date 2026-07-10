/** Shared product voice for public marketing, workspace copy, and audience positioning. */

export const AGENT_DIRECTION_MODES = {
  outbound: {
    label: "Outbound",
    eyebrow: "AI profit agents · outbound growth",
    loop: ["List", "Pitch", "Call", "Profit"],
    promise: "Calls warm lists, books the next step, and logs proof of profit movement.",
  },
  inbound: {
    label: "Inbound",
    eyebrow: "AI profit agents · demand capture",
    loop: ["Answer", "Qualify", "Book", "Log"],
    promise: "Answers live demand before it leaks and routes the profitable next step.",
  },
  hybrid: {
    label: "Hybrid",
    eyebrow: "AI profit agents · follow-through desk",
    loop: ["Answer", "Act", "Follow up", "Sync"],
    promise: "Handles both sides of the workflow when profit needs follow-through.",
  },
} as const;

export const PROFIT_AGENT_NUMBER_PROMISE =
  "Every included Wireline agent comes with an included number, so each profit role has a real line to call from and receive callbacks." as const;

export const OUTBOUND_WEDGE = {
  eyebrow: AGENT_DIRECTION_MODES.outbound.eyebrow,
  headline: "AI profit agents that actually call.",
  subline:
    "Wireline gives every business profit agents with included numbers — built to book appointments, revive leads, promote offers, recover opportunities, follow up, and log every outcome without commission.",
  lanes: [
    "Appointment setting",
    "Lead revival",
    "Offer promotion",
    "Quote follow-up",
    "Payment recovery",
    "Inbound conversion",
  ],
  loop: AGENT_DIRECTION_MODES.outbound.loop,
  proof: ["Calls", "Books", "Revives", "Promotes", "Recovers", "Reports"],
  differentiator:
    "Wireline turns phone work into booked appointments, revived leads, recovered dollars, and proof.",
  beforeStrip:
    "Your best salesperson, without the commission. Every agent gets an included number and every result is logged.",
} as const;

export const MARKETING_VOICE = {
  eyebrow: "AI profit agents for appointments, lead revival, promotions, and follow-up",
  headline: "AI profit agents that actually call.",
  subline:
    "Book more appointments, revive stale leads, promote offers, recover missed opportunities, and see every result — with an included number for every included agent.",
  proof: ["Build", "Train", "Launch", "Profit"],
  extensionLead:
    "Command your AI profit agent from any page. Wireline calls, answers, follows up, books the next step, and logs the outcome while you stay focused.",
  differentiator: OUTBOUND_WEDGE.differentiator,
} as const;

export const BUSINESS_MARKETING_VOICE = {
  eyebrow: "AI profit agents · business phone growth",
  proof: ["Books appointments", "Revives leads", "Logs outcomes"],
  differentiator: "Wireline keeps profit-producing phone work moving in either direction.",
  beforeStrip: OUTBOUND_WEDGE.beforeStrip,
} as const;

export const WORKSPACE_VOICE = {
  createHeadline: "Build an AI profit agent.",
  runHeadline: "Your profit calls are covered.",
  emptyCue: "Brief it. Train it. Launch it on the line.",
  commandPrompts: ["Book appointments", "Revive leads", "Review outcomes"],
  directAgent: (name?: string | null) => `Ask anything about ${name?.trim() || "your profit agent"}...`,
} as const;

export const PRODUCT_VERSATILITY = {
  eyebrow: "AI profit-agent coverage",
  tagline: "Outbound-first. Inbound-capable. Hybrid when needed.",
  short:
    "AI profit agents for appointment setting, lead revival, promotions, follow-up, inbound conversion, and recovery.",
  hero: "Calls into profit.",
} as const;

export const PRODUCT_POSTURE = {
  personal: {
    badge: "Personal profit agent",
    badgeShort: "Personal",
    createCta: "Build personal profit agent",
    emptyTitle: "Personal profit agent.",
    emptyBody: "Your calls. Your rules. Your outcomes.",
  },
  business: {
    badge: "AI profit agent",
    badgeShort: "Business",
    createCta: "Build profit agent",
    emptyTitle: "AI profit agent.",
    emptyBody: "Leads in. Calls handled. Outcomes out.",
  },
} as const;

export function formatAgentRoleLabel(role?: string | null): string {
  return (role || "agent").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** Canonical trust posture for sales and regulated verticals — policy-driven, not stealth. */
export const TRUST_DISCLOSURE_FAQ =
  "Wireline agents are configured around your disclosure policy, consent rules, and call purpose. When disclosure is required or enabled, it is logged automatically. The goal is quick, clear qualification and real opportunities that move forward." as const;

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
