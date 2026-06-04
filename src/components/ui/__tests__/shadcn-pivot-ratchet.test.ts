/**
 * SHADcn pivot ratchet — guardrails so the design-system migration
 * can only move in one direction.
 *
 * Each metric below counts a known anti-pattern (raw `<button>` instead
 * of `Button`, `.glass` instead of `Card`, `rounded-{lg|xl|2xl|3xl}`
 * literals that contradict the global zero-radius reset, raw `<input>`,
 * raw `<select>`, raw `<dialog>`). The current values are the
 * **baseline as of 2026-05-31**. New code must never grow them; the
 * test passes when the live count is ≤ the baseline.
 *
 * When you migrate code away from an anti-pattern, **lower the baseline
 * here** in the same PR so the ratchet permanently locks in your win.
 * If you intentionally accept a small regression (rare), raise the
 * baseline and explain why in the PR.
 *
 * This is intentionally a static-text scan rather than an AST analysis
 * so it runs in milliseconds and never needs a TypeScript program.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOTS = [
  path.resolve(__dirname, "../../../components"),
  path.resolve(__dirname, "../../../pages"),
];

// Files inside the canonical UI layer are allowed to render raw HTML
// controls — that's literally their job. The ratchet only counts
// regressions in feature/page code.
const EXCLUDED_DIRS = [path.resolve(__dirname, "../shadcn"), __dirname];

function walk(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (EXCLUDED_DIRS.some((ex) => full === ex || full.startsWith(ex + path.sep))) continue;
    if (entry.isDirectory()) {
      walk(full, acc);
    } else if (/\.(tsx|ts)$/.test(entry.name) && !/\.test\.(tsx?|spec\.tsx?)$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

function countOccurrences(pattern: RegExp): number {
  let total = 0;
  for (const root of SRC_ROOTS) {
    for (const file of walk(root)) {
      const text = fs.readFileSync(file, "utf8");
      const matches = text.match(pattern);
      if (matches) total += matches.length;
    }
  }
  return total;
}

/**
 * Baselines locked on 2026-05-31. **Only ever lower these numbers.**
 * Each lowering should be accompanied by the migration commit that
 * earned it (e.g. replacing raw `<button>` with `Button`, or `glass`
 * with `Card`).
 *
 * glassUtility: migrated to wl-panel / wl-panel-elevated in feature code (baseline 0).
 *   Legacy .glass CSS remains in index.css for backwards compat only.
 */
const BASELINE = {
  rawButton: 0, // Full ShadButton migration — feature/page code 2026-06-03
  rawInput: 0,
  rawSelect: 0,
  rawDialog: 0,
  glassUtility: 0, // Full wl-panel migration — feature/page code 2026-06-03
  largeRadius: 0, // Full rounded-md migration — feature/page code 2026-06-03
} as const;

function assertRatchet(actual: number, baseline: number, metric: string) {
  if (actual > baseline) {
    throw new Error(
      `Ratchet regression! ${metric} grew to ${actual} (baseline is ${baseline}). Revert your change or raise the baseline.`,
    );
  }
  if (actual < baseline) {
    throw new Error(
      `Ratchet WIN! ${metric} shrank to ${actual} (baseline is ${baseline}). You MUST edit shadcn-pivot-ratchet.test.ts to lower the baseline and lock in your greatness.`,
    );
  }
  expect(actual).toBe(baseline);
}

describe("shadcn pivot ratchet", () => {
  it("enforces raw <button> usage", () => {
    assertRatchet(countOccurrences(/<button(?=[\s>])/g), BASELINE.rawButton, "raw <button>");
  });

  it("enforces raw <input> usage", () => {
    assertRatchet(countOccurrences(/<input(?=[\s>])/g), BASELINE.rawInput, "raw <input>");
  });

  it("enforces raw <select> usage", () => {
    assertRatchet(countOccurrences(/<select(?=[\s>])/g), BASELINE.rawSelect, "raw <select>");
  });

  it("blocks the native <dialog> element entirely", () => {
    assertRatchet(countOccurrences(/<dialog(?=[\s>])/g), BASELINE.rawDialog, "raw <dialog>");
  });

  it("enforces .glass utility usage", () => {
    assertRatchet(countOccurrences(/\bglass(?!\w)/g), BASELINE.glassUtility, ".glass utility");
  });

  it("enforces rounded-{lg|xl|2xl|3xl} literals", () => {
    assertRatchet(
      countOccurrences(/\brounded-(lg|xl|2xl|3xl)\b/g),
      BASELINE.largeRadius,
      "large border-radius",
    );
  });

  it("registers Textarea, Label, and Popover in the shadcn barrel", () => {
    const indexPath = path.resolve(__dirname, "../shadcn/index.ts");
    const indexSource = fs.readFileSync(indexPath, "utf8");
    expect(indexSource).toContain('export * from "./Textarea"');
    expect(indexSource).toContain('export * from "./Label"');
    expect(indexSource).toContain('export * from "./Popover"');
  });
});
