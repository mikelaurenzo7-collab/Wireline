/**
 * Wireline Mono — canonical design vision for web, extension, MCP, and native.
 * Contracts in tests/wireline-design-vision-contract.test.ts and design:check
 * enforce these decisions. Class constants live in wireline-design-system.ts.
 */

export const WIRELINE_DESIGN_VISION = {
  system: "Wireline Mono",
  tone: ["calm", "precise", "useful"] as const,
  references: ["ChatGPT composer clarity", "Cursor workbench density", "xAI declarative copy"],
  principles: [
    "Black is action. Gray is structure. Canvas is calm.",
    "One voice module, one composer dock, one elevation language.",
    "Centered marketing storytelling; left/task-first authenticated work.",
    "No decorative purple, glow, or off-palette marketing hues.",
    "44px minimum for primary touch targets; 2px focus-visible rings.",
  ],
  tokens: {
    canvas: "#F7F7F4",
    action: "#111111",
    actionPressed: "#000000",
    textTertiary: "#8A8A84",
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
} as const;

export type WirelineDesignVision = typeof WIRELINE_DESIGN_VISION;
