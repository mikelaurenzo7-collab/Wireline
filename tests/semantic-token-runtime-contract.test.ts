import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("semantic token runtime", () => {
  it("keeps generated interaction roles in the foundation layer", () => {
    const foundation = read("src/styles/foundation.css");
    expect(foundation).toContain("--wl-page: var(--wireline-color-canvas-default)");
    expect(foundation).toContain("--wl-overlay-scrim: var(--wireline-color-overlay-scrim)");
    expect(foundation).toContain("--wl-shadow-md: var(--wireline-elevation-md)");
    expect(foundation).toContain("--wl-target-comfortable: var(--wireline-interaction-target-comfortable)");
  });
});
