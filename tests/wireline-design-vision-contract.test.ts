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

describe("BotBound design vision", () => {
  it("exports one canonical design system with semantic visual vocabulary", () => {
    expect(WL_VISION).toBe(WIRELINE_DESIGN_VISION);
    expect(WIRELINE_DESIGN_VISION.system).toBe("BotBound Design System");
    expect(WIRELINE_DESIGN_VISION.naming).toEqual({
      designSystem: "BotBound Design System",
      rule: "BotBound Design System is the only customer-facing system name. Describe visual decisions by function: light, dark, canvas, surface, raised, recessed, ink, violet, wire, signal, and status. Do not create named sub-systems, material themes, or palette codenames.",
    });
    expect(WIRELINE_DESIGN_VISION.appearance).toEqual({
      default: "light",
      modes: ["light", "dark", "system"],
      lightCanvas: "#FFFFFF",
      darkCanvas: "#0A0A0E",
      rule: "Light is the first-visit appearance. Saved customer preference always wins. Light and dark are appearances of the same BotBound Design System, never separate visual systems.",
    });
    expect(WIRELINE_DESIGN_VISION.shell).toEqual({
      componentOwner: "src/components/WorkspaceShell.tsx",
      styleOwner: "src/styles/workspace-shell.css",
      hooks: [
        "wl-shell-rail",
        "wl-shell-nav-item",
        "wl-shell-bot-context",
        "wl-shell-account",
        "wl-shell-dock",
        "wl-shell-more-link",
      ],
      rule: "Mounted authenticated chrome uses only canonical wl-shell-* hooks. wl-rail-* aliases are migration-only and may not be composed into WorkspaceShell.",
    });
    expect(WIRELINE_DESIGN_VISION.tokens.action).toBe("#A78BFA");
    expect(WIRELINE_DESIGN_VISION.principles).toContain(
      "Warm off-white is the first-visit default; near-black dark remains a first-class appearance.",
    );
    expect(WIRELINE_DESIGN_VISION.principles).toContain(
      "There is one BotBound visual language across public, authenticated, extension, MCP, and native surfaces.",
    );
    expect(WIRELINE_DESIGN_VISION.principles).toContain(
      "Visual vocabulary is semantic, not thematic: light, dark, canvas, surface, elevation, ink, action, wire, signal, and status.",
    );
    expect(WIRELINE_DESIGN_VISION.principles).toContain(
      "BotBound is mixed case whenever the brand name is visibly presented; lowercase wireline remains reserved for stable technical data such as URLs, identifiers, events, APIs, and persistence keys during migration.",
    );
    expect(WIRELINE_DESIGN_VISION.principles).toContain(
      "The phone-Bot mark and BotBound wordmark keep one optical ratio and scale only as a complete lockup.",
    );
    expect(WIRELINE_DESIGN_VISION.principles).toContain(
      "Authenticated desktop panels may fold and resize, but their state must be obvious, persistent, keyboard operable, and never change the user's information hierarchy silently.",
    );
    expect(WIRELINE_DESIGN_VISION.utilities).toEqual(
      expect.objectContaining({
        surface: expect.arrayContaining(["wl-panel", "wl-panel-elevated"]),
        feedback: expect.arrayContaining(["wl-focus-ring"]),
        layout: expect.arrayContaining(["wl-metric-tile", "wl-empty", "wl-skeleton"]),
        voice: expect.arrayContaining(["wl-eyebrow", "wl-display-mark"]),
        chips: expect.arrayContaining(["wl-chip", "wl-chip--success", "wl-chip--primary"]),
      }),
    );
    expect(WIRELINE_DESIGN_VISION.legacyAliases).toContain("wl-paper");
    expect(WIRELINE_DESIGN_VISION.legacyAliases).toContain("wl-letterpress");
    expect(WIRELINE_DESIGN_VISION.legacyAliases).toContain("wl-composer-dock");
    expect(WIRELINE_DESIGN_VISION.legacyAliases).toContain("wl-rail-link");
    expect(WIRELINE_DESIGN_VISION.legacyAliases).toContain("wl-rail-agent-link");
    expect(WIRELINE_DESIGN_VISION.retiredDesignNames).toEqual(
      expect.arrayContaining(["Letterpress", "Obsidian", "Aurora", "Paper"]),
    );
  });

  it("keeps old themed names out of canonical system declarations", () => {
    expect(read("src/lib/wireline-design-vision.ts")).not.toMatch(
      /system:\s*"(?:WIRELINE|BotBound) (?:Letterpress|Obsidian|Aurora|Paper)"/,
    );
    expect(read("src/lib/surface-contract.ts")).not.toMatch(
      /system:\s*"(?:WIRELINE|BotBound) (?:Letterpress|Obsidian|Aurora|Paper)"/,
    );
    expect(read("src/constants/brand-colors.ts")).not.toMatch(
      /Wireline Letterpress|obsidian material|Paper appearance/i,
    );
  });

  it("defines shared primitives across the canonical system stylesheets", () => {
    const designSystemCss = read("src/styles/design-system.css");
    const polishCss = read("src/styles/letterpress-polish.css");
    const sharedCss = `${designSystemCss}\n${polishCss}`;

    for (const utility of WIRELINE_DESIGN_VISION.legacyAliases) {
      if (
        utility.startsWith("wl-composer") ||
        utility.startsWith("wl-panel") ||
        utility.startsWith("wl-chip")
      ) {
        expect(sharedCss).toContain(`.${utility}`);
      }
    }
    for (const group of Object.values(WIRELINE_DESIGN_VISION.utilities)) {
      for (const utility of group) {
        expect(sharedCss).toContain(`.${utility}`);
      }
    }
  });

  it("exposes the refined motion vocabulary in the vision manifest", () => {
    expect(WIRELINE_DESIGN_VISION.motion.durations).toContain("deliberate 440ms");
    expect(WIRELINE_DESIGN_VISION.motion.easings).toContain("wireline");
    expect(WIRELINE_DESIGN_VISION.motion.easings).toContain("spring");
    expect(WIRELINE_DESIGN_VISION.motion.pressScale).toBe(0.985);
  });

  it("defines authenticated BotBound signature utilities without duplicating selection ownership", () => {
    const appSignature = read("src/styles/wireline-app-signature.css");
    expect(appSignature).toContain(".wl-workspace-shell::before");
    expect(appSignature).toContain(".wl-workspace-content .wl-paper::before");
    expect(appSignature).toContain(".wl-eyebrow.wl-eyebrow--wired--app");
    expect(appSignature).toContain(".wl-overview-greeting::after");
    expect(appSignature).toContain("--wireline-color-action-secondary-default");
    expect(appSignature).not.toContain('.wl-rail-agent-link[aria-current="page"]::before');
    expect(read("apps/browser-extension/panel/app-signature.css")).toContain(".wordmark::before");
    expect(read("ios/WirelineShared/WirelineBrand.swift")).toContain("static let wire");
  });

  it("centralizes workspace page intros, shell ownership, and adjustable-pane behavior", () => {
    const shellComponent = read(WIRELINE_DESIGN_VISION.shell.componentOwner);
    const shellStyles = read(WIRELINE_DESIGN_VISION.shell.styleOwner);

    expect(read("src/pages/EmailPage.tsx")).toContain("WorkspacePageIntro");
    expect(read("src/pages/TemplatesPage.tsx")).toContain("WorkspacePageIntro");
    expect(read("src/pages/ClientAppsPage.tsx")).toContain("WorkspacePageIntro");
    expect(existsSync("src/hooks/useLivePresence.ts")).toBe(false);
    expect(existsSync("src/pages/OverviewPage.tsx")).toBe(false);
    expect(shellComponent).toContain("WorkspaceResizablePanel");
    expect(read("src/components/CallLogsClaude.tsx")).toContain("WorkspaceResizablePanel");
    expect(shellComponent).not.toContain('className="wl-rail-link');
    expect(shellComponent).not.toContain('className="wl-rail-agent-link');
    for (const hook of WIRELINE_DESIGN_VISION.shell.hooks) {
      expect(shellComponent + shellStyles).toContain(hook);
    }
    expect(shellStyles).toContain('.wl-shell-bot-context[data-wireline-bot-selected="true"]');
  });

  it("maps tertiary text to the generated token in foundation runtime", () => {
    const foundation = read("src/styles/foundation.css");
    expect(foundation).toContain("--wl-text-tertiary: var(--wireline-color-text-tertiary)");
    expect(read("src/styles/tokens.generated.css")).toContain(
      `--wireline-color-text-tertiary: ${WIRELINE_DESIGN_VISION.tokens.textTertiary}`,
    );
  });

  it("wires composer class constants to CSS utilities", () => {
    expect(WL_COMPOSER_CLASSES.composerDock).toContain("wl-composer-dock");
    expect(WL_COMPOSER_CLASSES.starterChip).toContain("wl-chip-suggestion");
  });

  it("documents Studio routing and adjustable rail dimensions via the shared contract", () => {
    const contract = read("src/lib/studio-canvas-contract.ts");
    expect(contract).toContain("STUDIO_CANVAS_VISION");
    expect(contract).toContain("STUDIO_CANVAS_FORBIDDEN");
    expect(contract).toContain("STUDIO_CANVAS_REQUIRED");
    expect(WIRELINE_DESIGN_VISION.studioCanvas).toEqual(
      expect.objectContaining({
        defaultSurface: "chat-plus-canvas",
        canvasSurface: "browser-workbench",
        agentSwitcher: "context-chrome",
        railBehavior: "resizable-and-collapsible",
        railWidthPx: 232,
        railMinPx: 208,
        railMaxPx: 320,
        railCollapsedPx: 68,
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
