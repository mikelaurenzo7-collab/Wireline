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
 */
const BASELINE = {
  rawButton: 394, // <button> outside ui/shadcn/*
  rawInput: 0, //  <input> outside ui/shadcn/*; fully migrated to shadcn Input/Checkbox/Slider. Stays at 0 forever.
  rawSelect: 0, // <select> outside ui/shadcn/*; fully migrated to shadcn Select. Stays at 0 forever.
  rawDialog: 0, //  <dialog>; we never use the native element. Stays at 0 forever.
  glassUtility: 467, // .glass utility usage; migrate to <Card>
  largeRadius: 854, // rounded-{lg|xl|2xl|3xl} literals (global reset makes them no-ops)
} as const;

describe("shadcn pivot ratchet", () => {
  it("never grows raw <button> usage", () => {
    expect(countOccurrences(/<button(?=[\s>])/g)).toBeLessThanOrEqual(BASELINE.rawButton);
  });

  it("never grows raw <input> usage", () => {
    expect(countOccurrences(/<input(?=[\s>])/g)).toBeLessThanOrEqual(BASELINE.rawInput);
  });

  it("never grows raw <select> usage", () => {
    expect(countOccurrences(/<select(?=[\s>])/g)).toBeLessThanOrEqual(BASELINE.rawSelect);
  });

  it("blocks the native <dialog> element entirely", () => {
    expect(countOccurrences(/<dialog(?=[\s>])/g)).toBeLessThanOrEqual(BASELINE.rawDialog);
  });

  it("never grows .glass utility usage", () => {
    // Match the bare utility class only, not unrelated identifiers
    // like `glassmorphism` or `useGlass`.
    expect(countOccurrences(/\bglass(?!\w)/g)).toBeLessThanOrEqual(BASELINE.glassUtility);
  });

  it("never grows rounded-{lg|xl|2xl|3xl} literals", () => {
    expect(countOccurrences(/\brounded-(lg|xl|2xl|3xl)\b/g)).toBeLessThanOrEqual(
      BASELINE.largeRadius,
    );
  });
});
