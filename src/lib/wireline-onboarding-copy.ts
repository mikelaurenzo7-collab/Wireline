/**
 * Post-signup onboarding copy — operator-facing, Wireline-native.
 */

import { getSignupWedgeRecommendation } from "./signup-intent";

export const ONBOARDING_WELCOME = {
  eyebrow: "Welcome aboard",
  title: "Get to your first",
  titleAccent: "real call",
  subtitle:
    "Wireline wins when a customer talks to your agent on a live line. Fast Setup gets you provisioned — then we help you land that first useful conversation.",
  bullets: [
    { label: "Agent", detail: "Name, role, and script generated from your description" },
    { label: "Knowledge", detail: "Optional website scrape for services and policies" },
    {
      label: "Activate",
      detail: "Provision a US line, dial in, and complete one real conversation",
    },
  ],
  ctaPrimary: "Start Fast Setup",
  ctaSecondary: "Explore the console",
  timeHint: "~3 min setup",
} as const;

export function onboardingWelcomeSubtitle(signupWedge: string | null): string {
  const rec = getSignupWedgeRecommendation(signupWedge);
  if (!rec) return ONBOARDING_WELCOME.subtitle;
  return `Matched for ${rec.label}: we'll start from the ${rec.templateLabel} template. ${ONBOARDING_WELCOME.subtitle}`;
}

/** Replaces the old auto Product Tour — shown once after Fast Start completes. */
export const CONSOLE_MAP = {
  sectionTitle: "Your console",
  items: [
    {
      id: "agents",
      label: "Studio",
      detail: "Build, voice & tune your agents",
      path: "/agents",
    },
    {
      id: "ops",
      label: "Live Ops",
      detail: "Live callers, approvals, and fleet pulse",
      path: "/ops",
    },
    {
      id: "chat",
      label: "Chat",
      detail: "Director + per-agent coaching",
      path: "/chat",
    },
    {
      id: "insights",
      label: "Insights",
      detail: "Call scores, topics, and trends",
      path: "/insights",
    },
  ],
} as const;

/** Editorial panel on auth — first impression before the operator console. */
export const AUTH_PORTAL_SHOWCASE = {
  eyebrow: "Operator console",
  title: "Mission control for your",
  titleAccent: "AI fleet",
  subtitle:
    "Wireline runs phone, email, and SMS agents on real numbers — trained on your playbook, supervised from one calm workspace.",
  features: [
    {
      id: "studio",
      label: "The Studio",
      detail:
        "Shape each agent's voice character, pick its brain — Claude, Gemini, GPT, or Grok — and put it on a real number.",
    },
    {
      id: "director",
      label: "Director co-pilot",
      detail: "Plan hires, coach agents, draft deliverables, and approve actions in one thread.",
    },
    {
      id: "live-ops",
      label: "Live Ops floor",
      detail: "Listen in, whisper-coach, approve CRM writes, and watch fleet pulse in real time.",
    },
  ],
} as const;

export const YOURE_LIVE_COPY = {
  eyebrow: "Fleet live",
  title: "You're live",
  subtitle: (agentName: string) => `${agentName} is ready to take calls.`,
  nextLabel: "What to do next",
  testCallTitle: "Run a browser test call",
  testCallDetail: "Hear your agent without dialing — tune tone and script in Chat.",
  testCallAction: "Open Chat",
  opsTitle: "Watch Live Ops",
  opsDetail: "See active callers, approve actions, and monitor fleet pulse.",
  opsAction: "Open Live Ops",
} as const;

/** Shown after Fast Start — agent exists but activation (first useful call) pending. */
export const ACTIVATION_PENDING_COPY = {
  eyebrow: "One step left",
  title: "Make your first",
  titleAccent: "real call",
  subtitle: (agentName: string) =>
    `${agentName} is provisioned. Dial your line from your phone — activation counts when a customer-quality conversation completes.`,
  phoneLabel: "Your live number",
  dialCta: "Call now to activate",
  browserTestTitle: "Browser test (optional)",
  browserTestDetail:
    "Preview voice and script in Chat — simulator calls do not count toward activation.",
  browserTestAction: "Open Chat",
  opsTitle: "Watch Live Ops",
  opsDetail: "See the call land in real time once you dial in.",
  opsAction: "Open Live Ops",
} as const;

/** Full celebration after first useful production call. */
export const ACTIVATION_COMPLETE_COPY = {
  eyebrow: "Activated",
  title: "First live call",
  titleAccent: "complete",
  subtitle: (agentName: string) =>
    `${agentName} just handled a real customer conversation. You're officially live.`,
  nextLabel: "What to do next",
} as const;

export const ACTIVATION_NUDGE_COPY = {
  eyebrow: "Activation",
  body: "Dial your line for a real conversation — that's when Wireline counts you as live.",
  cta: "Call to activate",
} as const;
