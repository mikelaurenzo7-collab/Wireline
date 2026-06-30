/** Shared product voice — one agent system across every Wireline surface. */

export const MARKETING_VOICE = {
  eyebrow: "V1 · Beta",
  headline: "Your phone, finally answering for you.",
  subline:
    "Wireline answers calls, handles the back-and-forth, and texts you the outcome — bookings, messages, errands, and follow-ups included.",
  proof: ["Answers with a real voice", "Acts on your behalf", "Texts you the outcome"],
  extensionLead: "Command an agent from any page. Wireline handles the call while you stay focused.",
  differentiator: "Wireline answers them.",
} as const;

export const BUSINESS_MARKETING_VOICE = {
  eyebrow: "Business · V1 Beta",
  proof: ["Books in your calendar", "Routes urgent calls", "Logs every conversation"],
  differentiator: "Wireline keeps the line open.",
  beforeStrip: "Hold music turns leads away.",
} as const;

export const WORKSPACE_VOICE = {
  createHeadline: "Create the agent.",
  trainHeadline: "Train the line.",
  runHeadline: "Run the work.",
  emptyCue: "Create. Train. Run the line.",
  commandPrompts: ["Change voice", "Train flows", "Review calls"],
  directAgent: (name?: string | null) => `Ask anything about ${name?.trim() || "your agent"}...`,
} as const;

export const PRODUCT_VERSATILITY = {
  eyebrow: "Agent coverage",
  tagline: "One voice. Every surface.",
  short: "Personal and business agents, in one place.",
  hero: "Conversations, handled.",
} as const;

export const PRODUCT_POSTURE = {
  personal: {
    badge: "Personal agent",
    badgeShort: "Personal",
    createCta: "Create personal agent",
    emptyTitle: "Personal agent",
    emptyBody: "Your calls. Your rules.",
  },
  business: {
    badge: "Business agent",
    badgeShort: "Business",
    createCta: "Create business agent",
    emptyTitle: "Business agent",
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
