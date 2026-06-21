import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { STITCH_CODE_SYSTEM, STITCH_DESIGN_SYSTEM, STITCH_SCREENS } from "./stitch-design-system";

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const exists = (path: string) => existsSync(resolve(root, path));

describe("Precision Operator Design MD contract", () => {
  it("pins the current Stitch project and source records", () => {
    expect(STITCH_DESIGN_SYSTEM.projectId).toBe("15464421841872665077");
    expect(STITCH_DESIGN_SYSTEM.title).toBe("Precision Operator");
    expect(exists(STITCH_DESIGN_SYSTEM.designSpec)).toBe(true);
    expect(exists(STITCH_DESIGN_SYSTEM.sourceManifest)).toBe(true);
    expect(exists(STITCH_DESIGN_SYSTEM.sourceDesignMd)).toBe(true);
    expect(read(STITCH_DESIGN_SYSTEM.sourceDesignMd)).toContain("page #F7F7F5");
  });

  it("uses the exact visible palette and geometry from the Design MD", () => {
    const css = read(STITCH_CODE_SYSTEM.tokens).toLowerCase();
    for (const value of [
      "--wl-page:#f7f7f5", "--wl-surface-base:#f9f9f7", "--wl-surface:#fff", "--wl-surface-subtle:#f4f4f2",
      "--wl-surface-container:#eeeeec", "--wl-surface-hover:#e8e8e6", "--wl-surface-variant:#e2e3e1",
      "--wl-ink:#1d1d1f", "--wl-muted:#6e6e73", "--wl-ink-soft:#414846", "--wl-line:#e5e5e2",
      "--wl-line-strong:#c1c8c4", "--wl-accent:#1a3c34", "--wl-accent-deep:#01261f",
      "--wl-accent-container:#c5eadf", "--wl-accent-fixed-dim:#aacec3", "--radius:.25rem",
      "--radius-lg:.5rem", "--radius-xl:.75rem",
    ]) expect(css).toContain(value);
  });

  it("enforces source typography without synthetic rendering", () => {
    const activeCss = [
      STITCH_CODE_SYSTEM.tokens, STITCH_CODE_SYSTEM.patterns, "src/styles/design-system.css",
      "src/styles/workspace-buttons.css", "src/styles/cta-readability.css", "src/styles/phone-agent-blueprint.css", "src/index.css",
    ].map(read).join("\n").toLowerCase();
    expect(activeCss).toContain("font-size:11px;font-weight:600;line-height:16px");
    expect(activeCss).toContain("font-size:14px;font-weight:400;line-height:20px");
    expect(activeCss).not.toContain("font-weight:650");
    expect(activeCss).not.toContain("font-smoothing");
    expect(activeCss).not.toContain("backdrop-filter");
  });

  it("maps every required workspace state and keeps personal use first-class", () => {
    expect(STITCH_SCREENS["/studio"].source).toBe("studio_agent_training");
    expect(STITCH_SCREENS["/agents"].states).toEqual(["agents_empty_state", "agents_loading_state", "agents_degraded_state"]);
    expect(STITCH_SCREENS["/knowledge"].states).toEqual(["knowledge_empty_state"]);
    expect(STITCH_SCREENS["/actions"].source).toBe("actions_permissions_connections");
    expect(STITCH_SCREENS["/ops"].states).toEqual(["live_handoffs_queue", "live_quality_review"]);
    expect(STITCH_SCREENS["/settings"].source).toBe("settings_workspace_admin");
    expect(read("src/App.tsx")).toContain('path="/for/personal" element={<VerticalLanding slug="personal" />}');
  });

  it("uses one active cascade and the fixed-fluid shell", () => {
    const main = read("src/main.tsx");
    const index = read("src/index.css");
    const shell = read(STITCH_CODE_SYSTEM.workspace);
    expect(main.indexOf('import "./styles/foundation.css";')).toBeGreaterThanOrEqual(0);
    expect(main.indexOf('import "./index.css";')).toBeGreaterThan(main.indexOf('import "./styles/foundation.css";'));
    for (const retired of ["monochrome-guard.css", "readability-guard.css", "stitch-geometry.css", "precision-operator-web.css", "precision-type.css"]) {
      expect(index).not.toContain(retired);
      expect(main).not.toContain(retired);
    }
    expect(shell).toContain("212px");
    expect(shell).toContain("max-w-[1680px]");
    expect(shell).toContain("min-h-16");
    expect(shell).toContain("lg:px-10");
    expect(shell).toContain("drawerOpen");
  });

  it("keeps the Agents screenshot states source-accurate", () => {
    const agents = read("src/pages/AgentsPage.tsx");
    expect(agents).toContain("Fleet management");
    expect(agents).toContain("Agent fleet connection degraded");
    expect(agents).toContain("No assistants configured");
    expect(agents).toContain("Create your first assistant to start handling interactions, automating tasks, and managing workflows.");
    expect(agents).toContain("Active assistants");
    expect(agents).toContain("System health");
    expect(agents).toContain("xl:grid-cols-4");
    expect(agents).toContain("h-[294px]");
    expect(agents).toContain("/actions?agent=");
    expect(agents).not.toContain("backdrop-blur");
    expect(agents).not.toContain("rounded-2xl");
  });

  it("keeps Knowledge and Studio aligned with their screenshot compositions", () => {
    const knowledge = read("src/pages/KnowledgePage.tsx");
    const studio = read("src/components/StudioWorkspaceV2.tsx");
    expect(knowledge).toContain("No assistants yet");
    expect(knowledge).toContain("Create an assistant first to start building its knowledge base.");
    expect(knowledge).toContain("max-w-[512px]");
    expect(studio).toContain("xl:grid-cols-[240px_minmax(0,1fr)_320px]");
    expect(studio).toContain("Train your assistant in plain English");
    expect(studio).toContain("Your assistants");
    expect(studio).toContain("Build map");
    expect(studio).not.toContain("backdrop-blur-sm");
  });

  it("keeps auth and public home within the same precision primitive family", () => {
    const auth = read("src/components/AuthPortal.tsx");
    const landing = read("src/components/marketing/PrecisionLanding.tsx");
    expect(auth).toContain("wl-stitch-auth-card");
    expect(auth).toContain("wl-stitch-oauth-btn");
    expect(landing).toContain("Never wait on hold again.");
    expect(landing).toContain("Your personal AI phone call assistant");
    expect(landing).toContain("A personal assistant when you need one. A fleet when you grow.");
    expect(landing).toContain("bg-[radial-gradient");
  });
});
