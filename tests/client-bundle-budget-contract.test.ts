import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("client bundle release budgets", () => {
  it("measures the generated client artifacts in every canonical Vercel build", () => {
    const deploy = read("scripts/vercel-deploy.mjs");
    const smoke = read("scripts/smoke-public-health-bundle.mjs");

    expect(deploy).toContain('run(process.execPath, ["scripts/smoke-public-health-bundle.mjs"])');
    expect(smoke).toContain('await import("./check-client-bundle-budgets.mjs")');
    expect(smoke.indexOf("public health bundle imports with a callable handler")).toBeLessThan(
      smoke.indexOf("check-client-bundle-budgets.mjs"),
    );
  });

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
