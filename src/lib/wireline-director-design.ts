/**
 * Wireline Director — mission-control design contract.
 *
 * Single source for copy, tokens, and CSS class names used across the
 * Director chat surface. Tests assert these values so visual refactors
 * stay intentional and on-brand.
 */

export const WIRELINE_DIRECTOR_BRAND = {
  /** Primary aurora violet — matches --color-brand */
  violet: "#8B3FD6",
  violetDeep: "#6B2FA8",
  /** Success rail for executed approvals */
  signal: "#10B981",
  /** Deep analysis (Opus) accent */
  opus: "#D97706",
} as const;

/** Tailwind/CSS utility bundles — referenced in components + tests */
export const WL_DIRECTOR_CLASSES = {
  missionPanel: "wl-mission-panel director-live-panel",
  composerDock: "wl-composer-dock wl-panel-elevated",
  directorBubble: "wl-director-bubble",
  operatorBubble: "wl-operator-bubble",
  proposalCard: "wl-proposal-card",
  proposalRail: "wl-proposal-rail",
  docBody: "wl-director-doc",
  liveFeedHeader: "wl-live-feed-header",
  heroOrb: "wl-director-hero-orb",
  starterChip: "wl-starter-chip",
  orchestrationStep: "wl-orchestration-step",
  liveOutput: "wl-live-output",
  threadHeader: "wl-director-thread-header",
} as const;

/** Reusable app surfaces outside Director (settings, integrations, ops panels) */
/** Director message scene chips — purple/cream only (no sky/fuchsia literals). */
export const DIRECTOR_SCENE_BADGES = {
  creative: {
    label: "Creative",
    color: "text-brand-deep",
    bg: "bg-brand/10 border-brand/25",
  },
  analysis: {
    label: "Analysis",
    color: "text-brand",
    bg: "bg-brand/8 border-brand/20",
  },
  integration: {
    label: "Integration",
    color: "text-brand",
    bg: "bg-brand/8 border-brand/20",
  },
  training: {
    label: "Training",
    color: "text-brand-deep",
    bg: "bg-brand/10 border-brand/25",
  },
  comms: {
    label: "Comms",
    color: "text-brand",
    bg: "bg-brand/8 border-brand/20",
  },
  fleet: {
    label: "Fleet Ops",
    color: "text-brand",
    bg: "bg-brand/8 border-brand/20",
  },
} as const;

export const WL_APP_CLASSES = {
  /** Desktop editorial subtitle under TopBar — operator context */
  pageContext: "wl-page-context",
  /** Director / chat primary surface */
  missionCanvas: "wl-mission-canvas",
  settingsPanel: "wl-panel-elevated border border-border rounded-md p-6 space-y-5 mt-8",
  settingsIcon:
    "w-10 h-10 rounded-md bg-brand flex items-center justify-center text-primary-foreground shrink-0",
  settingsRow: "wl-panel border border-border rounded-md p-4 transition-colors",
  successReveal: "rounded-md bg-brand/10 border border-brand/35 p-4 space-y-3",
  statusActive: "bg-brand/15 text-brand border-brand/30",
  statusOk: "bg-brand/10 text-brand border-brand/20",
  statusPending: "bg-brand/8 text-brand/90 border-brand/25",
  statusDead: "bg-destructive/10 text-destructive border-destructive/30",
  /** Executed approval / success — signal green, used sparingly */
  statusSuccess: "wl-status-success",
  textSuccess: "wl-text-success",
  pulseLive: "wl-pulse-live",
  modalSurface: "wl-modal-surface",
  /** Framed empty / insight stat — elevated panel without aurora chrome */
  panelFrame: "relative rounded-md wl-panel-elevated border border-border overflow-hidden",
  insightStatCard: "relative rounded-md wl-panel border border-black/8 overflow-hidden",
  /** Grouped icon controls (theme, shortcuts) on cream workspace header */
  chromeToolbar: "wl-chrome-toolbar",
  /** Compact mobile route strip under TopBar */
  mobileContextBar: "wl-mobile-context-bar",
} as const;

export type DirectorStreamPhase = "connecting" | "thinking" | "replying" | "done";

export const DIRECTOR_PHASE_COPY: Record<DirectorStreamPhase, { headline: string; sub: string }> = {
  connecting: {
    headline: "Opening mission control",
    sub: "Secure channel to your fleet wingman",
  },
  thinking: {
    headline: "Working the problem",
    sub: "Fleet context · integrations · operator intent",
  },
  replying: {
    headline: "Packaging your wingman reply",
    sub: "Actions, approvals, and deliverables",
  },
  done: {
    headline: "Locking in response",
    sub: "Almost ready for your review",
  },
};

export function directorPhaseCopy(input: {
  phase: DirectorStreamPhase;
  isDeep?: boolean;
  coachAgentName?: string | null;
}): { headline: string; sub: string } {
  const base = DIRECTOR_PHASE_COPY[input.phase];
  if (input.phase === "thinking" && input.isDeep) {
    return {
      headline: "Deep fleet analysis",
      sub: "Cross-agent strategy · Opus reasoning",
    };
  }
  if (input.coachAgentName && input.phase === "thinking") {
    return {
      headline: `Coaching ${input.coachAgentName}`,
      sub: "Config · capabilities · live call context",
    };
  }
  return base;
}

export interface DirectorStarterPrompt {
  id: string;
  label: string;
  /** Shown as micro-caption on hover / accessibility */
  intent: string;
}

/** Empty-state chips — intrigue without generic AI fluff */
export const DIRECTOR_STARTER_PROMPTS: readonly DirectorStarterPrompt[] = [
  {
    id: "first-agent",
    label: "What agent should I hire first?",
    intent: "Fleet planning for new operators",
  },
  {
    id: "sales-setup",
    label: "Set up a sales agent for my business",
    intent: "Guided deploy + GTM",
  },
  {
    id: "fleet-audit",
    label: "Audit my fleet — what should I fix first?",
    intent: "Deep fleet review",
  },
  {
    id: "business-plan",
    label: "Draft a one-page plan for my company",
    intent: "In-chat deliverable",
  },
  {
    id: "market-research",
    label: "Research competitors and pricing in my market",
    intent: "Live web intel via grounded search",
  },
] as const;

export const DIRECTOR_EMPTY_HERO = {
  eyebrow: "Mission control",
  title: "Your always-on",
  titleAccent: "business wingman",
  subtitleWithFleet: (n: number) =>
    `${n} agent${n === 1 ? "" : "s"} live — orchestrate calls, comms, and integrations from one thread.`,
  subtitleNoFleet:
    "Plan your fleet, research your market, coach agents, run Shopify and CRM work, and ship — before you hire agent #1.",
} as const;

export const DIRECTOR_LIVE_STEP_COPY = {
  contextCoach: (name: string) => `Loading ${name} coaching context`,
  contextFleet: (n: number) =>
    n > 0 ? `Scanning ${n} agent${n === 1 ? "" : "s"} in fleet` : "Reading your business setup",
  contextSub: "Thread history · settings · recent calls",
  integrationsOn: "Arming connected integrations",
  integrationsOnSub: "Shopify · CRM · Slack · calendar paths",
  integrationsOff: "Core wingman mode",
  integrationsOffSub: "Strategy · docs · orchestration — no OAuth required",
  executeTitle: "Staging approval cards",
  executeSub: "Calls · texts · emails · integration jobs",
  composeCoach: "Tailoring coach recommendations",
  composeFleet: "Composing wingman response",
  composeSub: "Clear · actionable · ready to approve",
} as const;

export const LIVE_FEED_LABELS = {
  scripted: "Live integrations",
  proposal: "Proposed workflow",
  proposalHint: "Approve below to execute — nothing runs until you confirm.",
} as const;
