/**
 * Painter — Wireline Design studio persona copy (lives on /design, not /chat).
 */
import { WIRELINE_STITCH_UI } from "./wireline-director-design";

export const WIRELINE_PAINTER_UI = {
  navLabel: "Design",
  betaLabel: "BETA",
  personaName: "Painter",
  personaTagline: "Wireline Design studio",
  pageSubtitle: "Pages, flows, and live prototypes — click through your renders",
  composerPlaceholder:
    "Describe the screen or site to paint — e.g. mobile booking page for a cleaning company with terracotta accents…",
  workingStatus: "Painter is rendering…",
  emptyTitle: "Paint your first screen",
  emptyBody:
    "Describe a landing page, onboarding flow, or app screen. Painter writes design.md, drafts HTML, and opens a live preview you can click through.",
  sendHint: "Enter to send · Shift+Enter for new line",
  previewEmptyTitle: "Preview will appear here",
  previewEmptyBody: "Send a prompt — your live HTML prototype fills this panel when Painter finishes.",
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
