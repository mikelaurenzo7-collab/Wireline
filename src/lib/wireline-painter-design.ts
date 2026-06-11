/**
 * Painter — Wireline Design studio persona copy (lives on /design, not /chat).
 */
import type { DirectorStarterPrompt } from "./wireline-director-design";
import { WIRELINE_STITCH_UI } from "./wireline-director-design";

/** Empty-state + preview panel chips — design-studio prompts only */
export const PAINTER_STARTER_PROMPTS: readonly DirectorStarterPrompt[] = [
  {
    id: "storefront",
    label: "AI-native Shopify storefront for a premium DTC brand",
    intent: "Store Generator",
  },
  {
    id: "collection",
    label: "High-converting collection page with product cards and filters",
    intent: "Commerce UX",
  },
  {
    id: "product-detail",
    label: "Luxury product page with variants, trust badges, and sticky checkout",
    intent: "PDP system",
  },
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

export const PAINTER_STARTER_PROMPTS_FEATURED_COUNT = 6;

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
  sub: "Thread history · brand profile · live preview · storefront generator",
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
  pageSubtitle: "Pages, flows, Shopify storefronts, and live prototypes — click through your renders",
  /** ≤390px header track — full subtitle truncates on small phones */
  pageSubtitleShort: "Studio",
  composerPlaceholder:
    "Describe the screen, site, or Shopify storefront to paint — e.g. premium DTC skincare store with editorial PDP and sticky checkout…",
  workingStatus: "Painter is rendering…",
  emptyTitle: "Paint your first screen or store",
  emptyBody:
    "Describe a landing page, onboarding flow, app screen, or Shopify storefront. Painter writes design.md, drafts HTML, and opens a live preview you can click through.",
  sendHint: "Enter to send · Shift+Enter for new line",
  previewEmptyTitle: "Live preview",
  previewEmptyBody:
    "Your click-through HTML prototype or storefront concept renders here when Painter finishes.",
  clearThreadLabel: "Clear thread",
  mobileChatTab: "Chat",
  mobilePreviewTab: "Preview",
  modelLabel: "Painter",
  badgeLabel: "Wireline Design",
  reasoningLabel: WIRELINE_STITCH_UI.designStudioReasoning,
  handoffIntro:
    "That's a **design studio** job — **Painter** owns Wireline Design pages, flows, and storefronts.",
  handoffLogosNote: "Logos, brand packs, and store operations stay connected to the same Wireline workspace.",
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
