/** Shared product voice for public marketing, workspace copy, and audience positioning. */

export const AGENT_DIRECTION_MODES = {
  outbound: {
    label: "Outbound",
    eyebrow: "Wireline CEO · outbound growth",
    loop: ["Research", "Call", "Book", "Log"],
    promise: "Researches the lead, calls with context, books the next step, and logs proof that the work moved forward.",
  },
  inbound: {
    label: "Inbound",
    eyebrow: "Wireline CEO · demand capture",
    loop: ["Answer", "Qualify", "Act", "Log"],
    promise: "Answers live demand before it leaks, handles the first pass, and routes only what truly needs a person.",
  },
  hybrid: {
    label: "Hybrid",
    eyebrow: "Wireline CEO · operating desk",
    loop: ["Answer", "Research", "Follow up", "Sync"],
    promise: "Handles both sides of the workflow when sales, service, scheduling, and follow-through belong together.",
  },
} as const;

export const AGENT_NUMBER_PROMISE =
  "Every included Wireline operating agent comes with an included number at no extra line fee, so your CEO can call out, receive callbacks, and own the handoff." as const;

export const OUTBOUND_WEDGE = {
  eyebrow: AGENT_DIRECTION_MODES.outbound.eyebrow,
  headline: "An AI operating agent that actually calls.",
  subline:
    "Wireline CEO gives every business one capable operator with an included number — built to answer, research, book, revive leads, follow up, and log every outcome without commission.",
  lanes: [
    "Appointment setting",
    "Lead revival",
    "Offer promotion",
    "Quote follow-up",
    "Payment recovery",
    "Inbound conversion",
  ],
  loop: AGENT_DIRECTION_MODES.outbound.loop,
  proof: ["Researches", "Calls", "Answers", "Books", "Follows up", "Reports"],
  differentiator:
    "Wireline turns repetitive phone work into booked appointments, revived leads, handled callbacks, recovered opportunities, and proof.",
  beforeStrip:
    "Start with one Wireline CEO. It researches, answers, calls, books, follows up, and logs proof — every included agent gets an included number at no extra line fee.",
} as const;

export const MARKETING_VOICE = {
  eyebrow: "Wireline CEO for calls, sales, scheduling, support, and follow-up",
  headline: "One agent to run the front office.",
  subline:
    "Wireline CEO answers, researches, calls, books appointments, revives stale leads, follows up, and reports the outcome behind every conversation — with an included number for every included agent.",
  proof: ["Brief", "Train", "Launch", "Operate"],
  extensionLead:
    "Command your Wireline CEO from any page. It researches, calls, answers, follows up, books the next step, and logs the outcome while you stay focused.",
  differentiator: OUTBOUND_WEDGE.differentiator,
} as const;

export const BUSINESS_MARKETING_VOICE = {
  eyebrow: "Wireline CEO · business phone operations",
  proof: ["Answers demand", "Books appointments", "Logs outcomes"],
  differentiator: "Wireline keeps profit-focused phone work moving in either direction.",
  beforeStrip: OUTBOUND_WEDGE.beforeStrip,
} as const;

export const WORKSPACE_VOICE = {
  createHeadline: "Build your Wireline CEO.",
  runHeadline: "Your front office is covered.",
  emptyCue: "Brief it. Train it. Launch it on the line.",
  commandPrompts: ["Answer calls", "Book appointments", "Revive leads", "Review outcomes"],
  directAgent: (name?: string | null) =>
    `Ask anything about ${name?.trim() || "your Wireline CEO"}...`,
} as const;

export const PRODUCT_VERSATILITY = {
  eyebrow: "AI operating coverage",
  tagline: "CEO first. Specialists when needed.",
  short:
    "One operating agent for appointment setting, lead revival, support, scheduling, follow-up, inbound conversion, recovery, and personal admin.",
  hero: "One operator for the work that keeps moving.",
} as const;

export const PRODUCT_POSTURE = {
  personal: {
    badge: "Personal Wireline CEO",
    badgeShort: "Personal",
    createCta: "Build personal Wireline CEO",
    emptyTitle: "Personal Wireline CEO.",
    emptyBody: "Your calls. Your rules. Your outcomes.",
  },
  business: {
    badge: "Wireline CEO",
    badgeShort: "Business",
    createCta: "Build Wireline CEO",
    emptyTitle: "Wireline CEO.",
    emptyBody: "Leads in. Calls handled. Outcomes out.",
  },
} as const;

export function formatAgentRoleLabel(role?: string | null): string {
  if (role === "ceo") return "Wireline CEO";
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
