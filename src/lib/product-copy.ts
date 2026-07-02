/** Shared product voice for public marketing, workspace copy, and audience positioning. */

export const MARKETING_VOICE = {
  eyebrow: "voice agents · in beta",
  headline: "Wire your agent.",
  subline:
    "From personal assistants to solo business agents, call centers, and sales teams, build a trained voice agent that answers, routes, books, follows up, and texts the outcome.",
  proof: ["Personal assistants", "Solo business agents", "Teams & call centers"],
  extensionLead: "Command your agent from any page. Wireline answers while you stay focused.",
  differentiator: "Wireline puts a trained agent on the line.",
} as const;

export const BUSINESS_MARKETING_VOICE = {
  eyebrow: "business agents · in beta",
  proof: ["Answers every line", "Qualifies and routes", "Logs every handoff"],
  differentiator: "Wireline keeps the line moving.",
  beforeStrip: "Hold music turns leads away.",
} as const;

export const WORKSPACE_VOICE = {
  createHeadline: "Wire an agent.",
  runHeadline: "Your phone is covered.",
  emptyCue: "Brief it. Train it. Put it on the line.",
  commandPrompts: ["Change voice", "Edit workflows", "Review calls"],
  directAgent: (name?: string | null) => `Ask anything about ${name?.trim() || "your agent"}...`,
} as const;

export const PRODUCT_VERSATILITY = {
  eyebrow: "Agent coverage",
  tagline: "One voice. All channels.",
  short: "Personal and business agents, in one place.",
  hero: "Conversations, handled.",
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
    badge: "Business agent",
    badgeShort: "Business",
    createCta: "Wire business agent",
    emptyTitle: "Business agent.",
    emptyBody: "Brand on the line.",
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
    parts.push(`${businessCount} business agent${businessCount === 1 ? "" : "s"}`);
  }
  return parts.length ? parts.join(" / ") : "No agents yet";
}
