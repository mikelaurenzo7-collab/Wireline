/**
 * AnimatedCounter tests.
 *
 * Runtime: exercises the pure `formatCount` contract directly.
 * Structure: source-reading assertions guard the motion-safety and
 * SSR-safety invariants without needing a DOM renderer (the suite runs
 * under the `node` vitest environment).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatCount } from "./AnimatedCounter";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.resolve(__dirname, "AnimatedCounter.tsx"), "utf8");

describe("formatCount", () => {
  it("groups thousands by default", () => {
    expect(formatCount(31412)).toBe("31,412");
  });

  it("rounds to the requested decimal places", () => {
    expect(formatCount(12.345, 2)).toBe("12.35");
    expect(formatCount(12.345, 0)).toBe("12");
  });

  it("can disable grouping separators", () => {
    expect(formatCount(31412, 0, false)).toBe("31412");
  });

  it("coerces non-finite input to 0", () => {
    expect(formatCount(Number.NaN)).toBe("0");
    expect(formatCount(Number.POSITIVE_INFINITY)).toBe("0");
  });
});

describe("AnimatedCounter (structure)", () => {
  it("only triggers once on entering the viewport", () => {
    expect(src).toContain("useInView");
    expect(src).toContain("once: true");
  });

  it("is reduced-motion safe", () => {
    expect(src).toContain("useReducedMotion");
    expect(src).toContain("prefersReducedMotion");
  });

  it("renders the final value immediately under reduced motion (no flash of 0)", () => {
    expect(src).toContain("prefersReducedMotion ? value : from");
  });

  it("stops the animation on unmount", () => {
    expect(src).toContain("controls.stop()");
  });
});
