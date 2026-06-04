/**
 * Post-migration design audit — locks in Composer-grade app chrome.
 * Counts anti-patterns in feature components (excludes shadcn layer + marketing pages).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COMPONENTS_ROOT = path.resolve(__dirname, "../../../components");
const EXCLUDED_DIRS = [
  path.resolve(__dirname, "../shadcn"),
  __dirname,
  path.resolve(COMPONENTS_ROOT, "marketing"),
];

function walk(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (EXCLUDED_DIRS.some((ex) => full === ex || full.startsWith(ex + path.sep))) continue;
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.(tsx|ts)$/.test(entry.name) && !/\.test\.(tsx?|spec\.tsx?)$/.test(entry.name))
      acc.push(full);
  }
  return acc;
}

function countInComponents(pattern: RegExp): number {
  let total = 0;
  for (const file of walk(COMPONENTS_ROOT)) {
    const text = fs.readFileSync(file, "utf8");
    const matches = text.match(pattern);
    if (matches) total += matches.length;
  }
  return total;
}

describe("wireline design audit (app components)", () => {
  it("has no aurora-ring in authenticated app components", () => {
    expect(countInComponents(/\baurora-ring\b/g)).toBe(0);
  });

  it("has no brutal-btn in app components", () => {
    expect(countInComponents(/\bbrutal-btn\b/g)).toBe(0);
  });
});
