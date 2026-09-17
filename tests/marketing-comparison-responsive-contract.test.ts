import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const comparePage = readFileSync("src/pages/Compare.tsx", "utf8");

describe("marketing comparison responsive contract", () => {
  it("contains the wide comparison table inside a viewport-constrained scroller", () => {
    expect(comparePage).toContain('className="mx-auto w-full min-w-0 max-w-6xl"');
    expect(comparePage).toContain(
      'className="wl-focus-ring-halo mt-8 w-full max-w-full overflow-x-auto border border-border bg-card"',
    );
    expect(comparePage).toContain('className="w-full min-w-[900px] border-collapse text-left"');
    expect(comparePage).toContain('role="region"');
    expect(comparePage).toContain(
      'aria-label="Plan comparison, scroll horizontally for more columns"',
    );
    expect(comparePage).toContain("tabIndex={0}");
    expect(comparePage).toContain('scope="col"');
    expect(comparePage).toContain('scope="row"');
  });
});
