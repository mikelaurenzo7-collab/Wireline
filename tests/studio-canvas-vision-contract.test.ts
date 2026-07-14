import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  STUDIO_CANVAS_FORBIDDEN,
  STUDIO_CANVAS_LEGACY_LINK_PATTERN,
  STUDIO_CANVAS_LINK_SURFACES,
  STUDIO_CANVAS_REQUIRED,
  STUDIO_CANVAS_SURFACES,
  STUDIO_CANVAS_VISION,
} from "../src/lib/studio-canvas-contract";
import { WIRELINE_DESIGN_VISION } from "../src/lib/wireline-design-vision";

const root = process.cwd();
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

function loadSurfaces() {
  return Object.fromEntries(
    Object.entries(STUDIO_CANVAS_SURFACES).map(([key, path]) => [key, read(path)]),
  ) as Record<keyof typeof STUDIO_CANVAS_SURFACES, string>;
}

describe("Studio guided-workspace vision contract", () => {
  it("keeps the manifest as the single source of truth", () => {
    expect(STUDIO_CANVAS_VISION).toBe(WIRELINE_DESIGN_VISION.studioCanvas);
    expect(STUDIO_CANVAS_VISION.defaultSurface).toBe("setup-test-review");
    expect(STUDIO_CANVAS_VISION.canvasSurface).toBe("focused-panels");
    expect(STUDIO_CANVAS_VISION.agentSwitcher).toBe("context-chrome");
    expect(STUDIO_CANVAS_VISION.railWidthPx).toBe(236);
    expect(STUDIO_CANVAS_VISION.workspaceDepthParam).toBe("section");
    expect(STUDIO_CANVAS_VISION.minTouchTargetPx).toBe(44);
  });

  it("guards against old Studio patterns", () => {
    const sources = loadSurfaces();

    for (const [surface, rules] of Object.entries(STUDIO_CANVAS_FORBIDDEN) as Array<
      [
        keyof typeof STUDIO_CANVAS_FORBIDDEN,
        (typeof STUDIO_CANVAS_FORBIDDEN)[keyof typeof STUDIO_CANVAS_FORBIDDEN],
      ]
    >) {
      const text = sources[surface];
      for (const rule of rules) {
        expect(text, `${surface}:${rule.id}`).not.toMatch(rule.pattern);
      }
    }
  });

  it("requires the Studio shell, context chrome, and guided setup, test, review loop", () => {
    const sources = loadSurfaces();

    for (const [surface, rules] of Object.entries(STUDIO_CANVAS_REQUIRED) as Array<
      [
        keyof typeof STUDIO_CANVAS_REQUIRED,
        (typeof STUDIO_CANVAS_REQUIRED)[keyof typeof STUDIO_CANVAS_REQUIRED],
      ]
    >) {
      const text = sources[surface];
      for (const rule of rules) {
        expect(text, `${surface}:${rule.id}`).toMatch(rule.pattern);
      }
    }
  });

  it("removes legacy workroom links from studio navigation surfaces", () => {
    for (const path of STUDIO_CANVAS_LINK_SURFACES) {
      expect(read(path), path).not.toMatch(STUDIO_CANVAS_LEGACY_LINK_PATTERN);
    }
  });

  it("composes studio home from the dedicated shell and guided orchestrator", () => {
    const studioHome = read(STUDIO_CANVAS_SURFACES.studioHome);
    expect(studioHome).toContain("StudioPageShell");
    expect(studioHome).toContain("StudioContextChrome");
    expect(studioHome).toContain("StudioWorkspaceV2");
    expect(studioHome).not.toContain("StudioAgentBar");
  });
});
