/**
 * Wireline product design system — shared class constants for the web app.
 * Vision: src/lib/wireline-design-vision.ts
 * Tokens: src/styles/foundation.css and src/styles/design-system.css
 */

import { AUTHENTICATED_SURFACE_CONTRACT } from "./authenticated-surface-contract";
import { WIRELINE_DESIGN_VISION } from "./wireline-design-vision";

/** Canonical vision metadata for tooling and contracts. */
export const WL_VISION = WIRELINE_DESIGN_VISION;

/** Authenticated Claude Design screen contract for Settings, Training, and IA hierarchy. */
export const WL_AUTHENTICATED_SURFACE_CONTRACT = AUTHENTICATED_SURFACE_CONTRACT;

/** Wireline Letterpress accent used across shared UI surfaces. */
export const WL_BRAND = {
  accent: "var(--primary)",
  /** Hex for SVG/canvas where CSS variables are unreliable */
  accentHex: "#A78BFA",
} as const;

/** Workspace surfaces, settings, insights, ops panels */
export const WL_APP_CLASSES = {
  pageContext: "wl-page-context tracking-tight",
  pageContextAccent: "wl-page-context-accent",
  /** Wired silver strand — authenticated section kickers */
  wiredEyebrow: "wl-eyebrow wl-eyebrow--wired wl-eyebrow--wired--app",
  workspaceEyebrow: "wl-workspace-eyebrow",
  workspaceTitle: "wl-workspace-title",
  bodyCaption: "wl-body-caption",
  inlineEmpty: "wl-inline-empty",
  inlineEmptyLabel: "wl-inline-empty__label",
  missionCanvas: "bg-background",
  settingsPanel:
    "wl-panel-elevated border border-border rounded-xl p-6 space-y-6 mt-8 transition-all duration-300",
  settingsIcon:
    "w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shrink-0",
  settingsRow:
    "wl-panel border border-border rounded-xl p-4 transition-all duration-200 hover:border-border hover:bg-secondary/50",
  successReveal:
    "rounded-xl bg-secondary border border-border p-4 space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300",
  statusActive: "bg-primary/10 text-primary border-primary/25",
  statusOk: "wl-status-success wl-text-success",
  statusPending: "bg-muted text-muted-foreground border-border",
  statusDead: "bg-destructive/10 text-destructive border-destructive/30",
  statusSuccess: "wl-status-success transition-all duration-200",
  textSuccess: "wl-text-success",
  pulseLive: "wl-pulse-live",
  modalSurface: "wl-panel-elevated transition-all duration-300 ease-out",
  panelFrame:
    "relative rounded-xl wl-panel-elevated border border-border overflow-hidden transition-all duration-300 hover:shadow-sm",
  proTitle: "wl-pro-title",
  proEyebrow: "wl-pro-eyebrow",
  insightStatCard:
    "relative rounded-xl wl-panel border border-border overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm",
  chromeToolbar: "wl-chrome-toolbar",
  mobileContextBar: "wl-mobile-context-bar",
  mobileContextAccent: "wl-mobile-context-accent",
  segmentStrip: "app-segment-strip",
  banner: "wl-banner transition-all duration-300",
  surfaceVelvet: "bg-card backdrop-blur-md",
  surfaceVelvetStrong: "bg-card backdrop-blur-lg",
  chromeInverseHover: "hover:bg-foreground/10 transition-colors duration-150",
  bannerInfo: "wl-banner wl-banner--info",
  bannerWarn: "wl-banner wl-banner--warn",
  bannerCritical: "wl-banner wl-banner--critical",
  bannerCta: "app-micro-cta",
  /** Call ops, inbox, and other operate-route shells */
  operateSurface: "wl-operate-surface",
} as const;

/** Assistants coach / composer streaming UI */
export const WL_COMPOSER_CLASSES = {
  missionPanel: "wl-mission-panel director-live-panel transition-all duration-300 ease-in-out",
  composerDock:
    "wl-composer-dock wl-panel-elevated transition-all duration-200 ease-out focus-within:ring-2 focus-within:ring-ring/30",
  directorBubble: "rounded-xl border border-border bg-card transition-all duration-200",
  accountHolderBubble: "rounded-xl border border-border bg-secondary transition-all duration-200",
  proposalCard:
    "wl-proposal-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm",
  proposalRail: "wl-proposal-rail",
  docBody: "wl-director-doc",
  liveFeedHeader: "wl-live-feed-header",
  heroOrb: "wl-director-hero-orb animate-pulse",
  starterChip: "wl-chip-suggestion transition-all duration-200 active:scale-[0.98]",
  orchestrationStep: "wl-orchestration-step transition-all duration-200",
  liveOutput: "wl-live-output",
  threadHeader: "wl-director-thread-header",
  threadColumn: "wl-director-thread",
  messageStack: "wl-director-message-stack",
  messageBubble: "wl-director-message transition-all duration-200",
  userMessageStack: "wl-director-message-stack wl-director-message-stack--user",
  emptyHero: "wl-director-empty-hero",
  composerToolbar: "wl-director-composer-toolbar border-b border-border/40 pb-1.5",
  composerAccessory: "wl-composer-accessory-panel transition-all duration-200 ease-in-out",
  composerToolChip: "wl-composer-tool-chip transition-all duration-150 active:scale-95",
  composerToolChipActive: "wl-composer-tool-chip--active",
  composerToolChipEngaged: "wl-composer-tool-chip--engaged",
  composerContextStrip: "wl-composer-context-strip",
  composerContextPill: "wl-composer-context-pill",
  composerSendRow: "wl-composer-send-row",
  composerSendBtn: "wl-composer-send-btn transition-all duration-150 active:scale-90",
  composerInput: "wl-composer-input focus:outline-none focus:ring-0",
  composerColumn: "w-full max-w-3xl lg:max-w-5xl xl:max-w-6xl mx-auto",
  composerToolbarScroll: "wl-composer-toolbar-scroll",
  assistantMessage: "wl-director-message--assistant",
  messageMeta: "wl-director-message-meta",
  capabilityCatPill: "wl-director-cap-pill transition-all duration-150 hover:bg-secondary",
  scrollToBottom:
    "wl-scroll-to-bottom-btn transition-all duration-200 active:scale-95 hover:shadow-sm",
  artifactsPanel: "wl-director-artifacts-panel",
  researchSources: "wl-director-research-sources",
  opusBadge: "wl-director-opus-badge",
  liveOrchestra: "wl-live-orchestra",
  microLabel: "wl-director-micro",
  metaCaption: "wl-director-meta",
  spotlightLabel: "wl-director-spotlight-label",
  turnStratum: "wl-turn-stratum rounded-xl border border-border bg-secondary/40 overflow-hidden",
  turnStratumDeep: "border-l-2 border-l-primary",
  turnStratumHeader:
    "w-full h-auto justify-start gap-2 rounded-xl px-2 py-1.5 hover:bg-secondary active:bg-muted",
  turnSummaryStrip: "wl-turn-summary-strip flex flex-wrap items-center gap-1.5 mb-2",
  turnSummaryChip:
    "h-auto rounded-md border border-border bg-secondary px-2 py-0.5 wl-micro-meta font-mono tabular-nums text-muted-foreground hover:bg-muted",
  actionLog: "wl-turn-action-log space-y-0.5 px-2 pb-2",
  actionRow: "relative flex items-start gap-2 py-1 pl-4",
  actionRowFailed: "text-destructive",
  actionDetail:
    "mt-1 rounded-md border border-border bg-muted/50 px-2 py-1.5 font-mono text-[length:var(--wireline-typography-overline-size)] leading-relaxed text-muted-foreground whitespace-pre-wrap break-words",
} as const;

/** @deprecated use WL_COMPOSER_CLASSES */
export const WL_DIRECTOR_CLASSES = WL_COMPOSER_CLASSES;
