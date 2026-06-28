/** Shared product voice: one workspace for personal and business agents. */

export const MARKETING_VOICE = {
  eyebrow: "Wireline OS",
  headline: "Agents for every conversation.",
  subline: "Calls, texts, follow-up. Handled.",
  proof: ["Create", "Train", "Run", "Calls", "Texts", "Follow-up"],
  extensionLead:
    "Command agents from the page you're on. Create, train, and run with mono clarity.",
} as const;

export const WORKSPACE_VOICE = {
  createHeadline: "Wire an agent.",
  runHeadline: "Run the work.",
  emptyCue: "Brief it. Train it. Wire it.",
  commandPrompts: ["Review calls", "Draft reply", "Prep handoff"],
  directAgent: (name?: string | null) => `Direct ${name?.trim() || "your agent"}...`,
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
