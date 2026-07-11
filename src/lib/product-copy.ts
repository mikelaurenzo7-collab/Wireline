/** Shared product voice for public marketing, workspace copy, and audience positioning. */

export const EMPLOYEE_CHANNELS = ["Voice", "Email", "Text / SMS"] as const;

export const ONE_EMPLOYEE_CHANNEL_PROMISE =
  "One AI employee can work across voice, email, and text/SMS with the same business knowledge, rules, approvals, memory, and outcome history once each channel is connected." as const;

export const BRAND_SYSTEM = {
  northStar: "The best employee you've ever had, for next to nothing.",
  productNoun: "AI employee",
  defaultRole: "Your best employee",
  brandSpine: ["Wire", "Work", "Win"],
  proofLoop: ["Brief", "Train", "Launch", "Improve"],
  toneRules: [
    "Lead with business outcomes before AI mechanics.",
    "Make the default feel like the owner's best employee, not another executive title.",
    "Present voice, email, and text/SMS as capabilities of one employee, not three required employees.",
    "Keep the owner in control: guardrails, approvals, spend, handoffs, and escalation stay explicit.",
    "Treat specialists as expansion, not setup homework.",
    "Show logged proof after every call, email, text, handoff, campaign, and follow-up.",
    "Never name the customer-facing role after the platform; Wireline is the platform and the customer owns the employee.",
  ],
} as const;

export const AGENT_DIRECTION_MODES = {
  outbound: {
    label: "Sales",
    eyebrow: "Best employee · outbound growth",
    loop: ["Research", "Reach", "Book", "Log"],
    promise:
      "Researches the lead, reaches out by call, email, or text, sells the next step, books the meeting, and logs proof that the work moved forward.",
  },
  inbound: {
    label: "Service",
    eyebrow: "Best employee · demand capture",
    loop: ["Answer", "Qualify", "Act", "Log"],
    promise:
      "Answers calls, emails, and texts before demand leaks, handles the first pass, and routes only what truly needs a person.",
  },
  hybrid: {
    label: "All-purpose",
    eyebrow: "Best employee · right-hand employee",
    loop: ["Answer", "Sell", "Follow up", "Sync"],
    promise:
      "Keeps sales, marketing, service, scheduling, and follow-through in one visible operating loop across voice, email, and text/SMS under the owner's direction.",
  },
} as const;

export const AGENT_NUMBER_PROMISE =
  "Every included AI employee comes with an included Wireline number at no extra line fee, so it can call out, receive callbacks, and own the handoff. Connect email and text/SMS to let the same employee continue the conversation without losing context." as const;

export const OUTBOUND_WEDGE = {
  eyebrow: AGENT_DIRECTION_MODES.outbound.eyebrow,
  headline: "Your best employee for growth work.",
  subline:
    "Start with one all-in-one AI employee: it calls, emails, texts, answers, researches, sells, markets, books, revives stale leads, follows up, and logs proof before you add headcount.",
  lanes: [
    "Appointment setting",
    "Lead revival",
    "Offer promotion",
    "Quote follow-up",
    "Payment recovery",
    "Inbound conversion",
  ],
  loop: AGENT_DIRECTION_MODES.outbound.loop,
  proof: ["Calls", "Emails", "Texts", "Answers", "Books", "Reports"],
  differentiator:
    "Wireline turns repetitive conversation work into booked appointments, revived leads, handled callbacks, completed follow-up, recovered opportunities, and logged proof.",
  beforeStrip:
    "Build one best employee, train it on the business, connect the conversation channels it needs, then improve from the logged outcomes. Specialists come later when volume proves the need.",
} as const;

export const MARKETING_VOICE = {
  eyebrow: null,
  headline: BRAND_SYSTEM.brandSpine.join(" → "),
  subline: "One AI employee for voice, email, and text/SMS conversations.",
  channelHeadline: "Voice agent. Email agent. Text/SMS agent. One AI employee.",
  channelPromise: ONE_EMPLOYEE_CHANNEL_PROMISE,
  channels: EMPLOYEE_CHANNELS,
  spine: BRAND_SYSTEM.brandSpine,
  proof: BRAND_SYSTEM.proofLoop,
  extensionLead:
    "Command your AI employee from any page. It researches, calls, emails, texts, follows up, books the next step, and logs proof while you stay focused.",
  differentiator: OUTBOUND_WEDGE.differentiator,
} as const;

export const CLIENT_SURFACE_POSTURE = {
  summary:
    "Web is the canonical runtime. Browser Command and ChatGPT are early-access companions. Android remains in internal beta; iPhone follows device QA and signing.",
  browser: {
    status: "Early access",
    action: "Install guide",
  },
  chatgpt: {
    status: "Early access",
    action: "Open MCP",
  },
  android: {
    status: "Internal beta",
    action: "Internal testing",
  },
  ios: {
    status: "Planned",
    action: "Join waitlist",
  },
} as const;

export const BUSINESS_MARKETING_VOICE = {
  eyebrow: "Best employee · business conversations",
  proof: ["Answers demand", "Follows up", "Books appointments", "Logs outcomes"],
  differentiator:
    "Wireline keeps profit-focused conversations moving across voice, email, and text/SMS without splitting customer context across separate employees.",
  beforeStrip: OUTBOUND_WEDGE.beforeStrip,
} as const;

export const WORKSPACE_VOICE = {
  createHeadline: "Build your best employee.",
  runHeadline: "Your right-hand employee is live.",
  emptyCue: "Brief it. Train it. Connect voice, email, and text/SMS.",
  commandPrompts: [
    "Answer calls",
    "Reply to email",
    "Send a follow-up text",
    "Book appointments",
    "Revive leads",
  ],
  directAgent: (name?: string | null) =>
    `Ask anything about ${name?.trim() || "your AI employee"}...`,
} as const;

export const PRODUCT_VERSATILITY = {
  eyebrow: "All-purpose AI employee",
  tagline: "One best employee across every conversation. Specialists when needed.",
  short:
    "One trained AI employee for voice, email, and text/SMS across sales, marketing, appointment setting, lead revival, support, scheduling, follow-up, inbound conversion, recovery, and personal admin.",
  hero: "One employee for every conversation that keeps work moving.",
} as const;

export const PRODUCT_POSTURE = {
  personal: {
    badge: "Personal best employee",
    badgeShort: "Personal",
    createCta: "Build personal employee",
    emptyTitle: "Your best employee.",
    emptyBody: "Your calls, emails, and texts. Your direction. Your outcomes.",
  },
  business: {
    badge: "Best employee",
    badgeShort: "Business",
    createCta: "Build best employee",
    emptyTitle: "Your best employee.",
    emptyBody: "Leads in. Conversations handled. Outcomes out.",
  },
} as const;

export function formatAgentRoleLabel(role?: string | null): string {
  if (role === "ceo") return "Best Employee";
  return (role || "agent").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** Canonical trust posture for sales and regulated verticals — policy-driven, not stealth. */
export const TRUST_DISCLOSURE_FAQ =
  "Wireline agents are configured around your disclosure policy, consent rules, and conversation purpose. When disclosure is required or enabled, it is logged automatically. The goal is quick, clear qualification and real opportunities that move forward." as const;

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
