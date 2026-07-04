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
    "One voice module, one composer dock, one elevation language.",
    "Centered marketing storytelling; left/task-first authenticated work.",
    "Instrument Serif carries big ideas; DM Sans carries work; Space Mono carries labels.",
    "No decorative purple, blue, or off-palette marketing hues.",
    "44px minimum for primary touch targets; 2px focus-visible rings.",
  ],
  tokens: {
    canvas: "#15130F",
    action: "#5BA98A",
    actionPressed: "#4B9276",
    textTertiary: "#8B867B",
  },
  utilities: [
    "wl-composer-dock",
    "wl-composer-dock__input",
    "wl-composer-dock__toolbar",
    "wl-chip-suggestion",
    "wl-panel",
    "wl-panel-elevated",
    "wl-composer-hero",
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
