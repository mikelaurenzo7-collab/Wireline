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

describe("Studio Canvas vision contract", () => {
  it("keeps the design vision as the single source of truth", () => {
    expect(STUDIO_CANVAS_VISION).toBe(WIRELINE_DESIGN_VISION.studioCanvas);
    expect(STUDIO_CANVAS_VISION.defaultSurface).toBe("chat-plus-canvas");
    expect(STUDIO_CANVAS_VISION.canvasSurface).toBe("spatial-cards");
    expect(STUDIO_CANVAS_VISION.agentSwitcher).toBe("context-chrome");
    expect(STUDIO_CANVAS_VISION.railWidthPx).toBe(236);
    expect(STUDIO_CANVAS_VISION.workspaceDepthParam).toBe("view=workspace");
    expect(STUDIO_CANVAS_VISION.minTouchTargetPx).toBe(44);
  });

  it("guards against retired Studio and posture-split patterns", () => {
    const sources = loadSurfaces();
    for (const [surface, rules] of Object.entries(STUDIO_CANVAS_FORBIDDEN) as Array<
      [
        keyof typeof STUDIO_CANVAS_FORBIDDEN,
        (typeof STUDIO_CANVAS_FORBIDDEN)[keyof typeof STUDIO_CANVAS_FORBIDDEN],
      ]
    >) {
      for (const rule of rules) {
        expect(sources[surface], `${surface}:${rule.id}`).not.toMatch(rule.pattern);
      }
    }
  });

  it("requires the neutral Studio shell, context chrome, setup, test, review, and unified Overview", () => {
    const sources = loadSurfaces();
    for (const [surface, rules] of Object.entries(STUDIO_CANVAS_REQUIRED) as Array<
      [
        keyof typeof STUDIO_CANVAS_REQUIRED,
        (typeof STUDIO_CANVAS_REQUIRED)[keyof typeof STUDIO_CANVAS_REQUIRED],
      ]
    >) {
      for (const rule of rules) {
        expect(sources[surface], `${surface}:${rule.id}`).toMatch(rule.pattern);
      }
    }
  });

  it("removes legacy workroom links from Studio navigation surfaces", () => {
    for (const path of STUDIO_CANVAS_LINK_SURFACES) {
      expect(read(path), path).not.toMatch(STUDIO_CANVAS_LEGACY_LINK_PATTERN);
    }
  });

  it("composes Studio home from the dedicated shell and workspace orchestrator", () => {
    const studioHome = read(STUDIO_CANVAS_SURFACES.studioHome);
    expect(studioHome).toContain("StudioPageShell");
    expect(studioHome).toContain("StudioContextChrome");
    expect(studioHome).toContain("StudioWorkspaceV2");
    expect(studioHome).not.toContain("StudioAgentBar");
  });

  it("keeps deploy-time Overview rules in lockstep with the TypeScript manifest", () => {
    const tsManifest = read("src/lib/studio-canvas-contract.ts");
    const deployManifest = read("scripts/lib/studio-canvas-contract.mjs");

    for (const id of [
      "overview-title",
      "unified-inbox",
      "bot-roster",
      "configuration-surface",
      "create-entry",
      "template-entry",
      "operating-metrics",
      "recent-conversations",
    ]) {
      expect(tsManifest, id).toContain(`id: "${id}"`);
      expect(deployManifest, id).toContain(`id: "${id}"`);
    }
    for (const retired of ["agent-preview-cap", "agent-overflow-link"]) {
      expect(tsManifest).not.toContain(retired);
      expect(deployManifest).not.toContain(retired);
    }
  });
});
