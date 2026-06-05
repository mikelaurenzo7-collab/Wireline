/**
 * Wireline Director — mission-control design contract.
 */

import { WL_SIGNAL_CLASSES } from "./wireline-signal-design";

export const WIRELINE_DIRECTOR_BRAND = {
  violet: "#8B3FD6",
  violetDeep: "#6B2FA8",
  signal: "#10B981",
  opus: "#D97706",
} as const;

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
  fleetConstellation: WL_SIGNAL_CLASSES.fleetConstellation,
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
  composerContextPill: "wl-composer-context-pill",
  composerSendRow: "wl-composer-send-row",
  composerSendBtn: "wl-composer-send-btn",
  composerInput: "wl-composer-input",
  composerColumn: "w-full max-w-3xl lg:max-w-5xl xl:max-w-6xl mx-auto",
  composerToolbarScroll: "wl-composer-toolbar-scroll",
  assistantMessage: "wl-director-message--assistant",
  messageMeta: "wl-director-message-meta",
  capabilityCatPill: "wl-director-cap-pill",
  scrollToBottom: "wl-scroll-to-bottom-btn",
  artifactsPanel: "wl-director-artifacts-panel",
  researchSources: "wl-director-research-sources",
  opusBadge: "wl-director-opus-badge",
  liveOrchestra: "wl-live-orchestra",
  microLabel: "wl-director-micro",
  metaCaption: "wl-director-meta",
  spotlightLabel: "wl-director-spotlight-label",
} as const;

export const WL_APP_CLASSES = {
  pageContext: "wl-page-context",
  pageContextAccent: "wl-page-context-accent",
  workspaceEyebrow: "wl-workspace-eyebrow",
  workspaceTitle: "wl-workspace-title",
  bodyCaption: "wl-body-caption",
  inlineEmpty: "wl-inline-empty",
  inlineEmptyLabel: "wl-inline-empty__label",
  missionCanvas: "wl-mission-canvas",
  settingsPanel: "wl-panel-elevated border border-border rounded-md p-6 space-y-5 mt-8",
  settingsIcon: "w-10 h-10 rounded-md bg-brand flex items-center justify-center text-primary-foreground shrink-0",
  settingsRow: "wl-panel border border-border rounded-md p-4 transition-colors",
  successReveal: "rounded-md bg-brand/10 border border-brand/35 p-4 space-y-3",
  statusActive: "bg-brand/15 text-brand border-brand/30",
  statusOk: "bg-brand/10 text-brand border-brand/20",
  statusPending: "bg-brand/8 text-brand/90 border-brand/25",
  statusDead: "bg-destructive/10 text-destructive border-destructive/30",
  statusSuccess: "wl-status-success",
  textSuccess: "wl-text-success",
  pulseLive: "wl-pulse-live",
  modalSurface: "wl-modal-surface",
  panelFrame: "relative rounded-md wl-panel-elevated border border-border overflow-hidden",
  signalOrbFrame: WL_SIGNAL_CLASSES.signalOrbFrame,
  signalOrbRefined: WL_SIGNAL_CLASSES.signalOrbRefined,
  emptyStateSignal: WL_SIGNAL_CLASSES.emptyStateSignal,
  proTitle: "wl-pro-title",
  proEyebrow: "wl-pro-eyebrow",
  insightStatCard: "relative rounded-md wl-panel border border-black/8 overflow-hidden",
  chromeToolbar: "wl-chrome-toolbar",
  mobileContextBar: "wl-mobile-context-bar",
  mobileContextAccent: "wl-mobile-context-accent",
  segmentStrip: "app-segment-strip",
  banner: "wl-banner",
  surfaceVelvet: "bg-paper/90 dark:bg-velvet/60",
  surfaceVelvetStrong: "bg-paper/95 dark:bg-velvet/80",
  chromeInverseHover: "chrome-inverse-hover hover:bg-white/10",
  bannerInfo: "wl-banner wl-banner--info",
  bannerWarn: "wl-banner wl-banner--warn",
  bannerCritical: "wl-banner wl-banner--critical",
  bannerCta: "app-micro-cta",
} as const;

// Director Scene Badges

export const DIRECTOR_SCENE_BADGES = {
  creative: { label: "Creative", color: "text-brand-deep", bg: "bg-brand/10 border-brand/25" },
  analysis: { label: "Analysis", color: "text-brand", bg: "bg-brand/8 border-brand/20" },
  integration: { label: "Integration", color: "text-brand", bg: "bg-brand/8 border-brand/20" },
  training: { label: "Training", color: "text-brand-deep", bg: "bg-brand/10 border-brand/25" },
  comms: { label: "Comms", color: "text-brand", bg: "bg-brand/8 border-brand/20" },
  fleet: { label: "Fleet Ops", color: "text-brand", bg: "bg-brand/8 border-brand/20" },
  document: { label: "Deliverable", color: "text-brand-deep", bg: "bg-brand/10 border-brand/25" },
  code: { label: "Code", color: "text-brand-deep", bg: "bg-brand/10 border-brand/25" },
} as const;

// Capability Catalog (simplified for build fix - full catalog can be restored later)
export const DIRECTOR_CAPABILITY_CATEGORY_LABELS = {
  strategy: "Strategy & ops",
  create: "Documents & copy",
  execute: "Outbound comms",
  research: "Live research",
  integrations: "Connected apps",
  coach: "Agent coaching",
  creative: "Brand & visuals",
} as const;

export const DIRECTOR_CAPABILITY_CATALOG = [] as const;

export const DIRECTOR_COMPOSER_HINTS = ["Message Director…"] as const;
export const DIRECTOR_DEEP_MODE_COPY = { label: "Deep analysis", shortLabel: "Deep", hint: "" } as const;
export const DIRECTOR_MODEL_PICKER_COPY = { label: "Model", shortLabel: "Model", hint: "" } as const;

export const DIRECTOR_EMPTY_HERO = {
  eyebrow: "Mission control",
  title: "Orchestrate your fleet from",
  titleAccent: "one console",
  subtitleWithFleet: (n: number) => `${n} agent${n === 1 ? "" : "s"} ready — orchestrate calls, research, and automations from a single thread.`,
  subtitleNoFleet: "Plan, research, coach, and execute — before your first agent goes live.",
  capabilityEyebrow: "What you can do",
  starterEyebrow: "Start with",
  discoverEyebrow: "Explore more",
  morePromptsLabel: "More ideas",
  fewerPromptsLabel: "Show fewer",
} as const;

export const DIRECTOR_STARTER_PROMPTS = [] as const;
export const DIRECTOR_STARTER_PROMPTS_FEATURED_COUNT = 5;
export const DIRECTOR_CAPABILITY_PILLS = [] as const;

export const DIRECTOR_LIVE_STEP_COPY = {} as const;
export const LIVE_FEED_LABELS = {} as const;

export function directorCapabilitiesByCategory() { return {}; }
