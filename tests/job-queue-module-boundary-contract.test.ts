import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcRoot = fileURLToPath(new URL("../src/", import.meta.url));
const facadePath = join(srcRoot, "lib", "job-queue.ts");
const basePath = join(srcRoot, "lib", "job-queue-base.ts");
const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".cts"]);

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(absolute);
    return sourceExtensions.has(extname(entry.name)) ? [absolute] : [];
  });
}

describe("durable job queue module boundary", () => {
  it("does not wildcard-export unsafe base consumer helpers", () => {
    const facade = readFileSync(facadePath, "utf8");

    expect(facade).not.toContain('export * from "./job-queue-base"');
    expect(facade).toContain("export async function completeClaimedJob");
    expect(facade).toContain("export async function claimJob");
    expect(facade).toContain("export async function failJob");

    const publicExportSection = facade.slice(0, facade.indexOf("export type JobType"));
    expect(publicExportSection).not.toMatch(/\bcompleteJob\b/);
    expect(publicExportSection).not.toMatch(/\bclaimJobById\b/);
    expect(publicExportSection).not.toMatch(/\brecoverStaleJobs\b/);
    expect(publicExportSection).not.toMatch(/\bstartWorker\b/);
  });

  it("keeps production imports on the attempt-fenced facade", () => {
    const offenders = collectSourceFiles(srcRoot)
      .filter((path) => path !== facadePath && path !== basePath)
      .filter((path) => readFileSync(path, "utf8").includes("job-queue-base"))
      .map((path) => relative(srcRoot, path));

    expect(offenders).toEqual([]);
  });
});
