/**
 * Post-signup onboarding copy — operator-facing, Wireline-native.
 */

import { getSignupWedgeRecommendation } from "./signup-intent";

export const ONBOARDING_WELCOME = {
  eyebrow: "Welcome aboard",
  title: "Deploy your first agent",
  titleAccent: "in one sitting",
  subtitle:
    "Wireline is mission control for your AI fleet. We'll walk you through business context, voice, and optional phone — under three minutes.",
  bullets: [
    { label: "Agent", detail: "Name, role, and script generated from your description" },
    { label: "Knowledge", detail: "Optional website scrape for services and policies" },
    { label: "Go live", detail: "Dedicated US line included — or skip to browser test first" },
  ],
  ctaPrimary: "Start Fast Setup",
  ctaSecondary: "Explore the console",
  timeHint: "~3 minutes",
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
      id: "agents",
      label: "Agents",
      detail: "Deploy, voices, and knowledge",
      path: "/agents",
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
    "Wireline runs phone, email, and SMS agents on real numbers — trained on your playbook, supervised from one calm cockpit.",
  features: [
    {
      id: "director",
      label: "Director wingman",
      detail: "Plan hires, coach agents, draft deliverables, and approve actions in one thread.",
    },
    {
      id: "live-ops",
      label: "Live Ops floor",
      detail: "Listen in, whisper-coach, approve CRM writes, and watch fleet pulse in real time.",
    },
    {
      id: "deploy",
      label: "Under 10 minutes",
      detail: "Paste your site, pick a voice, provision a number — no developers required.",
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
