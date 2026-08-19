import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { globSync } from "glob";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const runtimePatterns = [
  "src/components/**/*.tsx",
  "src/pages/**/*.tsx",
  "src/data/**/*.ts",
  "src/lib/**/*.ts",
  "apps/browser-extension/**/*.{html,js,json}",
] as const;

const explicitCompatibilityFiles = new Set([
  "src/lib/brand.ts",
]);

describe("BotBound visible-brand sweep", () => {
  it("does not leak the retired standalone Wireline customer name through runtime surfaces", () => {
    const files = runtimePatterns
      .flatMap((pattern) => globSync(pattern, { cwd: root }))
      .map((file) => file.replaceAll("\\", "/"))
      .filter((file, index, all) => all.indexOf(file) === index)
      .filter((file) => !explicitCompatibilityFiles.has(file))
      .sort();

    const leaks: string[] = [];
    for (const file of files) {
      const source = withoutComments(read(file));
      const matches = [...source.matchAll(/\bWireline\b/g)];
      if (!matches.length) continue;
      const lines = source.split("\n");
      for (const match of matches) {
        const before = source.slice(0, match.index ?? 0);
        const line = before.split("\n").length;
        const excerpt = (lines[line - 1] ?? "").trim().replace(/\s+/g, " ").slice(0, 180);
        leaks.push(`${file}:${line} ${excerpt}`);
      }
    }

    expect(
      leaks,
      `Customer-facing runtime still contains the retired standalone Wireline name:\n${leaks.join("\n")}`,
    ).toEqual([]);
  });

  it("keeps BotBound explicit in the canonical brand, metadata, shell, and install surfaces", () => {
    for (const path of [
      "src/lib/brand.ts",
      "src/lib/page-meta.tsx",
      "src/components/WorkspaceShell.tsx",
      "src/components/brand/BotBoundBrand.tsx",
      "src/components/brand/BotBoundMark.tsx",
      "index.html",
      "public/site.webmanifest",
      "public/botbound-icon.svg",
    ]) {
      expect(read(path), path).toContain("BotBound");
    }
  });
});
