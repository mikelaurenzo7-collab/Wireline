/** Shared product voice — one workspace for personal and business agents. */

export const PRODUCT_VERSATILITY = {
  eyebrow: "Agent coverage",
  tagline: "One workspace for calls, texts, and follow-up.",
  short: "Personal and business agents, in one place.",
  hero: "Handle the conversations that move your day and business forward.",
} as const;

export const PRODUCT_POSTURE = {
  personal: {
    badge: "Personal agent",
    badgeShort: "Personal",
    createCta: "Create personal agent",
    emptyTitle: "Start with a personal agent",
    emptyBody:
      "Handle pharmacy calls, scheduling, reminders, and follow-up without chasing every thread yourself.",
  },
  business: {
    badge: "Business agent",
    badgeShort: "Business",
    createCta: "Create business agent",
    emptyTitle: "Add a business agent when work needs a line",
    emptyBody:
      "Represent your company on inbound calls, qualify leads, and book meetings with policies, hours, and escalation you control.",
  },
} as const;

export function formatAgentRoleLabel(role?: string | null): string {
  return (role || "agent")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function rosterSummary(personalCount: number, businessCount: number): string {
  const parts: string[] = [];
  if (personalCount > 0) {
    parts.push(`${personalCount} personal agent${personalCount === 1 ? "" : "s"}`);
  }
  if (businessCount > 0) {
    parts.push(`${businessCount} business agent${businessCount === 1 ? "" : "s"}`);
  }
  return parts.length ? parts.join(" · ") : "No agents yet";
}
