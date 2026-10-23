import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

/**
 * Computer opens beside Work/Set up chat. Explicit full-width remains optional;
 * phones switch browser/conversation without discarding either draft.
 */
describe("Workspace computer panel", () => {
  const studio = read("src/components/StudioWorkspaceV2.tsx");
  const computer = read("src/pages/ComputerPage.tsx");
  const sections = read("src/components/layout/WorkspaceSectionNav.tsx");
  const panel = read("src/components/layout/WorkspaceResizablePanel.tsx");

  it("opens Computer beside chat without creating a second workbench", () => {
    expect(computer).toContain('const SIDE_BY_SIDE_QUERY = "(min-width: 1180px)";');
    expect(computer).toContain('new URLSearchParams({ panel: "computer" })');
    expect(computer).toContain("<Navigate to={`/studio?${next.toString()}`} replace />");
    expect(sections).toContain('useMediaQuery("(min-width: 1180px)")');
    expect(sections).toContain("panel=computer");
    expect(sections).not.toContain("panel=computer&focus=computer");
    expect(studio).toContain('useMediaQuery("(min-width: 1180px)")');
    expect(studio).toContain(
      'requestedAgentUnavailable || panelParam !== "computer" || !splitWorkspace',
    );
  });

  it("shares one workbench between the panel and the Computer page", () => {
    expect(computer).toContain("export function ComputerWorkbench(");
    expect(computer).toContain('className="wl-computer-plan"');
    expect(computer).toContain("Notes");
    expect(computer).toContain('className="wl-computer-recovery"');
    expect(computer).toContain("This task stopped before it finished.");
    expect(computer).toContain('if (layout === "panel")');
    expect(computer).toContain("{agents.length > 1 && !pinned ? (");
    expect(studio).toContain('import("../pages/ComputerPage")');
    expect(studio).toMatch(
      /<ComputerWorkbench\s+key=\{active.id\}\s+agentId=\{active.id\}\s+layout="panel"\s+chatControls=/,
    );
    expect(studio).toContain("<ComputerWorkspaceProvider>");
    expect(studio).toContain("<StudioTaskChat");
  });

  it("keeps the conversation mounted behind focused Computer and manual Full width", () => {
    expect(studio).toContain("const panelFill = panelOpen && (panelExpanded || computerFocused);");
    expect(studio).toContain(
      '(!splitWorkspace && inspectorOpen) || mobileBrowserOpen || panelFill ? "hidden" : "block"',
    );
    expect(studio).toContain("if (!panelOpen) setPanelExpanded(false);");
    expect(panel).toContain('fill ? "min-w-0 flex-1" : "shrink-0"');
    expect(panel).toContain("{!collapsed && !fill ? (");
  });

  it("keeps checkpoint, owner stop and error recovery inside the expanded task", () => {
    const detail = computer.slice(computer.indexOf("function TaskDetail("));
    const fullscreenTarget = computer.slice(
      computer.indexOf('aria-label={expanded ? "Exit browser fullscreen"'),
      computer.indexOf("await surface.requestFullscreen();"),
    );
    expect(fullscreenTarget).toContain('closest(".wl-computer-detail")');
    expect(fullscreenTarget).not.toContain('closest(".wl-computer-takeover")');
    const detailSection = detail.match(/<section\b[^>]*\bref=\{detailRef\}[^>]*>/)?.[0] ?? "";
    expect(detailSection).not.toBe("");
    expect(detailSection).toContain("ref={detailRef}");
    const detailClass = detailSection.match(/\bclassName=(?:"[^"]*"|\{[^}]*\})/)?.[0] ?? "";
    expect(detailClass).toMatch(/["'\s]wl-computer-detail["'\s]/);
    expect(detailSection).toContain('aria-labelledby="computer-task-title"');
    expect(detail).toContain('className="wl-computer-question"');
    expect(detail).toContain('onClick={() => void act("stop")}');
    expect(detail).toContain('title="Something Went Wrong"');
    expect(detail).toContain("!active && document.fullscreenElement === detailRef.current");
    expect(detail).toMatch(
      /exitEndedTask\(\);\s*document\.addEventListener\("fullscreenchange", exitEndedTask\)/,
    );
    expect(detail).toContain('document.removeEventListener("fullscreenchange", exitEndedTask)');
    const activity = detail.slice(
      detail.indexOf("const openActivity = async () =>"),
      detail.indexOf('const act = async (kind: "stop" | "reply")'),
    );
    expect(activity.indexOf("await document.exitFullscreen()")).toBeGreaterThan(-1);
    expect(activity.indexOf("setActivityOpen(true)")).toBeGreaterThan(
      activity.indexOf("await document.exitFullscreen()"),
    );
    expect(activity).toContain("return;");
    expect(read("src/styles/cloud-computer.css")).toContain(".wl-computer-detail:fullscreen > *");
    expect(computer).toMatch(
      /update\(\);\s*document\.addEventListener\("fullscreenchange", update\)/,
    );
  });

  it("never lets a drag narrow the conversation past a readable column", () => {
    expect(studio).toContain("const CONVERSATION_MIN_WIDTH = 420;");
    expect(studio).toContain("workspaceWidth - CONVERSATION_MIN_WIDTH");
    expect(panel).toContain("clamp(size, minSize, maxSize)");
  });
});
