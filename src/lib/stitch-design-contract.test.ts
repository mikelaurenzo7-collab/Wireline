import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { STITCH_CODE_SYSTEM, STITCH_DESIGN_SYSTEM, STITCH_SCREENS } from "./stitch-design-system";

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Precision Operator contract", () => {
  it("uses the active project source", () => {
    expect(STITCH_DESIGN_SYSTEM.projectId).toBe("15464421841872665077");
    expect(existsSync(resolve(root, STITCH_DESIGN_SYSTEM.designSpec))).toBe(true);
    expect(existsSync(resolve(root, STITCH_DESIGN_SYSTEM.sourceManifest))).toBe(true);
    expect(read(STITCH_DESIGN_SYSTEM.sourceManifest)).toContain("studio_agent_training");
  });

  it("pins source tokens and typography", () => {
    const css = read(STITCH_CODE_SYSTEM.tokens);
    expect(css).toMatch(/--wl-bg:\s*#f7f7f5/i);
    expect(css).toMatch(/--wl-surface:\s*#ffffff/i);
    expect(css).toMatch(/--wl-ink:\s*#1d1d1f/i);
    expect(css).toMatch(/--wl-accent:\s*#1a3c34/i);
    expect(css).toMatch(/--radius:\s*0\.25rem/i);
    expect(css).toMatch(/--radius-lg:\s*0\.5rem/i);
    expect(css).toContain("-webkit-font-smoothing: auto");
    expect(css).not.toMatch(/font-weight:\s*650/);
  });

  it("maps all workspace modules", () => {
    expect(STITCH_SCREENS["/studio"].source).toBe("studio_agent_training");
    expect(STITCH_SCREENS["/agents"].source).toBe("agents_fleet_roster");
    expect(STITCH_SCREENS["/knowledge"].source).toBe("knowledge_facts_rules");
    expect(STITCH_SCREENS["/actions"].source).toBe("actions_permissions_connections");
    expect(STITCH_SCREENS["/ops"].source).toBe("live_real_time_ops");
    expect(STITCH_SCREENS["/settings"].source).toBe("settings_workspace_admin");
  });

  it("uses the active css cascade", () => {
    const main = read("src/main.tsx");
    expect(main).toContain('import "./styles/foundation.css";');
    expect(main).toContain('import "./index.css";');
    expect(main).not.toContain("monochrome-guard.css");
    expect(main).not.toContain("readability-guard.css");
  });

  it("keeps personal configuration available", () => {
    const app = read("src/App.tsx");
    expect(app).toContain('path="/for/personal" element={<VerticalLanding slug="personal" />}');
  });
});
