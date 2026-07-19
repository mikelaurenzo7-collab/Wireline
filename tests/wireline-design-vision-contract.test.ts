import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MARKETING_VOICE } from "../src/lib/product-copy";
import { WL_COMPOSER_CLASSES, WL_VISION } from "../src/lib/wireline-design-system";
import { WIRELINE_DESIGN_VISION } from "../src/lib/wireline-design-vision";
import { buildWirelineMcpWidgetCss } from "../src/lib/wireline-mcp-widget-styles";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const AUTHENTICATED_SURFACE_GLOBS = [
  "src/pages/OverviewPage.tsx",
  "src/pages/SettingsPage.tsx",
  "src/pages/EmailPage.tsx",
  "src/pages/TemplatesPage.tsx",
  "src/pages/ClientAppsPage.tsx",
  "src/pages/ConnectionsPage.tsx",
  "src/components/WorkspaceShell.tsx",
  "src/components/CreateAgentDialog.tsx",
  "src/components/StudioWorkroom.tsx",
  "src/components/CallLogsClaude.tsx",
];

const OLD_PALETTE = /#5D3FD3|#451EBB|#C77DFF|#F8F9FF|#EFF4FF|#E5EEFF|rgba\(93,\s*63,\s*211/i;

describe("Wireline Letterpress design vision", () => {
  it("exports a single canonical vision manifest", () => {
    expect(WL_VISION).toBe(WIRELINE_DESIGN_VISION);
    expect(WIRELINE_DESIGN_VISION.system).toBe("Wireline Letterpress");
    expect(WIRELINE_DESIGN_VISION.tokens.action).toBe("#A78BFA");
    expect(WIRELINE_DESIGN_VISION.utilities).toEqual(
      expect.objectContaining({
        surface: expect.arrayContaining(["wl-paper", "wl-paper-elevated"]),
        feedback: expect.arrayContaining(["wl-focus-ring"]),
        layout: expect.arrayContaining(["wl-metric-tile", "wl-empty", "wl-skeleton"]),
        voice: expect.arrayContaining(["wl-eyebrow", "wl-display-mark"]),
        chips: expect.arrayContaining(["wl-chip", "wl-chip--success", "wl-chip--primary"]),
      }),
    );
    expect(WIRELINE_DESIGN_VISION.legacyAliases).toContain("wl-panel-elevated");
    expect(WIRELINE_DESIGN_VISION.legacyAliases).toContain("wl-composer-dock");
  });

  it("defines panel and composer primitives in the design system stylesheet", () => {
    const designSystemCss = read("src/styles/design-system.css");
    for (const utility of WIRELINE_DESIGN_VISION.legacyAliases) {
      if (
        utility.startsWith("wl-composer") ||
        utility.startsWith("wl-panel") ||
        utility.startsWith("wl-chip")
      ) {
        expect(designSystemCss).toContain(`.${utility}`);
      }
    }
    const polishCss = read("src/styles/letterpress-polish.css");
    for (const group of Object.values(WIRELINE_DESIGN_VISION.utilities)) {
      for (const utility of group) {
        expect(polishCss).toContain(`.${utility}`);
      }
    }
  });

  it("exposes the refined motion vocabulary in the vision manifest", () => {
    expect(WIRELINE_DESIGN_VISION.motion.durations).toContain("deliberate 440ms");
    expect(WIRELINE_DESIGN_VISION.motion.easings).toContain("wireline");
    expect(WIRELINE_DESIGN_VISION.motion.easings).toContain("spring");
    expect(WIRELINE_DESIGN_VISION.motion.pressScale).toBe(0.985);
  });

  it("defines authenticated Letterpress signature utilities", () => {
    const appSignature = read("src/styles/wireline-app-signature.css");
    expect(appSignature).toContain(".wl-rail-agent-link");
    expect(appSignature).toContain(".wl-operate-surface .studio-card");
    expect(appSignature).toContain("--wireline-color-action-secondary-default");
    expect(read("apps/browser-extension/panel/app-signature.css")).toContain(".wordmark::before");
    expect(read("ios/Wireline/Theme/WirelineTheme.swift")).toContain("static let wire");
  });

  it("centralizes workspace page intros and presence hooks", () => {
    expect(read("src/pages/EmailPage.tsx")).toContain("WorkspacePageIntro");
    expect(read("src/pages/TemplatesPage.tsx")).toContain("WorkspacePageIntro");
    expect(read("src/pages/ClientAppsPage.tsx")).toContain("WorkspacePageIntro");
    expect(read("src/hooks/useLivePresence.ts")).toContain("usePresenceSignals");
  });

  it("maps tertiary text to the generated token in foundation runtime", () => {
    const foundation = read("src/styles/foundation.css");
    expect(foundation).toContain("--wl-text-tertiary: var(--wireline-color-text-tertiary)");
    expect(read("src/styles/tokens.generated.css")).toContain(
      "--wireline-color-text-tertiary: #8B87A0",
    );
  });

  it("wires composer class constants to CSS utilities", () => {
    expect(WL_COMPOSER_CLASSES.composerDock).toContain("wl-composer-dock");
    expect(WL_COMPOSER_CLASSES.starterChip).toContain("wl-chip-suggestion");
  });

  it("documents studio canvas routing via the shared contract module", () => {
    const contract = read("src/lib/studio-canvas-contract.ts");
    expect(contract).toContain("STUDIO_CANVAS_VISION");
    expect(contract).toContain("STUDIO_CANVAS_FORBIDDEN");
    expect(contract).toContain("STUDIO_CANVAS_REQUIRED");
    expect(WIRELINE_DESIGN_VISION.studioCanvas).toEqual(
      expect.objectContaining({
        defaultSurface: "chat-plus-canvas",
        canvasSurface: "spatial-cards",
        agentSwitcher: "context-chrome",
        railWidthPx: 236,
        workspaceDepthParam: "view=workspace",
        minTouchTargetPx: 44,
      }),
    );
  });

  it("keeps authenticated surfaces free of retired purple palette literals", () => {
    for (const path of AUTHENTICATED_SURFACE_GLOBS) {
      expect(existsSync(resolve(root, path))).toBe(true);
      expect(read(path)).not.toMatch(OLD_PALETTE);
    }
  });

  it("aligns extension hero copy with shared marketing voice", () => {
    const panel = read("apps/browser-extension/panel/index.html");
    expect(panel).toContain(MARKETING_VOICE.extensionLead);
  });

  it("keeps MCP widgets on mono canvas, tertiary hints, and composer shell", () => {
    const css = buildWirelineMcpWidgetCss();
    expect(css).toContain(`--wl-canvas: ${WIRELINE_DESIGN_VISION.tokens.canvas}`);
    expect(css).toContain(`--wl-tertiary: ${WIRELINE_DESIGN_VISION.tokens.textTertiary}`);
    expect(css).toContain(".composer");
  });
});
