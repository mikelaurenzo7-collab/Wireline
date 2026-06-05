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
  threadColumn: "wl-director-thread",
  messageStack: "wl-director-message-stack",
  messageBubble: "wl-director-message",
  operatorMessageStack: "wl-director-message-stack wl-director-message-stack--operator",
  emptyHero: "wl-director-empty-hero",
  composerToolbar: "wl-director-composer-toolbar",
  composerAccessory: "wl-composer-accessory-panel",
  composerToolChip: "wl-composer-tool-chip",
  composerToolChipActive: "wl-composer-tool-chip--active",
  composerToolChipEngaged: "wl-composer-tool-chip--engaged",
  composerContextStrip: "wl-composer-context-strip",
  composerSendRow: "wl-composer-send-row",
  assistantMessage: "wl-director-message--assistant",
  messageMeta: "wl-director-message-meta",
  capabilityCatPill: "wl-director-cap-pill",
  scrollToBottom: "wl-scroll-to-bottom-btn",
  artifactsPanel: "wl-director-artifacts-panel",
  researchSources: "wl-director-research-sources",
  opusBadge: "wl-director-opus-badge",
  liveOrchestra: "wl-live-orchestra",
  /** 9px uppercase — live output / stream chrome headers */
  microLabel: "wl-director-micro",
  /** 10px supporting copy under step titles, tickets, pipeline detail */
  metaCaption: "wl-director-meta",
  /** Spotlight section label in live orchestra */
  spotlightLabel: "wl-director-spotlight-label",
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
  document: {
    label: "Deliverable",
    color: "text-brand-deep",
    bg: "bg-brand/10 border-brand/25",
  },
} as const;

export type DirectorCapabilityCategory =
  | "strategy"
  | "create"
  | "execute"
  | "research"
  | "integrations"
  | "coach"
  | "creative";

export const DIRECTOR_CAPABILITY_CATEGORY_LABELS: Record<DirectorCapabilityCategory, string> = {
  strategy: "Strategy & ops",
  create: "Documents & copy",
  execute: "Outbound comms",
  research: "Live research",
  integrations: "Connected apps",
  coach: "Agent coaching",
  creative: "Brand & visuals",
};

export interface DirectorCapabilityItem {
  id: string;
  label: string;
  description: string;
  category: DirectorCapabilityCategory;
  /** Example operator utterance — sent when picked from catalog */
  example: string;
}

/** Full capability matrix — what clients can ask Director to do */
export const DIRECTOR_CAPABILITY_CATALOG: readonly DirectorCapabilityItem[] = [
  {
    id: "fleet-audit",
    label: "Fleet audit",
    description: "Cross-agent review with prioritized fixes",
    category: "strategy",
    example: "Audit my fleet — what should I fix first?",
  },
  {
    id: "weekly-priorities",
    label: "Weekly priorities",
    description: "Ops focus for the next 7 days from live call data",
    category: "strategy",
    example: "What should my team focus on this week based on recent calls?",
  },
  {
    id: "gtm-plan",
    label: "GTM one-pager",
    description: "Positioning, ICP, and channel plan for your offer",
    category: "strategy",
    example: "Draft a one-page GTM plan for my business",
  },
  {
    id: "business-plan",
    label: "Business plan",
    description: "Structured plan with goals, metrics, and milestones",
    category: "create",
    example: "Draft a one-page business plan for my company",
  },
  {
    id: "call-script",
    label: "Call script",
    description: "Opener, discovery, objection handling, close",
    category: "create",
    example: "Write a phone script for booking HVAC estimates",
  },
  {
    id: "email-sequence",
    label: "Email sequence",
    description: "Multi-touch follow-up with subject lines",
    category: "create",
    example: "Draft a 3-email follow-up sequence for missed calls",
  },
  {
    id: "sop",
    label: "SOP / playbook",
    description: "Step-by-step ops doc your team can run",
    category: "create",
    example: "Write an SOP for how agents should handle billing disputes",
  },
  {
    id: "outbound-call",
    label: "Place a call",
    description: "Outbound call draft — approve before dialing",
    category: "execute",
    example: "Call Jordan Lee back about tomorrow's estimate",
  },
  {
    id: "outbound-text",
    label: "Send a text",
    description: "SMS follow-up drafted for one-click send",
    category: "execute",
    example: "Text the lead we spoke with yesterday a booking link",
  },
  {
    id: "outbound-email",
    label: "Send email",
    description: "Transactional or follow-up email on approval",
    category: "execute",
    example: "Email the customer a summary of our call and next steps",
  },
  {
    id: "workflow",
    label: "Multi-step workflow",
    description: "CRM lookup → message → log — staged as steps",
    category: "execute",
    example: "Look up their Shopify order, text them the status, and log it in CRM",
  },
  {
    id: "competitor-scan",
    label: "Competitor scan",
    description: "Live web research with cited sources",
    category: "research",
    example: "Research competitors and pricing in my market",
  },
  {
    id: "regulatory",
    label: "Compliance lookup",
    description: "TCPA, FDCPA, industry rules — grounded search",
    category: "research",
    example: "What are the latest TCPA rules for outbound SMS to leads?",
  },
  {
    id: "crm-lookup",
    label: "CRM lookup",
    description: "Find contacts, deals, and log outcomes",
    category: "integrations",
    example: "Find this caller in HubSpot and summarize their deal stage",
  },
  {
    id: "shopify-order",
    label: "Shopify / Square",
    description: "Order status, inventory, returns, invoices",
    category: "integrations",
    example: "Look up order #1042 in Shopify and draft a status update",
  },
  {
    id: "slack-alert",
    label: "Slack / Teams alert",
    description: "Notify your team when something needs eyes",
    category: "integrations",
    example: "Post a Slack alert when a hot lead calls twice in one day",
  },
  {
    id: "coach-greeting",
    label: "Tune greeting",
    description: "Update agent opener and personality in one approval",
    category: "coach",
    example: "Make Ava's greeting warmer and mention same-day service",
  },
  {
    id: "coach-tools",
    label: "Toggle capabilities",
    description: "Turn integrations and tools on/off per agent",
    category: "coach",
    example: "Turn on calendar booking and SMS for my sales agent",
  },
  {
    id: "post-call",
    label: "Post-call coaching",
    description: "Review a recent call and propose script fixes",
    category: "coach",
    example: "Review Ava's last 5 calls and suggest script improvements",
  },
  {
    id: "logo",
    label: "Logo concepts",
    description: "Three on-brand concepts + vectorize / brand pack",
    category: "creative",
    example: "Generate 3 logo concepts for my home services brand",
  },
] as const;

export const DIRECTOR_COMPOSER_HINTS = [
  "Message Director…",
  "Ask for a fleet audit, GTM plan, or weekly priorities…",
  "Draft scripts, SOPs, email sequences, or a business plan…",
  "Research competitors, pricing, or compliance — live web intel…",
  "Orchestrate calls, texts, emails, and CRM work in one thread…",
  "Coach an agent: select Coach, then describe the change…",
] as const;

export type ComposerAccessoryKind = "connectors" | "capabilities" | "coach" | "tools" | "attach";

export const DIRECTOR_COMPOSER_ACCESSORY_HINTS: Record<ComposerAccessoryKind, string> = {
  connectors: "Connector lanes your fleet can orchestrate through Director",
  capabilities: "Tap a skill — example prompt lands in the composer",
  coach: "Route this thread through one agent's memory and tools",
  tools: "Abilities currently armed for the coached agent",
  attach: "Documents, fleet context rules, or playbook instructions",
};

export const DIRECTOR_COMPOSER_CONTEXT = {
  coachingPrefix: "Coaching",
  clearCoachLabel: "Return to fleet-only mode",
  closePanelLabel: "Close composer panel",
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
  /** System banners (trial, verify email) */
  banner: "wl-banner",
  bannerInfo: "wl-banner wl-banner--info",
  bannerWarn: "wl-banner wl-banner--warn",
  bannerCritical: "wl-banner wl-banner--critical",
  bannerCta: "app-micro-cta",
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
  {
    id: "outbound-sequence",
    label: "Build a follow-up sequence for missed calls",
    intent: "Multi-touch comms + scripts",
  },
  {
    id: "support-playbook",
    label: "Write a support playbook for angry callers",
    intent: "SOP + escalation paths",
  },
  {
    id: "logo-brand",
    label: "Generate logo concepts for my brand",
    intent: "Creative approval flow",
  },
  {
    id: "post-call-coach",
    label: "Review recent calls and coach my agents",
    intent: "Fleet coaching from call history",
  },
  {
    id: "collections",
    label: "Help me set up compliant collections outreach",
    intent: "FDCPA-aware comms planning",
  },
] as const;

/** Featured count on Director empty state — rest collapse behind "More prompts" */
export const DIRECTOR_STARTER_PROMPTS_FEATURED_COUNT = 4;

export const DIRECTOR_CAPABILITY_PILLS = [
  { id: "voice", label: "Voice" },
  { id: "email", label: "Email" },
  { id: "sms", label: "SMS" },
  { id: "documents", label: "Documents" },
  { id: "research", label: "Research" },
  { id: "crm", label: "CRM" },
  { id: "integrations", label: "Integrations" },
  { id: "creative", label: "Creative" },
] as const;

export const DIRECTOR_LOADING_COPY = {
  headline: "Opening mission control",
  sub: "Thread history · fleet context · integrations",
} as const;

export const DIRECTOR_EMPTY_HERO = {
  eyebrow: "Mission control",
  title: "Your always-on",
  titleAccent: "business wingman",
  subtitleWithFleet: (n: number) =>
    `${n} agent${n === 1 ? "" : "s"} on deck — orchestrate calls, comms, and integrations from one thread.`,
  subtitleNoFleet:
    "Plan your fleet, research your market, coach agents, and run CRM work — before agent #1 goes live.",
  capabilityEyebrow: "One console for",
  starterEyebrow: "Start here",
  discoverEyebrow: "Explore capabilities",
  morePromptsLabel: "More prompts",
  fewerPromptsLabel: "Show fewer",
} as const;

/** Agent workspace empty-state chips — parity with Director discovery */
export const AGENT_WORKSPACE_STARTER_PROMPTS: readonly DirectorStarterPrompt[] = [
  {
    id: "review-calls",
    label: "Review my last few calls",
    intent: "Call history coaching",
  },
  {
    id: "objection",
    label: "Help me handle price objections",
    intent: "Objection handling",
  },
  {
    id: "opening-script",
    label: "Tighten my opening script",
    intent: "Script refinement",
  },
] as const;

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
  proposalCount: (n: number) =>
    n === 1 ? "1 action awaiting approval" : `${n} actions awaiting approval`,
  researchEyebrow: "Grounded web sources",
} as const;

/** Copy for DirectorLiveOrchestra — fleet channel / runway / spotlight */
export const LIVE_ORCHESTRA_COPY = {
  eyebrow: "Fleet channel",
  armSequence: "Arming integration sequence…",
  armNext: "Next on the runway",
  queuedPrefix: "Queued:",
  clearedSummary: (n: number) =>
    n === 1 ? "1 action cleared · packaging reply" : `${n} actions cleared · packaging reply`,
  liveNow: "Live",
  spotlightLive: "Executing now",
  spotlightLast: "Last signal",
  spotlightNext: "On deck",
  queueLabel: "Up next",
  clearedLabel: "Cleared",
} as const;

/** Group catalog items by category for UI accordions */
export function directorCapabilitiesByCategory(): Record<
  DirectorCapabilityCategory,
  DirectorCapabilityItem[]
> {
  const grouped = {} as Record<DirectorCapabilityCategory, DirectorCapabilityItem[]>;
  for (const cat of Object.keys(
    DIRECTOR_CAPABILITY_CATEGORY_LABELS,
  ) as DirectorCapabilityCategory[]) {
    grouped[cat] = [];
  }
  for (const item of DIRECTOR_CAPABILITY_CATALOG) {
    grouped[item.category].push(item);
  }
  return grouped;
}
