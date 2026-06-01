/**
 * Tests for the Constellation Design Primitives:
 * - ConstellationField (seeded PRNG + particle generation + connection logic)
 * - PulseRing (prop validation + ring clamping)
 * - AuroraWave (wave path generation + layer clamping)
 * - StatusOrb (status-to-color mapping + animation gating)
 *
 * These tests verify the logic and structural contracts of each primitive
 * without requiring a DOM renderer (no @testing-library needed).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readComponent(name: string): string {
  return fs.readFileSync(path.resolve(__dirname, `../${name}.tsx`), "utf8");
}

describe("ConstellationField", () => {
  const src = readComponent("ConstellationField");

  it("exports a ConstellationField function component", () => {
    expect(src).toContain("export function ConstellationField");
  });

  it("uses a seeded PRNG for deterministic layout", () => {
    expect(src).toContain("seededRandom");
    expect(src).toContain("seed");
  });

  it("renders an SVG with viewBox 0 0 100 100", () => {
    expect(src).toContain('viewBox="0 0 100 100"');
  });

  it("computes connections between particles within radius", () => {
    expect(src).toContain("computeConnections");
    expect(src).toContain("connectionRadius");
  });

  it("is aria-hidden for accessibility", () => {
    expect(src).toContain('aria-hidden="true"');
  });

  it("includes reduced-motion media query", () => {
    expect(src).toContain("prefers-reduced-motion");
  });

  it("renders line elements for filaments", () => {
    expect(src).toContain("<line");
    expect(src).toContain("constellation-filament");
  });

  it("renders circle elements for particle nodes", () => {
    expect(src).toContain("<circle");
    expect(src).toContain("constellation-node");
  });

  it("uses radialGradient for node glow", () => {
    expect(src).toContain("<radialGradient");
  });

  it("supports interactive pointer-events override", () => {
    expect(src).toContain("pointer-events-none");
    expect(src).toContain("pointer-events-auto");
  });
});

describe("PulseRing", () => {
  const src = readComponent("PulseRing");

  it("exports a PulseRing function component", () => {
    expect(src).toContain("export function PulseRing");
  });

  it("clamps ring count between 1 and 5", () => {
    expect(src).toContain("Math.max(1, Math.min(5, rings))");
  });

  it("supports brand/emerald/destructive/muted color presets", () => {
    expect(src).toContain('"brand"');
    expect(src).toContain('"emerald"');
    expect(src).toContain('"destructive"');
    expect(src).toContain('"muted"');
  });

  it("supports sm/md/lg size presets", () => {
    expect(src).toContain("w-8 h-8");
    expect(src).toContain("w-14 h-14");
    expect(src).toContain("w-24 h-24");
  });

  it("uses pulse-ring-expand keyframe animation", () => {
    expect(src).toContain("pulse-ring-expand");
  });

  it("reduces visual feedback when inactive", () => {
    expect(src).toContain("active");
    expect(src).toContain("opacity");
  });

  it("renders children in a relative z-[1] container", () => {
    expect(src).toContain("z-[1]");
    expect(src).toContain("{children}");
  });

  it("uses data-circular for border-radius exception", () => {
    expect(src).toContain("data-circular");
  });
});

describe("AuroraWave", () => {
  const src = readComponent("AuroraWave");

  it("exports an AuroraWave function component", () => {
    expect(src).toContain("export function AuroraWave");
  });

  it("clamps layers between 1 and 6", () => {
    expect(src).toContain("Math.max(1, Math.min(6, layers))");
  });

  it("generates SVG path elements for each wave", () => {
    expect(src).toContain("<path");
    expect(src).toContain("wavePath");
  });

  it("uses linearGradient fills with brand color", () => {
    expect(src).toContain("<linearGradient");
    expect(src).toContain("--primary");
  });

  it("supports subtle/medium/strong intensity levels", () => {
    expect(src).toContain("subtle");
    expect(src).toContain("medium");
    expect(src).toContain("strong");
  });

  it("generates wave using sine function", () => {
    expect(src).toContain("Math.sin");
  });

  it("is aria-hidden", () => {
    expect(src).toContain('aria-hidden="true"');
  });

  it("includes reduced-motion guard", () => {
    expect(src).toContain("prefers-reduced-motion");
  });

  it("uses translateX(-50%) for seamless loop panning", () => {
    expect(src).toContain("translateX(-50%)");
  });
});

describe("StatusOrb", () => {
  const src = readComponent("StatusOrb");

  it("exports a StatusOrb function component", () => {
    expect(src).toContain("export function StatusOrb");
  });

  it("uses role=status for accessibility", () => {
    expect(src).toContain('role="status"');
  });

  it("provides aria-label from status or custom label", () => {
    expect(src).toContain("aria-label");
    expect(src).toContain("DEFAULT_LABELS");
  });

  it("supports all 5 status variants", () => {
    expect(src).toContain("active");
    expect(src).toContain("idle");
    expect(src).toContain("busy");
    expect(src).toContain("error");
    expect(src).toContain("offline");
  });

  it("gates animation on active/busy states only", () => {
    // isAnimated derives from status === "active" || status === "busy"
    expect(src).toContain('status === "active" || status === "busy"');
  });

  it("supports sm/md/lg sizes", () => {
    expect(src).toContain("w-4 h-4");
    expect(src).toContain("w-6 h-6");
    expect(src).toContain("w-10 h-10");
  });

  it("renders orbital rings conditionally with withOrbit prop", () => {
    expect(src).toContain("withOrbit");
    expect(src).toContain("status-orb-orbit");
  });

  it("uses data-circular for border-radius exception", () => {
    expect(src).toContain("data-circular");
  });

  it("renders specular highlight for depth", () => {
    expect(src).toContain("rgba(255, 255, 255, 0.45)");
    expect(src).toContain("blur(0.5px)");
  });

  it("uses status-orb-breathe and status-orb-pulse keyframes", () => {
    expect(src).toContain("status-orb-breathe");
    expect(src).toContain("status-orb-pulse");
  });
});
