/**
 * Wireline Director — mission-control design contract.
 *
 * Cycle 12: World-class Empty State & Starter Prompts refinement
 * - Warmer, clearer, more confident tone
 * - Better visual hierarchy and scannability
 * - Improved first-time / reset experience
 */

import { WL_SIGNAL_CLASSES } from "./wireline-signal-design";

export const WIRELINE_DIRECTOR_BRAND = {
  violet: "#8B3FD6",
  violetDeep: "#6B2FA8",
  signal: "#10B981",
  opus: "#D97706",
} as const;

export const WL_DIRECTOR_CLASSES = {
  // ... (existing classes remain unchanged)
  emptyHero: "wl-director-empty-hero",
  starterChip: "wl-starter-chip",
  capabilityCatPill: "wl-director-cap-pill",
  // ... other classes
} as const;

// === Empty State Refinements (Cycle 12) ===

export const DIRECTOR_EMPTY_HERO = {
  eyebrow: "Mission control",
  title: "Orchestrate your fleet from",
  titleAccent: "one console",
  subtitleWithFleet: (n: number) =>
    `${n} agent${n === 1 ? "" : "s"} ready — orchestrate calls, research, and automations from a single thread.`,
  subtitleNoFleet:
    "Plan, research, coach, and execute — before your first agent goes live.",
  capabilityEyebrow: "What you can do",
  starterEyebrow: "Start with",
  discoverEyebrow: "Explore more",
  morePromptsLabel: "More ideas",
  fewerPromptsLabel: "Show fewer",
} as const;

export const DIRECTOR_STARTER_PROMPTS: readonly DirectorStarterPrompt[] = [
  {
    id: "first-agent",
    label: "What agent should I hire first?",
    intent: "Fleet planning",
  },
  {
    id: "fleet-audit",
    label: "Audit my fleet — what should I fix first?",
    intent: "Deep review",
  },
  {
    id: "business-plan",
    label: "Draft a one-page plan for my company",
    intent: "Strategy deliverable",
  },
  {
    id: "market-research",
    label: "Research competitors and pricing",
    intent: "Live intelligence",
  },
  {
    id: "outbound-sequence",
    label: "Build a follow-up sequence for missed calls",
    intent: "Multi-touch outreach",
  },
  {
    id: "post-call-coach",
    label: "Review recent calls and coach my agents",
    intent: "Fleet coaching",
  },
] as const;

export const DIRECTOR_STARTER_PROMPTS_FEATURED_COUNT = 5;

export const DIRECTOR_CAPABILITY_PILLS = [
  { id: "voice", label: "Voice" },
  { id: "email", label: "Email" },
  { id: "sms", label: "SMS" },
  { id: "documents", label: "Documents" },
  { id: "research", label: "Research" },
  { id: "integrations", label: "Integrations" },
  { id: "creative", label: "Creative" },
] as const;

// ... rest of the file remains the same
