import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("client bundle release budgets", () => {
  it("caps first-load transfer, entry assets, lazy chunks, and public source maps", () => {
    const budget = read("scripts/check-client-bundle-budgets.mjs");

    expect(budget).toContain("initialTransferGzip: 320 * KIB");
    expect(budget).toContain("entryJavaScriptGzip: 80 * KIB");
    expect(budget).toContain("entryCssGzip: 90 * KIB");
    expect(budget).toContain("largestLazyJavaScriptGzip: 160 * KIB");
    expect(budget).toContain("largestRawAsset: 600 * KIB");
    expect(budget).toContain('name.endsWith(".map")');
    expect(budget).toContain("gzipSync");
    expect(budget).toContain("process.exit(1)");
  });
});
