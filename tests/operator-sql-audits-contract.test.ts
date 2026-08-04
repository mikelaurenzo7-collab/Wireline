import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("operator SQL audits", () => {
  it("keeps the Stripe reversal audit read-only and human-reviewed", () => {
    const audit = read("scripts/sql/audit-stripe-runtime-allowance-reversal-gaps.sql");

    expect(audit).toContain("Read-only Stripe Runtime Allowance reconciliation");
    expect(audit).toContain("operator review queue, not an automatic correction");
    expect(audit).toContain("Never insert an ad hoc debit from this report alone");
    expect(audit).toContain("SELECT");
    expect(audit).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|CREATE)\b/i);
  });
});
