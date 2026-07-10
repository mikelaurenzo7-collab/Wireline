/** Shared product voice for public marketing, workspace copy, and audience positioning. */

export const AGENT_DIRECTION_MODES = {
  outbound: {
    label: "Outbound",
    eyebrow: "AI sales agents · outbound growth",
    loop: ["List", "Pitch", "Call", "Profit"],
    promise: "Calls warm lists, books the next step, and logs proof that the work moved forward.",
  },
  inbound: {
    label: "Inbound",
    eyebrow: "AI employees · demand capture",
    loop: ["Answer", "Qualify", "Book", "Log"],
    promise: "Answers live demand before it leaks and routes the valuable next step.",
  },
  hybrid: {
    label: "Hybrid",
    eyebrow: "AI employees · follow-through desk",
    loop: ["Answer", "Act", "Follow up", "Sync"],
    promise: "Handles both sides of the workflow when profit needs follow-through.",
  },
} as const;

export const AGENT_NUMBER_PROMISE =
  "Every included Wireline agent comes with an included number at no extra line fee, so each AI employee has a real line to call from and receive callbacks." as const;

export const OUTBOUND_WEDGE = {
  eyebrow: AGENT_DIRECTION_MODES.outbound.eyebrow,
  headline: "AI sales agents that actually call.",
  subline:
    "Wireline gives every business sales agents with included numbers — built to book appointments, revive leads, promote offers, recover opportunities, follow up, and log every outcome without commission.",
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
    "Wireline turns repetitive phone work into booked appointments, revived leads, recovered opportunities, and proof.",
  beforeStrip:
    "Your best salesperson, without the commission. Every included agent gets an included number at no extra line fee and every result is logged.",
} as const;

export const MARKETING_VOICE = {
  eyebrow: "AI employees for appointments, lead revival, promotions, and follow-up",
  headline: "Wire your AI employee.",
  subline:
    "It calls, answers, books appointments, revives stale leads, follows up, and reports the profit behind every conversation — with an included number for every included agent.",
  proof: ["Build", "Train", "Launch", "Profit"],
  extensionLead:
    "Command your AI employee from any page. Wireline calls, answers, follows up, books the next step, and logs the outcome while you stay focused.",
  differentiator: OUTBOUND_WEDGE.differentiator,
} as const;

export const BUSINESS_MARKETING_VOICE = {
  eyebrow: "AI employees · business phone growth",
  proof: ["Books appointments", "Revives leads", "Logs outcomes"],
  differentiator: "Wireline keeps profit-focused phone work moving in either direction.",
  beforeStrip: OUTBOUND_WEDGE.beforeStrip,
} as const;

export const WORKSPACE_VOICE = {
  createHeadline: "Build an AI employee.",
  runHeadline: "Your profit calls are covered.",
  emptyCue: "Brief it. Train it. Launch it on the line.",
  commandPrompts: ["Book appointments", "Revive leads", "Review outcomes"],
  directAgent: (name?: string | null) =>
    `Ask anything about ${name?.trim() || "your AI employee"}...`,
} as const;

export const PRODUCT_VERSATILITY = {
  eyebrow: "AI employee coverage",
  tagline: "Outbound-first. Inbound-capable. Hybrid when needed.",
  short:
    "AI employees for appointment setting, lead revival, promotions, follow-up, inbound conversion, and recovery.",
  hero: "Calls that move profit.",
} as const;

export const PRODUCT_POSTURE = {
  personal: {
    badge: "Personal AI employee",
    badgeShort: "Personal",
    createCta: "Build personal AI employee",
    emptyTitle: "Personal AI employee.",
    emptyBody: "Your calls. Your rules. Your outcomes.",
  },
  business: {
    badge: "AI employee",
    badgeShort: "Business",
    createCta: "Build AI employee",
    emptyTitle: "AI employee.",
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
