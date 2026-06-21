import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { STITCH_CODE_SYSTEM, STITCH_SCREENS } from "./stitch-design-system";
import { WL_BRAND } from "./wireline-design-system";

const root = resolve(import.meta.dirname, "../..");

function read(rel: string) {
  return readFileSync(resolve(root, rel), "utf8");
}

describe("Stitch design contract", () => {
  it("pins forest accent on the product bridge", () => {
    expect(WL_BRAND.accentHex.toLowerCase()).toBe("#1a3c34");
  });

  it("maps workspace routes to Stitch screen references", () => {
    expect(STITCH_SCREENS["/studio"].stitchFolder).toBe("agent_studio_integrated_creation");
    expect(STITCH_SCREENS["/agents"].component).toContain("AgentsPage");
    expect(STITCH_SCREENS["/pricing"].stitchFile).toContain("pricing-wireline");
  });

  it("loads Stitch tokens in foundation.css", () => {
    const foundation = read("src/styles/foundation.css");
    expect(foundation).toMatch(/--wl-accent:\s*#1a3c34/i);
    expect(foundation).toMatch(/--wl-bg:\s*#f7f7f5/i);
    expect(foundation).toMatch(/--wl-status-active:\s*#2d5a27/i);
  });

  it("imports Stitch pattern CSS from the app stylesheet", () => {
    const index = read("src/index.css");
    const main = read("src/main.tsx");
    expect(index).toContain("stitch-patterns.css");
    expect(main).toContain("foundation.css");
  });

  it("documents Stitch assets in the code bridge", () => {
    expect(STITCH_CODE_SYSTEM.patterns).toBe("src/styles/stitch-patterns.css");
    expect(STITCH_CODE_SYSTEM.designMd).toBe(".stitch/DESIGN.md");
  });

  it("does not reintroduce retired violet brand utilities on workspace shell", () => {
    const shell = read("src/components/WorkspaceShell.tsx");
    expect(shell).not.toMatch(/#7C3AED|text-violet-|bg-violet-/i);
    expect(shell).toMatch(/wl-stitch-sidebar/);
  });
});
