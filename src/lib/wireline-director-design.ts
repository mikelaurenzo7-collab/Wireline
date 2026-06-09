/**
 * Wireline Director — mission-control design contract.
 *
 * Single source for copy, tokens, and CSS class names used across the
 * Director chat surface. Tests assert these values so visual refactors
 * stay intentional and on-brand.
 */

import { WL_SIGNAL_CLASSES } from "./wireline-signal-design";

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
  missionPanel: "wl-mission-panel director-live-panel transition-all duration-300 ease-in-out",
  composerDock:
    "wl-composer-dock wl-panel-elevated transition-all duration-200 ease-out focus-within:ring-2 focus-within:ring-brand/30",
  directorBubble: "wl-director-bubble transition-all duration-200 hover:shadow-md",
  operatorBubble: "wl-operator-bubble transition-all duration-200 hover:shadow-md",
  proposalCard:
    "wl-proposal-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg",
  proposalRail: "wl-proposal-rail",
  docBody: "wl-director-doc",
  liveFeedHeader: "wl-live-feed-header",
  heroOrb: "wl-director-hero-orb animate-pulse",
  fleetConstellation: WL_SIGNAL_CLASSES.fleetConstellation,
  starterChip:
    "wl-starter-chip transition-all duration-200 hover:scale-[1.03] active:scale-[0.98] hover:border-brand/40",
  orchestrationStep: "wl-orchestration-step transition-all duration-200",
  liveOutput: "wl-live-output font-mono",
  threadHeader: "wl-director-thread-header",
  threadColumn: "wl-director-thread",
  messageStack: "wl-director-message-stack",
  messageBubble: "wl-director-message transition-all duration-200",
  operatorMessageStack: "wl-director-message-stack wl-director-message-stack--operator",
  emptyHero: "wl-director-empty-hero",
  composerToolbar: "wl-director-composer-toolbar border-b border-border/40 pb-1.5",
  composerAccessory: "wl-composer-accessory-panel transition-all duration-200 ease-in-out",
  composerToolChip: "wl-composer-tool-chip transition-all duration-150 active:scale-95",
  composerToolChipActive: "wl-composer-tool-chip--active",
  composerToolChipEngaged: "wl-composer-tool-chip--engaged",
  composerDesignToolChip: "wl-composer-design-chip transition-all duration-150 active:scale-95",
  composerDesignToolChipActive: "wl-composer-design-chip--active",
  composerDesignContextPill: "wl-composer-design-context-pill",
  composerContextStrip: "wl-composer-context-strip",
  composerContextPill: "wl-composer-context-pill",
  composerSendRow: "wl-composer-send-row",
  composerSendBtn: "wl-composer-send-btn transition-all duration-150 active:scale-90",
  composerInput: "wl-composer-input focus:outline-none focus:ring-0",
  /** Desktop-wide chat + composer column (thread + dock share this width). */
  composerColumn: "w-full max-w-3xl lg:max-w-5xl xl:max-w-6xl mx-auto",
  composerToolbarScroll: "wl-composer-toolbar-scroll",
  assistantMessage: "wl-director-message--assistant",
  messageMeta: "wl-director-message-meta",
  capabilityCatPill: "wl-director-cap-pill transition-all duration-150 hover:bg-brand/10",
  scrollToBottom:
    "wl-scroll-to-bottom-btn transition-all duration-200 active:scale-95 hover:shadow-md",
  artifactsPanel: "wl-director-artifacts-panel",
  researchSources: "wl-director-research-sources",
  opusBadge: "wl-director-opus-badge animate-pulse",
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
  design: {
    label: "Stitch UI",
    color: "text-brand-deep",
    bg: "bg-brand/12 border-brand/30",
  },
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
  code: {
    label: "Code",
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
  {
    id: "call-review",
    label: "Call review",
    description: "Rank recent calls and propose script fixes",
    category: "coach",
    example: "Review my last 10 calls and tell me what to fix in scripts first",
  },
  {
    id: "pipeline-health",
    label: "Pipeline health",
    description: "Where leads stall and what to do next",
    category: "strategy",
    example: "Analyze my outbound pipeline — where are deals stalling?",
  },
  {
    id: "deep-dive",
    label: "Deep fleet dive",
    description: "Opus-level cross-fleet analysis (slower, sharper)",
    category: "strategy",
    example: "Do a deep dive on my fleet performance over the last 30 days",
  },
  {
    id: "book-meeting",
    label: "Book a meeting",
    description: "Calendar check + confirmation draft",
    category: "integrations",
    example: "Check my calendar availability Thursday afternoon and draft a booking confirmation",
  },
  {
    id: "enrich-lead",
    label: "Enrich a lead",
    description: "Apollo lookup + personalized opener",
    category: "integrations",
    example: "Enrich alex.rivera@northstarmfg.com with Apollo and draft a cold opener",
  },
  {
    id: "docusign-flow",
    label: "Send a contract",
    description: "DocuSign envelope draft on approval",
    category: "integrations",
    example: "Draft a standard NDA follow-up and prepare it for DocuSign",
  },
  {
    id: "landing-page",
    label: "Landing page copy",
    description: "Hero, proof, CTA sections for your offer",
    category: "create",
    example: "Write homepage hero and three sections for my HVAC company",
  },
  {
    id: "website-design",
    label: "Website design",
    description: "Sitemap, page copy, and HTML/CSS prototype in chat",
    category: "create",
    example:
      "Design a new website for my business — sitemap, section copy, and a mobile-first HTML prototype I can hand to a developer",
  },
  {
    id: "code-snippet",
    label: "Code & automation",
    description: "TypeScript, SQL, scripts — copy from fenced blocks",
    category: "create",
    example:
      "Write a TypeScript Express route with Zod validation that accepts a lead intake payload",
  },
  {
    id: "objection-matrix",
    label: "Objection matrix",
    description: "Price, timing, competitor responses",
    category: "create",
    example: "Build an objection handling matrix for price, timing, and competition",
  },
  {
    id: "analyze-pdf",
    label: "Analyze a document",
    description: "Summarize an attached PDF and extract action items",
    category: "create",
    example:
      "I attached our service agreement — summarize risks and suggested agent talking points",
  },
] as const;

export const DIRECTOR_COMPOSER_HINTS = [
  "Coach your fleet…",
  "Ask for a fleet audit, GTM plan, or weekly priorities…",
  "Draft scripts, SOPs, email sequences, or a business plan…",
  "Design a website or ask for TypeScript / SQL / automation code…",
  "Research competitors, pricing, or compliance — live web intel…",
  "Orchestrate calls, texts, emails, and CRM work in one thread…",
  "Coach an agent: select Coach, then describe the change…",
  "Toggle Deep analysis for Opus-level fleet strategy…",
] as const;

export const DIRECTOR_DEEP_MODE_COPY = {
  label: "Deep analysis",
  shortLabel: "Deep",
  hint: "Opus + extended thinking for fleet strategy (not used while coaching an agent)",
} as const;

export const DIRECTOR_MODEL_PICKER_COPY = {
  label: "Model",
  shortLabel: "Model",
  hint: "Director chat only — voice agents stay on Wireline Sonnet. OpenRouter uses your company key.",
  wirelineSection: "Wireline",
  openRouterSection: "OpenRouter",
  autoLabel: "Auto (recommended)",
  sonnetLabel: "Sonnet",
  opusLabel: "Opus",
  notConfigured: "Add OPENROUTER_API_KEY in Vercel to unlock custom models.",
  requiresUpgrade: "OpenRouter custom models are on Pro and above. Upgrade in Billing to unlock.",
  searchPlaceholder: "Search models…",
  recommendedSection: "Recommended",
  browseAll: (count: number) => `All models (${count})`,
  noSearchResults: "No models match your search.",
} as const;

export const DIRECTOR_USAGE_RING_COPY = {
  title: "Monthly workspace usage",
  noPlan: "Subscribe to a plan to track voice and AI usage.",
} as const;

export type ComposerAccessoryKind =
  | "connectors"
  | "capabilities"
  | "coach"
  | "tools"
  | "attach"
  | "designSetup";

export const DIRECTOR_COMPOSER_ACCESSORY_HINTS: Record<ComposerAccessoryKind, string> = {
  connectors: "Connector lanes your fleet can orchestrate through Director",
  capabilities: "Tap a skill — example prompt lands in the composer",
  coach: "Route this thread through one agent's memory and tools",
  tools: "Abilities currently armed for the coached agent",
  attach: "Documents, fleet context rules, or playbook instructions",
  designSetup:
    "Company blurb, style notes, and brand assets — merged into design.md before every render",
};

export const DIRECTOR_COMPOSER_CONTEXT = {
  coachingPrefix: "Coaching",
  clearCoachLabel: "Return to fleet-only mode",
  closePanelLabel: "Close composer panel",
  sendHint: "Enter to send · Shift+Enter for new line",
  toolbarLabel: "Composer tools",
} as const;

/** User-facing UI generation — Wireline-branded (provider is an implementation detail). */
export const WIRELINE_DESIGN_UI = {
  modelLabel: "Wireline Design",
  badgeLabel: "Wireline Design",
  designModeToggleLabel: "Design",
  designModeBetaLabel: "BETA",
  designModeToggleHint:
    "Wireline Design mode — every message builds UI screens until you turn this off. Fleet chat stays separate when Design is off.",
  designModePlaceholder:
    "Describe the screen, landing page, or app flow to design — e.g. mobile onboarding for a meditation app…",
  designModeContextLabel: "Wireline Design",
  clearDesignModeLabel: "Exit design mode",
  brandingToggleLabel: "Account branding",
  brandingToggleHint:
    "When on, Wireline Design pulls your Admin → Branding kit (name, color, logo) into design.md before rendering.",
  brandingToggleEmptyHint: "Set branding in Admin to enable account kit for design renders.",
  designSystemSetupLabel: "Setup",
  designSystemSetupShortLabel: "Setup",
  designSystemSetupTitle: "Set up your design system",
  designSystemSetupHint:
    "Save company context and brand assets once — Wireline Design merges them into every design.md brief.",
  designSystemSetupBlurbLabel: "Company name & blurb",
  designSystemSetupBlurbPlaceholder:
    "Mission Impastabowl — fast-casual Italian bowls in Austin. Warm, playful, neighborhood energy.",
  designSystemSetupNotesLabel: "Any other notes?",
  designSystemSetupNotesPlaceholder:
    "Palette (#E85D04 terracotta), Fraunces headlines, no stock food photography…",
  designSystemSetupAssetsLabel: "Logos, fonts & CSS",
  designSystemSetupAssetsHint: "PNG, SVG, WOFF2, or CSS — up to 2 MB each",
  designSystemSetupSaveLabel: "Save",
  designSystemSetupSavingLabel: "Saving…",
  designSystemSetupConfiguredLabel: "Design system configured",
  designSystemSetupEmptyNudge:
    "Tip: open Setup to save your company blurb and brand assets before your first render.",
  designSystemSetupUploadLabel: "Upload asset",
  designSystemSetupRemoveAssetLabel: "Remove asset",
  deviceChromeLabel: "Live preview",
  loadingPhases: [
    "Composing layout…",
    "Rendering screen…",
    "Polishing typography…",
    "Applying brand tokens…",
    "Packaging preview…",
  ],
  /** Design Studio (LLM pipeline) — shown when Stitch pixel render is off. */
  studioLoadingPhases: [
    "Opus — envisioning your tailored design…",
    "Opus — writing your design brief…",
    "Sonnet — drafting your page structure…",
    "Opus — critiquing and polishing your page…",
    "Opus — writing your preview summary…",
    "Packaging your live preview…",
  ],
  /** ~30s × 10 phases ≈ 5 min ceiling — rotates while the full pass-1 pipeline runs. */
  studioLoadingPhaseIntervalMs: 30_000,
  studioLoadingHint:
    "Full first preview usually finishes in 2–3 minutes. Refine anything in chat after that.",
  designStudioReasoning: "Spectrum Desk — Opus prep, Sonnet draft, Opus finish",
  loadingHint:
    "Wireline Design typically takes 3–5 minutes end-to-end (compose + package). Stay on this tab.",
  exportBlurb:
    "Production HTML/CSS — export to Figma, React, GitHub PR, or Canva for marketing handoff.",
  exportFigmaLabel: "Export to Figma",
  exportReactLabel: "Export React + Tailwind",
  exportGithubPrLabel: "Create GitHub PR",
  exportCanvaLabel: "Send to Canva",
  exportCanvaHint: "Marketing creative handoff — not product UI.",
  connectFigmaLabel: "Connect Figma",
  connectCanvaLabel: "Connect Canva",
  connectGithubLabel: "Connect GitHub",
  brandKitTitle: "Set up brand kit",
  importFigmaLabel: "Import from Figma file",
  importWebsiteLabel: "Import from website URL",
  importFigmaPlaceholder: "https://www.figma.com/design/… or file key",
  importWebsitePlaceholder: "https://yourcompany.com",
  previewPageTitle: "Design preview",
  previewPageBackLabel: "Back to chat",
  previewTabLabel: "Preview",
  screenshotTabLabel: "Screenshot",
  codeTabLabel: "Code",
  codeSourceFileName: "index.html",
  copyCodeLabel: "Copy code",
  copiedLabel: "Copied",
  codeLoadingLabel: "Loading source…",
  codeErrorLabel: "Couldn't load source — download the HTML from Export instead.",
  codeRetryLabel: "Retry",
  expandLabel: "Open full screen",
  previewTeaserTitle: "Design ready",
  previewTeaserBody:
    "Open the full-screen preview to inspect layout, export HTML, or iterate in chat.",
  previewTeaserAction: "Open preview",
  previewSideEntryLabel: "Design preview",
  fallbackCopy: "Preview is in your artifacts panel — open HTML or PNG from the thread header.",
  failReply: [
    "I couldn't finish this design render in time.",
    "",
    "Your message is saved — try the same prompt again in a minute, or ask for a smaller scope (e.g. hero section only).",
    "",
    "If it keeps failing, check that UI generation is enabled for your workspace or contact support.",
  ].join("\n"),
  packagingPendingReply: [
    "Your screen is composed in Wireline Design — packaging preview now.",
    "",
    "This page will update automatically when packaging completes (usually under a minute).",
    "",
    "You can also open **Design preview** from the thread header once it's ready.",
  ].join("\n"),
  chatFallbackReasoning:
    "Wireline Design live render unavailable — drafting HTML prototype in chat",
} as const;

/** @deprecated Import WIRELINE_DESIGN_UI — Stitch was the retired Google integration name. */
export const WIRELINE_STITCH_UI = WIRELINE_DESIGN_UI;

export const WL_APP_CLASSES = {
  /** Desktop editorial subtitle under TopBar — operator context */
  pageContext: "wl-page-context font-serif tracking-tight",
  /** Editorial left rail on workspace / route headers */
  pageContextAccent: "wl-page-context-accent",
  workspaceEyebrow:
    "wl-workspace-eyebrow tracking-widest uppercase text-[9px] text-muted-foreground",
  workspaceTitle: "wl-workspace-title font-bold tracking-tight text-3xl",
  /** 11px supporting copy — blurbs, hints, secondary lines */
  bodyCaption: "wl-body-caption text-xs text-muted-foreground",
  inlineEmpty: "wl-inline-empty",
  inlineEmptyLabel: "wl-inline-empty__label",
  /** Director / chat primary surface */
  missionCanvas:
    "wl-mission-canvas bg-gradient-to-b from-paper/40 to-paper/85 dark:from-velvet/20 dark:to-velvet/45",
  settingsPanel:
    "wl-panel-elevated border border-border/80 rounded-lg p-6 space-y-6 mt-8 shadow-sm transition-all duration-300 focus-within:shadow-md",
  settingsIcon:
    "w-10 h-10 rounded-md bg-brand flex items-center justify-center text-primary-foreground shrink-0 shadow-sm shadow-brand/20",
  settingsRow:
    "wl-panel border border-border/70 rounded-md p-4 transition-all duration-200 hover:border-brand/30 hover:bg-brand/5 hover:translate-x-0.5",
  successReveal:
    "rounded-md bg-brand/10 border border-brand/35 p-4 space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300",
  statusActive: "bg-brand/15 text-brand border-brand/30",
  statusOk: "bg-brand/10 text-brand border-brand/20",
  statusPending: "bg-brand/8 text-brand/90 border-brand/25",
  statusDead: "bg-destructive/10 text-destructive border-destructive/30",
  /** Executed approval / success — signal green, used sparingly */
  statusSuccess: "wl-status-success transition-all duration-200",
  textSuccess: "wl-text-success",
  pulseLive: "wl-pulse-live",
  modalSurface: "wl-modal-surface transition-all duration-300 ease-out",
  /** Framed empty / insight stat — elevated panel without aurora chrome */
  panelFrame:
    "relative rounded-md wl-panel-elevated border border-border overflow-hidden transition-all duration-300 hover:shadow-md hover:border-border-hover",
  signalOrbFrame: WL_SIGNAL_CLASSES.signalOrbFrame,
  signalOrbRefined: WL_SIGNAL_CLASSES.signalOrbRefined,
  emptyStateSignal: WL_SIGNAL_CLASSES.emptyStateSignal,
  proTitle: "wl-pro-title font-bold tracking-tight",
  proEyebrow: "wl-pro-eyebrow uppercase tracking-widest text-[9px]",
  insightStatCard:
    "relative rounded-md wl-panel border border-black/8 overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm",
  /** Grouped icon controls (theme, shortcuts) on cream workspace header */
  chromeToolbar: "wl-chrome-toolbar",
  /** Compact mobile route strip under TopBar */
  mobileContextBar: "wl-mobile-context-bar",
  /** Editorial left rail on mobile page context */
  mobileContextAccent: "wl-mobile-context-accent",
  /** Segmented control track (day range, channel pickers) */
  segmentStrip: "app-segment-strip bg-muted/40 p-0.5 rounded-lg border border-border/40",
  /** System banners (trial, verify email) */
  banner: "wl-banner transition-all duration-300",
  /** Light paper / dark velvet elevated surfaces (bubbles, cards, composer) */
  surfaceVelvet: "bg-paper/90 dark:bg-velvet/60 backdrop-blur-md",
  surfaceVelvetStrong: "bg-paper/95 dark:bg-velvet/80 backdrop-blur-lg",
  /** TopBar / inverse chrome icon buttons */
  chromeInverseHover: "chrome-inverse-hover hover:bg-white/10 transition-colors duration-150",
  bannerInfo: "wl-banner wl-banner--info",
  bannerWarn: "wl-banner wl-banner--warn",
  bannerCritical: "wl-banner wl-banner--critical",
  bannerCta: "app-micro-cta",
} as const;

export type DirectorStreamPhase = "connecting" | "preparing" | "thinking" | "replying" | "done";

export const DIRECTOR_PHASE_COPY: Record<DirectorStreamPhase, { headline: string; sub: string }> = {
  connecting: {
    headline: "Opening fleet coach",
    sub: "Secure channel to your fleet wingman",
  },
  preparing: {
    headline: "Loading fleet context",
    sub: "Thread history · integrations · operator intent",
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
    id: "website-prototype",
    label: "Design a website with HTML I can copy",
    intent: "Sitemap + prototype in chat",
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
  { id: "code", label: "Code" },
  { id: "research", label: "Research" },
  { id: "crm", label: "CRM" },
  { id: "integrations", label: "Integrations" },
  { id: "creative", label: "Creative" },
] as const;

export const DIRECTOR_LOADING_COPY = {
  headline: "Opening fleet coach",
  sub: "Thread history · fleet context · integrations",
} as const;

export const DIRECTOR_EMPTY_HERO = {
  eyebrow: "Fleet coach",
  title: "Orchestrate your fleet from",
  titleAccent: "one console",
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

/** Director thread / session management copy */
export const DIRECTOR_SESSION_COPY = {
  applySaved: (label: string) => `${label} saved to agent — safe to clear thread`,
  applyAllLabel: "Apply all",
  applyAllProgress: (done: number, total: number) => `Applying ${done} of ${total}…`,
  applyAllSuccess: (n: number) =>
    n === 1 ? "1 agent update applied" : `${n} agent updates applied`,
  applyAllPartial: (applied: number, failed: number) =>
    `${applied} applied · ${failed} failed — retry remaining cards individually`,
  clearSuccess: "Thread cleared",
  clearSuccessDetail: "Chat and artifacts removed. Applied agent settings were kept.",
  pendingApprovals: (n: number) => (n === 1 ? "1 approval pending" : `${n} approvals pending`),
  sessionHint:
    "Applied agent settings persist on each agent. Unapproved cards and chat history are removed when you clear.",
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
