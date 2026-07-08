/** Shared product voice for public marketing, workspace copy, and audience positioning. */

export const AGENT_DIRECTION_MODES = {
  outbound: {
    label: "Outbound",
    eyebrow: "outbound call agents · private beta",
    loop: ["List", "Script", "Dial", "Log"],
    promise: "Calls the list and returns completed outcomes.",
  },
  inbound: {
    label: "Inbound",
    eyebrow: "inbound call agents · private beta",
    loop: ["Route", "Answer", "Resolve", "Log"],
    promise: "Answers live demand and routes the right next step.",
  },
  hybrid: {
    label: "Hybrid",
    eyebrow: "hybrid call agents · private beta",
    loop: ["Answer", "Act", "Follow up", "Sync"],
    promise: "Handles both sides of the conversation when the workflow needs it.",
  },
} as const;

export const OUTBOUND_WEDGE = {
  eyebrow: AGENT_DIRECTION_MODES.outbound.eyebrow,
  headline: "Outbound agents that actually call.",
  subline:
    "Wireline leads with trained outbound call agents for sales, marketing re-engagement, billing collection, negotiations, surveys, scheduling, and follow-up — while still letting users choose inbound or hybrid roles when the workflow needs them.",
  lanes: ["Sales", "Collections", "Re-engagement", "Negotiation", "Surveys", "Scheduling"],
  loop: AGENT_DIRECTION_MODES.outbound.loop,
  proof: ["Qualifies", "Negotiates", "Books", "Collects", "Recovers", "Reports"],
  differentiator: "Wireline turns call lists into completed outcomes.",
  beforeStrip: "A list is not a pipeline until somebody calls it.",
} as const;

export const MARKETING_VOICE = {
  eyebrow: OUTBOUND_WEDGE.eyebrow,
  headline: "Wire your agent.",
  subline:
    "Start outbound-first, then choose the call role: outbound campaigns, inbound coverage, or hybrid agents that answer, call back, follow up, and log every outcome.",
  proof: ["Create", "Train", "Wire", "Run"],
  extensionLead:
    "Command your agent from any page. Wireline calls, answers, follows up, and logs the outcome while you stay focused.",
  differentiator: OUTBOUND_WEDGE.differentiator,
} as const;

export const BUSINESS_MARKETING_VOICE = {
  eyebrow: "call agents · private beta",
  proof: ["Dials the list", "Answers callbacks", "Logs outcomes"],
  differentiator: "Wireline keeps call work moving in either direction.",
  beforeStrip: OUTBOUND_WEDGE.beforeStrip,
} as const;

export const WORKSPACE_VOICE = {
  createHeadline: "Wire an agent.",
  runHeadline: "Your phone is covered.",
  emptyCue: "Brief it. Train it. Put it on the line.",
  commandPrompts: ["Start outbound", "Answer inbound", "Review calls"],
  directAgent: (name?: string | null) => `Ask anything about ${name?.trim() || "your agent"}...`,
} as const;

export const PRODUCT_VERSATILITY = {
  eyebrow: "Call agent coverage",
  tagline: "Outbound-first. Inbound-capable. Hybrid when needed.",
  short: "Call agents for revenue, recovery, coverage, and follow-up.",
  hero: "Call work, handled.",
} as const;

export const PRODUCT_POSTURE = {
  personal: {
    badge: "Personal agent",
    badgeShort: "Personal",
    createCta: "Wire personal agent",
    emptyTitle: "Personal agent.",
    emptyBody: "Your calls. Your rules.",
  },
  business: {
    badge: "Call agent",
    badgeShort: "Business",
    createCta: "Wire call agent",
    emptyTitle: "Call agent.",
    emptyBody: "List in. Calls handled. Outcomes out.",
  },
} as const;

export function formatAgentRoleLabel(role?: string | null): string {
  return (role || "agent").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** Canonical trust posture for sales and regulated verticals — policy-driven, not stealth. */
export const TRUST_DISCLOSURE_FAQ =
  "Wireline agents are configured around your disclosure policy, consent rules, and call purpose. When disclosure is required or enabled, it is logged automatically. The goal is not to trick prospects — it is to reach them quickly, qualify clearly, and move real opportunities forward." as const;

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
