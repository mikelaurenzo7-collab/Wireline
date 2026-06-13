import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

const SCAN_ROOTS = [
  path.join(ROOT, "src"),
  path.join(ROOT, "docs"),
  path.join(ROOT, ".github", "skills"),
  path.join(ROOT, "DESIGN.md"),
] as const;

const ALLOWED_COMPAT_FILES = new Set([
  path.normalize(path.join(ROOT, "src", "styles", "wireline-controlled-cream-purple.css")),
  path.normalize(path.join(ROOT, "src", "components", "layout", "AuroraBackdrop.tsx")),
  path.normalize(path.join(ROOT, "src", "components", "marketing", "MarketingAuroraBackdrop.tsx")),
]);

const EXCLUDED_PATH_PARTS = [
  `${path.sep}node_modules${path.sep}`,
  `${path.sep}dist${path.sep}`,
  `${path.sep}build${path.sep}`,
  `${path.sep}.git${path.sep}`,
  `${path.sep}.vercel${path.sep}`,
  `${path.sep}coverage${path.sep}`,
];

function walk(target: string, acc: string[] = []): string[] {
  if (!fs.existsSync(target)) return acc;
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    if (/\.(tsx?|css|md)$/.test(target)) acc.push(path.normalize(target));
    return acc;
  }
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    const full = path.join(target, entry.name);
    if (EXCLUDED_PATH_PARTS.some((part) => full.includes(part))) continue;
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.(tsx?|css|md)$/.test(entry.name)) acc.push(path.normalize(full));
  }
  return acc;
}

function scanFiles() {
  return SCAN_ROOTS.flatMap((root) => walk(root)).filter(
    (file, index, all) => all.indexOf(file) === index && !file.endsWith("wireline-brand-bleed-regression.test.ts"),
  );
}

function findOffenders(pattern: RegExp, options?: { excludeCompat?: boolean }) {
  const offenders: string[] = [];
  for (const file of scanFiles()) {
    if (options?.excludeCompat && ALLOWED_COMPAT_FILES.has(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    if (pattern.test(text)) offenders.push(path.relative(ROOT, file));
  }
  return offenders;
}

function escapedPhrase(parts: string[]) {
  return new RegExp(parts.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*"), "i");
}

describe("wireline brand bleed regression guard", () => {
  it("does not reintroduce the old Aurora Cream design rule", () => {
    const phrase = escapedPhrase(["Aurora", "Cream"]);
    expect(findOffenders(phrase)).toEqual([]);
  });

  it("does not reintroduce drifting violet orb/backdrop language", () => {
    const forbidden = [
      escapedPhrase(["drifting", "violet"]),
      escapedPhrase(["brand", "violet", "aurora"]),
      escapedPhrase(["large", "violet", "orbs"]),
      escapedPhrase(["full", "page", "purple", "bleed"]),
      escapedPhrase(["purple", "haze"]),
    ];

    const offenders = forbidden.flatMap((pattern) => findOffenders(pattern, { excludeCompat: true }));
    expect([...new Set(offenders)]).toEqual([]);
  });

  it("keeps legacy aurora-named visual classes contained to the compatibility layer", () => {
    const offenders = findOffenders(/\bwl-aurora-(?:field|orb|dark-base|grain|top-highlight)\b/g, {
      excludeCompat: true,
    });
    expect(offenders).toEqual([]);
  });

  it("keeps active shells importing the controlled backdrop components", () => {
    expect(findOffenders(/import\s+AuroraBackdrop\s+from\s+["'][^"']+AuroraBackdrop["']/g)).toEqual([]);
    expect(
      findOffenders(/import\s+MarketingAuroraBackdrop\s+from\s+["'][^"']+MarketingAuroraBackdrop["']/g),
    ).toEqual([]);
  });
});
