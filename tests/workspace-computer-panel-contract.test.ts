import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

/**
 * The Set Up conversation stays visible while the Bot's computer works beside
 * it. Only the owner's Full width choice hides the conversation, and screens
 * too narrow for both open the Computer page instead.
 */
describe("Workspace computer panel", () => {
  const studio = read("src/components/StudioWorkspaceV2.tsx");
  const computer = read("src/pages/ComputerPage.tsx");
  const sections = read("src/components/layout/WorkspaceSectionNav.tsx");
  const panel = read("src/components/layout/WorkspaceResizablePanel.tsx");

  it("opens the computer beside the conversation wherever there is room", () => {
    expect(computer).toContain('const SIDE_BY_SIDE_QUERY = "(min-width: 1180px)";');
    expect(computer).toContain('new URLSearchParams({ panel: "computer" })');
    expect(computer).toContain("<Navigate to={`/studio?${next.toString()}`} replace />");
    expect(sections).toContain('useMediaQuery("(min-width: 1180px)")');
    expect(sections).toContain("panel=computer");
    expect(studio).toContain('useMediaQuery("(min-width: 1180px)")');
    expect(studio).toContain('if (panelParam !== "computer") return;');
  });

  it("shares one workbench between the panel and the Computer page", () => {
    expect(computer).toContain("export function ComputerWorkbench(");
    expect(computer).toContain('className="wl-computer-plan"');
    expect(computer).toContain("Planning");
    expect(computer).toContain('className="wl-computer-recovery"');
    expect(computer).toContain("This task stopped before it finished.");
    expect(computer).toContain('if (layout === "panel")');
    expect(computer).toContain("{agents.length > 1 && !pinned ? (");
    expect(studio).toContain('import("../pages/ComputerPage")');
    expect(studio).toContain(
      '<ComputerWorkbench key={active.id} agentId={active.id} layout="panel" />',
    );
  });

  it("hides the conversation only for Full width and keeps it mounted", () => {
    expect(studio).toContain("const panelFill = panelOpen && panelExpanded;");
    expect(studio).toContain(
      '(!splitWorkspace && inspectorOpen) || panelFill ? "hidden" : "block"',
    );
    expect(studio).toContain("if (!panelOpen) setPanelExpanded(false);");
    expect(panel).toContain('fill ? "min-w-0 flex-1" : "shrink-0"');
    expect(panel).toContain("{!collapsed && !fill ? (");
  });

  it("never lets a drag narrow the conversation past a readable column", () => {
    expect(studio).toContain("const CONVERSATION_MIN_WIDTH = 420;");
    expect(studio).toContain("workspaceWidth - CONVERSATION_MIN_WIDTH");
    expect(panel).toContain("clamp(size, minSize, maxSize)");
  });
});
