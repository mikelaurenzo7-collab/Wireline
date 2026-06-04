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
    { label: "Go live", detail: "Provision a number or test from the browser" },
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
