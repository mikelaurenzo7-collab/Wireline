/** Shared product voice for public marketing, workspace copy, and audience positioning. */

export const AGENT_DIRECTION_MODES = {
  outbound: {
    label: "Outbound",
    eyebrow: "AI phone employees · sales follow-up",
    loop: ["Leads", "Qualify", "Book", "Log"],
    promise: "Qualifies leads, books the next step, and returns proof.",
  },
  inbound: {
    label: "Inbound",
    eyebrow: "AI phone employees · front desk",
    loop: ["Answer", "Route", "Schedule", "Log"],
    promise: "Answers live demand and routes the right next step.",
  },
  hybrid: {
    label: "Hybrid",
    eyebrow: "AI phone employees · revenue desk",
    loop: ["Answer", "Act", "Follow up", "Sync"],
    promise: "Handles both sides of the workflow when calls need follow-through.",
  },
} as const;

export const OUTBOUND_WEDGE = {
  eyebrow: AGENT_DIRECTION_MODES.outbound.eyebrow,
  headline: "AI phone employees for the work that grows your business.",
  subline:
    "Wireline gives businesses AI phone employees for lead response, appointment booking, sales follow-up, collections, intake, recruiting, and support overflow — trained on the playbook, connected to the number, and measured by outcomes.",
  lanes: ["Lead response", "Appointments", "Sales follow-up", "Collections", "Intake", "Support"],
  loop: AGENT_DIRECTION_MODES.outbound.loop,
  proof: ["Answers", "Qualifies", "Books", "Follows up", "Collects", "Reports"],
  differentiator: "Wireline turns phone work into sales, appointments, follow-up, and proof.",
  beforeStrip: "Sales follow-up without commission. Every lead gets a next step and every result is logged.",
} as const;

export const MARKETING_VOICE = {
  eyebrow: "AI phone employees for sales, scheduling, intake, and support",
  headline: "AI phone employees that turn calls into sales.",
  subline:
    "Answer more calls, qualify more leads, book more appointments, follow up faster, and see every result — without adding payroll.",
  proof: ["Build", "Train", "Launch", "Improve"],
  extensionLead:
    "Command your AI phone employee from any page. Wireline calls, answers, follows up, books the next step, and logs the outcome while you stay focused.",
  differentiator: OUTBOUND_WEDGE.differentiator,
} as const;

export const BUSINESS_MARKETING_VOICE = {
  eyebrow: "AI phone employees · business phone work",
  proof: ["Qualifies leads", "Books appointments", "Logs outcomes"],
  differentiator: "Wireline keeps revenue phone work moving in either direction.",
  beforeStrip: OUTBOUND_WEDGE.beforeStrip,
} as const;

export const WORKSPACE_VOICE = {
  createHeadline: "Build an AI phone employee.",
  runHeadline: "Your phone work is covered.",
  emptyCue: "Brief it. Train it. Launch it on the line.",
  commandPrompts: ["Qualify leads", "Book appointments", "Review outcomes"],
  directAgent: (name?: string | null) => `Ask anything about ${name?.trim() || "your phone employee"}...`,
} as const;

export const PRODUCT_VERSATILITY = {
  eyebrow: "AI phone employee coverage",
  tagline: "Outbound-first. Inbound-capable. Hybrid when needed.",
  short: "AI phone employees for sales, scheduling, intake, support, collections, and follow-up.",
  hero: "Calls into outcomes.",
} as const;

export const PRODUCT_POSTURE = {
  personal: {
    badge: "Personal employee",
    badgeShort: "Personal",
    createCta: "Build personal employee",
    emptyTitle: "Personal phone employee.",
    emptyBody: "Your calls. Your rules. Your outcomes.",
  },
  business: {
    badge: "AI phone employee",
    badgeShort: "Business",
    createCta: "Build phone employee",
    emptyTitle: "AI phone employee.",
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
