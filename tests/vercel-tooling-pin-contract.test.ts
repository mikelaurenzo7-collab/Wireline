import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const dependabot = readFileSync(resolve(root, ".github/dependabot.yml"), "utf8");
const deployGuide = readFileSync(resolve(root, "DEPLOY.md"), "utf8");

function majorFromCaret(range: string | undefined): number | null {
  if (!range) return null;
  const match = String(range).match(/\^?(\d+)\./);
  return match ? Number(match[1]) : null;
}

describe("Vercel-compatible tooling pins", () => {
  it("keeps TypeScript, Vite, and @types/node on majors proven with the Vercel function step", () => {
    const dev = packageJson.devDependencies || {};
    expect(majorFromCaret(dev.typescript)).toBe(6);
    expect(majorFromCaret(dev.vite)).toBe(6);
    expect(majorFromCaret(dev["@types/node"])).toBe(22);
    expect(String(packageJson.engines?.node || "")).toMatch(/22/);
  });

  it("blocks Dependabot major bumps that previously broke Vercel previews", () => {
    for (const name of ["typescript", "vite", "@vitejs/plugin-react", "@types/node"]) {
      expect(dependabot).toContain(`dependency-name: "${name}"`);
    }
    expect(dependabot).toContain('update-types: ["version-update:semver-major"]');
    // Guard the historical failure mode so the ignore is not deleted casually.
    expect(dependabot).toContain("reading 'readFile'");
    expect(dependabot).toContain("TS 7");
  });

  it("documents the single canonical Vercel project and tooling major policy", () => {
    expect(deployGuide).toContain("Only `revaluate/wireline` may be linked");
    expect(deployGuide).toContain("Vercel – workspace");
    expect(deployGuide).toContain("TypeScript 7.0.2");
    expect(deployGuide).toContain("local user-provided");
  });
});
