import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Token reference integrity — every `var(--wireline-…)` used without a
 * fallback must resolve to a custom property that some stylesheet (or an
 * inline style object) actually defines.
 *
 * This class of defect is invisible in review and silent at runtime: an
 * undefined custom property makes the whole declaration invalid, so the
 * border, background, or color simply does not render. One audit found a
 * parallel phantom namespace (--wireline-line, --wireline-muted,
 * --wireline-signal, --wireline-color-text-on-action, …) across 20+ files
 * — the guided-setup dialog shipped with no borders or surfaces at all.
 */

const ROOT = process.cwd();
const SOURCE_EXTENSIONS = /\.(?:ts|tsx|css)$/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return SOURCE_EXTENSIONS.test(entry) ? [full] : [];
  });
}

const sourceFiles = walk(resolve(ROOT, "src"));

const definedNames = new Set<string>();
const DEFINITION_IN_CSS = /(?:^|[{;\s])(--wireline-[a-zA-Z0-9-]+)\s*:/g;
const DEFINITION_IN_STYLE_OBJECT = /["'](--wireline-[a-zA-Z0-9-]+)["']\s*:/g;

for (const file of sourceFiles) {
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(DEFINITION_IN_CSS)) definedNames.add(match[1]);
  for (const match of text.matchAll(DEFINITION_IN_STYLE_OBJECT)) definedNames.add(match[1]);
}

// A reference immediately closed by `)` has no fallback; `,` carries one and
// may intentionally lean on it (e.g. z-index escape hatches).
const FALLBACKLESS_REFERENCE = /var\(\s*(--wireline-[a-zA-Z0-9-]+)\s*\)/g;

describe("design token reference integrity", () => {
  it("collects the generated token set", () => {
    // Guard against the scan itself breaking: the canonical tokens must be in.
    expect(definedNames.has("--wireline-color-action-primary-default")).toBe(true);
    expect(definedNames.has("--wireline-color-text-onAction")).toBe(true);
    expect(definedNames.size).toBeGreaterThan(100);
  });

  it("finds no fallback-less reference to an undefined --wireline custom property", () => {
    const unresolved: string[] = [];
    for (const file of sourceFiles) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(FALLBACKLESS_REFERENCE)) {
        if (!definedNames.has(match[1])) {
          const line = text.slice(0, match.index).split("\n").length;
          unresolved.push(`${file.slice(ROOT.length + 1)}:${line} → ${match[1]}`);
        }
      }
    }
    expect(unresolved).toEqual([]);
  });
});
