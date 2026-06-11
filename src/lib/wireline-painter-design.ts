/**
 * Painter — Wireline Design studio persona copy (lives on /design, not /chat).
 */
import type { DirectorStarterPrompt } from "./wireline-director-design";
import { WIRELINE_STITCH_UI } from "./wireline-director-design";

/** Empty-state + preview panel chips — design-studio prompts only */
export const PAINTER_STARTER_PROMPTS: readonly DirectorStarterPrompt[] = [
  {
    id: "landing",
    label: "Mobile-first landing page for a local service business",
    intent: "Marketing site with hero, proof, and CTA",
  },
  {
    id: "onboarding",
    label: "Three-step onboarding flow with progress and validation",
    intent: "Product signup journey",
  },
  {
    id: "dashboard",
    label: "Ops dashboard with KPI cards and live activity feed",
    intent: "B2B app screen",
  },
  {
    id: "pricing",
    label: "Pricing page with three tiers and feature comparison",
    intent: "Conversion-focused layout",
  },
  {
    id: "booking",
    label: "Appointment booking flow with calendar and confirmation",
    intent: "Scheduling UX",
  },
  {
    id: "support",
    label: "Help center with search, categories, and article layout",
    intent: "Support portal",
  },
] as const;

export const PAINTER_STARTER_PROMPTS_FEATURED_COUNT = 4;

export const PAINTER_EMPTY_COPY = {
  starterEyebrow: "Paint from a template",
  previewStarterEyebrow: "Or try a prompt",
} as const;

/** Header export-lane chips — Figma / Canva / GitHub status + one-click connect */
export const PAINTER_INTEGRATION_RAIL = {
  ariaLabel: "Design export lanes",
  eyebrow: "Lanes",
  connectedHint: "Connected — ready in Export",
  connectPrefix: "Connect",
} as const;

export const PAINTER_LOADING_COPY = {
  headline: "Opening design studio",
  sub: "Thread history · brand profile · live preview",
} as const;

/** Inline load-failure state — paired with a Retry action, never toast-only */
export const PAINTER_LOAD_FAILED_COPY = {
  eyebrow: "Studio unavailable",
  title: "Couldn't load your design thread",
  body: "Your renders are safe — the thread just didn't come back. Check your connection and retry.",
  retryLabel: "Retry",
} as const;

export const WIRELINE_PAINTER_UI = {
  navLabel: "Design",
  betaLabel: "BETA",
  personaName: "Painter",
  personaTagline: "Wireline Design studio",
  pageSubtitle: "Pages, flows, and live prototypes — click through your renders",
  /** ≤390px header track — full subtitle truncates on small phones */
  pageSubtitleShort: "Studio",
  composerPlaceholder:
    "Describe the screen or site to paint — e.g. mobile booking page for a cleaning company with terracotta accents…",
  workingStatus: "Painter is rendering…",
  emptyTitle: "Paint your first screen",
  emptyBody:
    "Describe a landing page, onboarding flow, or app screen. Painter writes design.md, drafts HTML, and opens a live preview you can click through.",
  sendHint: "Enter to send · Shift+Enter for new line",
  previewEmptyTitle: "Live preview",
  previewEmptyBody:
    "Your click-through HTML prototype renders here when Painter finishes a screen.",
  clearThreadLabel: "Clear thread",
  mobileChatTab: "Chat",
  mobilePreviewTab: "Preview",
  modelLabel: "Painter",
  badgeLabel: "Wireline Design",
  reasoningLabel: WIRELINE_STITCH_UI.designStudioReasoning,
  handoffIntro:
    "That's a **design studio** job — **Painter** owns Wireline Design pages and flows.",
  handoffLogosNote: "Logos and brand packs stay here in Chat with Director.",
  handoffCta: "Open in Design",
  buildHandoffReply(prompt: string): string {
    const url = `/design?prompt=${encodeURIComponent(prompt.trim().slice(0, 2000))}`;
    return [
      this.handoffIntro,
      "",
      `[${this.handoffCta} →](${url})`,
      "",
      this.handoffLogosNote,
    ].join("\n");
  },
} as const;
