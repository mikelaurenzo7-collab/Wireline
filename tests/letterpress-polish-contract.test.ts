import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { WIRELINE_DESIGN_VISION } from "../src/lib/wireline-design-vision";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Wireline design polish contract", () => {
  it("loads the canonical polish layer and keeps its core accessible primitives", () => {
    const indexCss = read("src/index.css");
    const polish = read("src/styles/letterpress-polish.css");
    expect(indexCss).toContain('@import "./styles/letterpress-polish.css"');
    for (const name of [
      "wl-paper",
      "wl-paper-elevated",
      "wl-focus-ring-halo",
      "wl-reveal",
      "wl-chip",
      "wl-metric-tile",
      "wl-empty",
      "wl-skeleton",
      "wl-data-row",
      "wl-banner",
      "wl-eyebrow",
    ]) expect(polish).toContain(`.${name}`);
    expect(polish).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none/);
  });

  it("keeps the design manifest aligned with motion and utility vocabulary", () => {
    expect(WIRELINE_DESIGN_VISION.motion.durations).toContain("deliberate 440ms");
    expect(WIRELINE_DESIGN_VISION.motion.easings).toEqual(
      expect.arrayContaining(["standard", "spring", "wireline", "emphasized"]),
    );
    expect(WIRELINE_DESIGN_VISION.utilities.layout).toEqual(
      expect.arrayContaining(["wl-metric-tile", "wl-empty", "wl-skeleton"]),
    );
  });

  it("uses the shared metric tile polish without a retired Overview page", () => {
    const tile = read("src/components/atoms/MetricTile.tsx");
    expect(existsSync(resolve(root, "src/pages/OverviewPage.tsx"))).toBe(false);
    expect(tile).toContain("wl-metric-tile");
    expect(tile).toContain("wl-reveal");
    expect(tile).toContain('data-slot="metric-tile"');
    expect(read("src/components/molecules/StatusNotice.tsx")).toContain("StatusNotice");
  });

  it("keeps canonical atoms and banners wired", () => {
    const atomIndex = read("src/components/atoms/index.ts");
    for (const atom of ["Chip", "MetricTile", "Eyebrow", "Paper", "Reveal"]) {
      expect(atomIndex).toContain(`export * from "./${atom}"`);
      expect(existsSync(resolve(root, `src/components/atoms/${atom}.tsx`))).toBe(true);
    }
    const email = read("src/components/layout/EmailVerifyBanner.tsx");
    expect(email).toContain("wl-banner--info");
    expect(email).toContain("wl-banner__icon");
  });

  it("keeps generated tokens and auth focus states present", () => {
    const tokens = read("src/styles/tokens.generated.css");
    const auth = read("src/styles/precision-auth.css");
    for (const token of [
      "--wireline-color-action-primary-hover:",
      "--wireline-color-focus-wire:",
      "--wireline-motion-easing-spring:",
      "--wireline-elevation-wireGlow:",
      "--wireline-interaction-target-primary: 48px",
    ]) expect(tokens).toContain(token);
    expect(auth).toMatch(/\.wl-stitch-oauth-btn:focus-visible[\s\S]*var\(--wireline-color-focus-default\)/);
  });
});
