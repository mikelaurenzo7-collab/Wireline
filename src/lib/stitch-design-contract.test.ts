import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { STITCH_CODE_SYSTEM, STITCH_DESIGN_SYSTEM, STITCH_SCREENS } from "./stitch-design-system";

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Precision Operator source contract", () => {
  it("pins the current Stitch project", () => {
    expect(STITCH_DESIGN_SYSTEM.projectId).toBe("15464421841872665077");
    expect(STITCH_CODE_SYSTEM.tokens).toBe("src/styles/precision-operator-web.css");
    expect(existsSync(resolve(root, STITCH_DESIGN_SYSTEM.designSpec))).toBe(true);
  });

  it("uses the exact source palette, geometry, and type", () => {
    const css = read(STITCH_CODE_SYSTEM.tokens).toLowerCase();
    for (const value of ["#f7f7f5", "#f9f9f7", "#ffffff", "#f4f4f2", "#eeeeec", "#e8e8e6", "#e2e3e1", "#1a1c1b", "#414846", "#717976", "#c1c8c4", "#e5e5e2", "#1a3c34", "#01261f", "#c5eadf", "#aacec3"]) expect(css).toContain(value);
    for (const value of ["--radius-sm:.125rem", "--radius:.25rem", "--radius-md:.375rem", "--radius-lg:.5rem", "--radius-xl:.75rem"]) expect(css).toContain(value);
    expect(css).toContain("font-size:32px;font-weight:600;line-height:40px");
    expect(css).toContain("font-size:12px;font-weight:500;line-height:16px");
    expect(css).not.toContain("font-weight:650");
    expect(css).not.toContain("font-smoothing");
  });

  it("maps every workspace module and preserves personal setup", () => {
    expect(STITCH_SCREENS["/studio"].source).toBe("studio_agent_training");
    expect(STITCH_SCREENS["/agents"].source).toBe("agents_fleet_roster");
    expect(STITCH_SCREENS["/knowledge"].source).toBe("knowledge_facts_rules");
    expect(STITCH_SCREENS["/actions"].source).toBe("actions_permissions_connections");
    expect(STITCH_SCREENS["/ops"].source).toBe("live_real_time_ops");
    expect(STITCH_SCREENS["/settings"].source).toBe("settings_workspace_admin");
    expect(read("src/App.tsx")).toContain('path="/for/personal" element={<VerticalLanding slug="personal" />}');
  });

  it("keeps the source cascade and fixed-fluid shell", () => {
    const index = read("src/index.css");
    const shell = read("src/components/WorkspaceShell.tsx");
    expect(index).toContain('"./styles/precision-operator-web.css"');
    expect(index).not.toContain("precision-type.css");
    expect(index).not.toContain("font-smoothing");
    expect(shell).toContain("212px");
    expect(shell).toContain("max-w-[1680px]");
    expect(shell).toContain("lg:px-10");
  });
});
