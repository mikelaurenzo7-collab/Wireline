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
    canvas: "#F7F6F3",
    action: "#2B5548",
    actionPressed: "#1E4038",
    textTertiary: "#A1A19B",
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
    defaultSurface: "chat-composer",
    agentSwitcher: "horizontal-bar",
    railWidthPx: 56,
    workspaceDepthParam: "view=workspace",
    minTouchTargetPx: 44,
  },
} as const;

export type WirelineDesignVision = typeof WIRELINE_DESIGN_VISION;
