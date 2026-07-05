/**
 * Wireline Letterpress — canonical design vision for web, extension, MCP, and native.
 * Contracts: tests/wireline-design-vision-contract.test.ts (manifest),
 * tests/studio-canvas-vision-contract.test.ts (studio IA), design:check.
 * Studio behavioral invariants live in studio-canvas-contract.ts.
 */

export const WIRELINE_DESIGN_VISION = {
  system: "Wireline Letterpress",
  tone: ["calm", "precise", "useful"] as const,
  references: ["ChatGPT composer clarity", "Cursor workbench density", "xAI declarative copy"],
  principles: [
    "Forest green is action. Ink is structure. Warm paper is calm.",
    "Copper is the wire — it carries the load, never decorates.",
    "One voice module, one composer dock, one elevation language.",
    "Centered marketing storytelling; left/task-first authenticated work.",
    "Instrument Serif carries big ideas; DM Sans carries work; Space Mono carries labels.",
    "No decorative purple, blue, or off-palette marketing hues.",
    "44px minimum for primary touch targets; 2px focus-visible rings, 4px halo optional.",
    "Letterpress depth: inset highlights on surfaces, restrained glow only on active affordances.",
  ],
  tokens: {
    canvas: "#15130F",
    canvasDeeper: "#0F0D0A",
    action: "#5BA98A",
    actionHover: "#6CB89A",
    actionPressed: "#4B9276",
    accent: "#D4823F",
    accentHover: "#E19452",
    accentPressed: "#BC6C30",
    textTertiary: "#8B867B",
  },
  motion: {
    durations: ["instant 60ms", "fast 120ms", "standard 200ms", "slow 300ms", "deliberate 440ms"],
    easings: ["standard", "emphasized", "spring", "wireline", "decelerate", "accelerate"],
    pressScale: 0.985,
    liftPx: 1,
  },
  utilities: {
    surface: [
      "wl-paper",
      "wl-paper-elevated",
      "wl-letterpress",
      "wl-letterpress-raised",
      "wl-letterpress-recessed",
    ],
    feedback: [
      "wl-focus-ring",
      "wl-focus-ring-halo",
      "wl-focus-ring-wire",
      "wl-glow-primary",
      "wl-glow-wire",
    ],
    motion: [
      "wl-press",
      "wl-motion-spring",
      "wl-motion-wireline",
      "wl-transition-press",
      "wl-reveal",
    ],
    chips: [
      "wl-chip",
      "wl-chip--success",
      "wl-chip--warning",
      "wl-chip--error",
      "wl-chip--info",
      "wl-chip--primary",
      "wl-chip--wire",
    ],
    layout: [
      "wl-metric-tile",
      "wl-empty",
      "wl-skeleton",
      "wl-divider",
      "wl-divider-wire",
      "wl-press-highlight",
    ],
    voice: [
      "wl-eyebrow",
      "wl-eyebrow--primary",
      "wl-eyebrow--muted",
      "wl-eyebrow--no-rule",
      "wl-display-mark",
    ],
  },
  legacyAliases: [
    "wl-composer-dock",
    "wl-composer-dock__input",
    "wl-composer-dock__toolbar",
    "wl-chip-suggestion",
    "wl-panel",
    "wl-panel-elevated",
    "wl-composer-hero",
    "wl-eyebrow--wired--app",
    "wl-rail-agent-link",
    "wl-overview-greeting",
    "wl-operate-surface",
  ],
  voiceModules: ["MARKETING_VOICE", "WORKSPACE_VOICE", "PRODUCT_POSTURE"],
  studioCanvas: {
    // Claude Design Agent Studio: a route-correct workspace rail, a compact
    // context chrome (breadcrumb, readiness, test/deploy), and a split pane:
    // 380px-ish builder chat on the left + spatial Agent Canvas cards on the
    // right. Agent switching belongs in the Assistants directory / Overview
    // preview, not as a second roster strip inside Studio.
    defaultSurface: "chat-plus-canvas",
    canvasSurface: "spatial-cards",
    agentSwitcher: "context-chrome",
    railWidthPx: 236,
    workspaceDepthParam: "view=workspace",
    minTouchTargetPx: 44,
  },
} as const;

export type WirelineDesignVision = typeof WIRELINE_DESIGN_VISION;
