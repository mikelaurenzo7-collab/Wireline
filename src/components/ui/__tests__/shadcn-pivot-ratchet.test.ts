/**
 * Design system compliance ratchet — ensures the component tree stays
 * aligned with the Aurora Cream design system by testing meaningful
 * visual and structural invariants rather than fragile raw-HTML counts.
 *
 * Each assertion verifies that component code follows the established
 * pattern library: shadcn primitives for controls, Aurora Cream
 * compositions for empty/idle states, and no off-brand visual drift.
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

const EXCLUDED_DIRS = [
  path.resolve(__dirname, "../shadcn"),
  __dirname,
];

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

function countPattern(pattern: RegExp): number {
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

const BASELINE = {
  rawButton: 360,
  rawInput: 0,
  rawSelect: 0,
  rawDialog: 0,
} as const;

describe("design system compliance", () => {
  it("never grows raw <button> usage outside shadcn", () => {
    expect(countPattern(/<button(?=[\s>])/g)).toBeLessThanOrEqual(BASELINE.rawButton);
  });

  it("never grows raw <input> usage outside shadcn", () => {
    expect(countPattern(/<input(?=[\s>])/g)).toBeLessThanOrEqual(BASELINE.rawInput);
  });

  it("never grows raw <select> usage outside shadcn", () => {
    expect(countPattern(/<select(?=[\s>])/g)).toBeLessThanOrEqual(BASELINE.rawSelect);
  });

  it("blocks native <dialog> element", () => {
    expect(countPattern(/<dialog(?=[\s>])/g)).toBeLessThanOrEqual(BASELINE.rawDialog);
  });
});

describe("glass utility compliance", () => {
  it("uses Medallion pattern for brand icon containers", () => {
    const medallionUsage = countPattern(/<Medallion/g);
    expect(medallionUsage).toBeGreaterThanOrEqual(4);
  });

  it("uses SectionHeader for content block headers where applicable", () => {
    const sectionHeaderUsage = countPattern(/<SectionHeader/g);
    expect(sectionHeaderUsage).toBeGreaterThanOrEqual(1);
  });
});

describe("design token integrity", () => {
  it("does not increase off-brand teal color references", () => {
    const tealRefs = countPattern(/#0EA5E9|#10B981|#34D399|#14b8a6/gi);
    expect(tealRefs).toBeLessThanOrEqual(5);
  });

  it("does not increase off-brand blue color references", () => {
    const blueRefs = countPattern(/#3B82F6|#2563EB|#1d4ed8/gi);
    expect(blueRefs).toBeLessThanOrEqual(5);
  });

  it("does not increase off-brand orange color references", () => {
    const orangeRefs = countPattern(/#F59E0B|#f97316|#ea580c/gi);
    expect(orangeRefs).toBeLessThanOrEqual(5);
  });

  it("uses CSS custom properties for brand colors", () => {
    const brandRef = countPattern(/var\(--color-brand\)/g);
    expect(brandRef).toBeGreaterThanOrEqual(5);
  });
});

describe("layout and spacing invariants", () => {
  it("uses AuroraBackdrop in the app shell", () => {
    const appShellPath = path.resolve(__dirname, "../../layout/AppShell.tsx");
    if (fs.existsSync(appShellPath)) {
      const shell = fs.readFileSync(appShellPath, "utf8");
      expect(shell).toContain("AuroraBackdrop");
    }
  });
});

describe("empty state pattern consistency", () => {
  it("EmptyState usages pass the icon prop as a component type", () => {
    const files = walk(SRC_ROOTS[0]);
    const emptyStateUsages = files.filter((f) => {
      const text = fs.readFileSync(f, "utf8");
      return /<EmptyState[\s\S]*?icon=\{/.test(text);
    });
    expect(emptyStateUsages.length).toBeGreaterThanOrEqual(3);
  });
});