/** Shared product voice — personal phone agent, configure it however you need. */

export const MARKETING_VOICE = {
  eyebrow: "v1 · now in beta",
  headline: "Your phone, finally answering for you.",
  subline:
    "A voice AI that picks up your phone, talks to the caller, and handles it — booking, message-taking, follow-ups, errands. You get a text with what happened.",
  proof: ["Answers with a real voice", "Acts on your behalf", "Texts you what happened"],
  extensionLead: "Command your agent from any page. Wireline answers while you stay focused.",
  differentiator: "Wireline answers them.",
} as const;

export const WORKSPACE_VOICE = {
  createHeadline: "Wire an agent.",
  runHeadline: "Your phone is covered.",
  emptyCue: "Brief it. Train it. Wire it.",
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
