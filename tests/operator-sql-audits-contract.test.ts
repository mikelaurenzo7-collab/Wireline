import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("operator SQL audits", () => {
  it("documents the Stripe reversal audit as read-only human review", () => {
    const index = read("scripts/sql/README.md");
    expect(index).toContain("audit-stripe-runtime-allowance-reversal-gaps.sql");
    expect(index).toContain("read-only diagnostics");
    expect(index).toContain("review candidate");
    expect(index).toContain("Never mutate customer balance directly from this report");
  });
});
