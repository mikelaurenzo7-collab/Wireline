import { spawnSync } from "node:child_process";
import process from "node:process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("historical campaign regeneration", () => {
  it("rejects an unqualified render before touching current or historical output", () => {
    const output = resolve("brand-work/exports/identity/botbound-lockup-obsidian-1600x480.png");
    const before = existsSync(output) ? readFileSync(output) : null;
    const archivedOutput = resolve("brand-work/archives/second-ring/exports");
    const archiveExisted = existsSync(archivedOutput);
    const result = spawnSync(process.execPath, ["scripts/render-botbound-launch-assets.mjs"], {
      encoding: "utf8",
      timeout: 10_000,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("The Second Ring renderer is retired");
    expect(result.stderr).toContain("brand-work/CURRENT-ASSET-INDEX.md");
    expect(existsSync(output) ? readFileSync(output) : null).toEqual(before);
    expect(existsSync(archivedOutput)).toBe(archiveExisted);
  });

  it("labels historical regeneration explicitly and isolates its destination", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(pkg.scripts["brand:launch"]).toBeUndefined();
    expect(pkg.scripts["brand:launch:archive"]).toBe(
      "node scripts/render-botbound-launch-assets.mjs --historical-second-ring",
    );
    const renderer = readFileSync("scripts/render-botbound-launch-assets.mjs", "utf8");
    expect(renderer).toContain('const output = resolve(work, "archives/second-ring/exports")');
    expect(renderer).not.toContain('const output = resolve(work, "exports")');
  });
});
