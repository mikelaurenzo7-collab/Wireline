import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("public marketing information hierarchy", () => {
  const marketingBundle = read("src/styles/wireline-marketing-surfaces.css");
  const hierarchy = read("src/styles/marketing-information-hierarchy.css");
  const trust = read("src/components/marketing/TrustSignals.tsx");

  it("loads the hierarchy pass after the existing public marketing polish", () => {
    const baseIndex = marketingBundle.indexOf("public-marketing-polish.css");
    const hierarchyIndex = marketingBundle.indexOf("marketing-information-hierarchy.css");

    expect(baseIndex).toBeGreaterThanOrEqual(0);
    expect(hierarchyIndex).toBeGreaterThan(baseIndex);
  });

  it("keeps trust-point headings visually distinct from explanatory copy", () => {
    expect(trust).toContain("wl-trust-point__title");
    expect(trust).toContain("wl-trust-point__detail");
    expect(hierarchy).toContain('.wl-trust-point__title');
    expect(hierarchy).toContain("font-size: 1.0625rem");
    expect(hierarchy).toContain("font-weight: 700");
  });

  it("preserves semantic organization for grouped marketing facts", () => {
    expect(hierarchy).toContain(".wl-info-list");
    expect(hierarchy).toContain("list-style: none");
    expect(hierarchy).toContain('content: ""');
  });

  it("gives stacked mobile trust points a visible boundary", () => {
    expect(trust).toContain("wl-trust-point");
    expect(hierarchy).toContain(".wl-trust-point + .wl-trust-point");
    expect(hierarchy).toContain("border-top: 1px solid");
  });
});
