/** Shared product voice for public marketing, workspace copy, and audience positioning. */

export const OUTBOUND_WEDGE = {
  eyebrow: "outbound call agents · private beta",
  headline: "Outbound agents that actually call.",
  subline:
    "Wireline builds trained outbound call agents for sales, marketing re-engagement, billing collection, negotiations, surveys, scheduling, and follow-up — then logs the outcome like an operator.",
  lanes: ["Sales", "Collections", "Re-engagement", "Negotiation", "Surveys", "Scheduling"],
  loop: ["List", "Script", "Dial", "Log"],
  proof: ["Qualifies", "Negotiates", "Books", "Collects", "Recovers", "Reports"],
  differentiator: "Wireline turns call lists into completed outcomes.",
  beforeStrip: "A list is not a pipeline until somebody calls it.",
} as const;

export const MARKETING_VOICE = {
  eyebrow: OUTBOUND_WEDGE.eyebrow,
  headline: "Wire your agent.",
  subline:
    "Start with outbound: sales calls, billing collection, re-engagement, surveys, negotiation, scheduling, and follow-up. Create, train, wire, run, and review every call outcome.",
  proof: ["Create", "Train", "Wire", "Run"],
  extensionLead: "Command your agent from any page. Wireline calls, follows up, and logs the outcome while you stay focused.",
  differentiator: OUTBOUND_WEDGE.differentiator,
} as const;

export const BUSINESS_MARKETING_VOICE = {
  eyebrow: "outbound teams · private beta",
  proof: ["Dials the list", "Handles objections", "Logs outcomes"],
  differentiator: "Wireline keeps outbound work moving.",
  beforeStrip: OUTBOUND_WEDGE.beforeStrip,
} as const;

export const WORKSPACE_VOICE = {
  createHeadline: "Wire an agent.",
  runHeadline: "Your phone is covered.",
  emptyCue: "Brief it. Train it. Put it on the line.",
  commandPrompts: ["Start outbound", "Change script", "Review calls"],
  directAgent: (name?: string | null) => `Ask anything about ${name?.trim() || "your agent"}...`,
} as const;

export const PRODUCT_VERSATILITY = {
  eyebrow: "Outbound agent coverage",
  tagline: "Call lists. Completed outcomes.",
  short: "Outbound agents for revenue, recovery, and follow-up.",
  hero: "Outbound, handled.",
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
    badge: "Outbound agent",
    badgeShort: "Outbound",
    createCta: "Wire outbound agent",
    emptyTitle: "Outbound agent.",
    emptyBody: "List in. Outcome out.",
  },
} as const;

export function formatAgentRoleLabel(role?: string | null): string {
  return (role || "agent").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function rosterSummary(personalCount: number, businessCount: number): string {
  const parts: string[] = [];
  if (personalCount > 0) {
    parts.push(`${personalCount} personal agent${personalCount === 1 ? "" : "s"}`);
  }
  if (businessCount > 0) {
    parts.push(`${businessCount} outbound agent${businessCount === 1 ? "" : "s"}`);
  }
  return parts.length ? parts.join(" / ") : "No agents yet";
}
