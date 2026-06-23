/** Shared product voice — one workspace for personal and business conversations. */

export const PRODUCT_VERSATILITY = {
  eyebrow: "Conversation coverage",
  tagline: "One workspace for voice, email, and text.",
  short: "Personal and business conversations, in one place.",
  hero: "Handle the conversations that move your day and business forward.",
} as const;

export const PRODUCT_POSTURE = {
  personal: {
    badge: "Personal assistant",
    badgeShort: "Personal",
    createCta: "Create personal assistant",
    emptyTitle: "Start with a personal assistant",
    emptyBody:
      "Handle pharmacy calls, scheduling, and follow-ups you do not want to chase. Add a business agent when work needs a professional line.",
  },
  business: {
    badge: "Business agent",
    badgeShort: "Business",
    createCta: "Create business agent",
    emptyTitle: "Add a business agent when you are ready",
    emptyBody:
      "Represent your company on inbound calls, qualify leads, and book meetings with policies, hours, and escalation you control.",
  },
} as const;

export function rosterSummary(personalCount: number, businessCount: number): string {
  const parts: string[] = [];
  if (personalCount > 0) {
    parts.push(`${personalCount} personal assistant${personalCount === 1 ? "" : "s"}`);
  }
  if (businessCount > 0) {
    parts.push(`${businessCount} business agent${businessCount === 1 ? "" : "s"}`);
  }
  return parts.length ? parts.join(" · ") : "No assistants or agents yet";
}
