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
  it("keeps the manifest as the single source of truth", () => {
    expect(STUDIO_CANVAS_VISION).toBe(WIRELINE_DESIGN_VISION.studioCanvas);
    expect(STUDIO_CANVAS_VISION.defaultSurface).toBe("chat-composer");
    expect(STUDIO_CANVAS_VISION.agentSwitcher).toBe("horizontal-bar");
    expect(STUDIO_CANVAS_VISION.railWidthPx).toBe(56);
    expect(STUDIO_CANVAS_VISION.workspaceDepthParam).toBe("view=workspace");
    expect(STUDIO_CANVAS_VISION.minTouchTargetPx).toBe(44);
  });

  it("forbids retired canvas patterns (cards, rail stack, demo hacks)", () => {
    const sources = loadSurfaces();

    for (const rule of STUDIO_CANVAS_FORBIDDEN.canvas) {
      expect(sources.canvas, rule.id).not.toMatch(rule.pattern);
    }
    for (const rule of STUDIO_CANVAS_FORBIDDEN.shell) {
      expect(sources.shell, rule.id).not.toMatch(rule.pattern);
    }
  });

  it("requires chat-first canvas with MRU, composer, and gated workspace depth", () => {
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

  it("composes studio home from shell + canvas orchestrator only", () => {
    const studioHome = read(STUDIO_CANVAS_SURFACES.studioHome);
    expect(studioHome).toContain("WorkspaceShell");
    expect(studioHome).toContain("StudioWorkspaceV2");
    expect(studioHome).toContain('contentClassName="h-full min-h-0 p-0 overflow-hidden"');
  });
});
