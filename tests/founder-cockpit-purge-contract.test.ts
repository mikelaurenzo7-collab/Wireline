import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

const FORBIDDEN_PATTERNS = [
  /founder-cockpit-routes/,
  /require-founder-cockpit/,
  /founder-cockpit-access/,
  /FounderOperatingCockpit/,
  /FounderDashboardPage/,
  /FounderOperatorConsole/,
  /operating-cockpit/,
  /canAccessFounderCockpit/,
  /requireFounderCockpit/,
  /founder_cockpit/,
  /FOUNDER_COCKPIT_/,
  /\/api\/founder\//,
  /path="\/founder"/,
  /Founder cockpit/,
];

const ALLOWLIST = new Set([
  "tests/founder-cockpit-purge-contract.test.ts",
  "src/lib/founder-bootstrap.ts",
  "src/lib/founder-fleet-seed.ts",
  "scripts/seed-founder-fleet.mts",
  "src/routes/admin-seed-demo-routes.ts",
]);

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = full.slice(root.length + 1).replace(/\\/g, "/");
    if (entry === "node_modules" || entry === ".git" || entry === "dist" || entry === "artifacts") {
      continue;
    }
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, acc);
      continue;
    }
    if (!/\.(ts|tsx|js|mjs|jsx)$/.test(entry)) continue;
    acc.push(rel);
  }
  return acc;
}

function scanTree(relativeDir: string) {
  const offenders: string[] = [];
  const base = resolve(root, relativeDir);
  if (!statSync(base, { throwIfNoEntry: false })?.isDirectory()) return offenders;
  for (const file of walk(base)) {
    if (ALLOWLIST.has(file)) continue;
    const content = readFileSync(resolve(root, file), "utf8");
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(content)) offenders.push(`${file} matches ${pattern}`);
    }
  }
  return offenders;
}

describe("founder cockpit purge contract", () => {
  it("removes founder cockpit code from src/", () => {
    expect(scanTree("src")).toEqual([]);
  }, 20_000);

  it("removes founder cockpit tests from tests/", () => {
    expect(scanTree("tests")).toEqual([]);
  }, 20_000);

  it("does not mount founder cockpit APIs in the route registry", () => {
    const registry = readFileSync(resolve(root, "src/server/register-api-routes.ts"), "utf8");
    expect(registry).not.toMatch(/founderCockpitRouter|founder-cockpit-routes/);
  });

  it("does not register a /founder product route", () => {
    const routes = readFileSync(resolve(root, "src/routes/AppRoutes.tsx"), "utf8");
    expect(routes).not.toContain('path="/founder"');
    expect(routes).not.toContain("FounderDashboardPage");
  });
});
