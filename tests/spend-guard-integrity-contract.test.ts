import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveHardSpendCapStatus } from "../src/lib/spend-budget-policy";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("spend guard integrity", () => {
  it("distinguishes an explicit disabled guard from missing or malformed state", () => {
    expect(resolveHardSpendCapStatus({ budget: null, mtdCost: 0 })).toBe("unavailable");
    expect(
      resolveHardSpendCapStatus({
        budget: { enabled: true, hard_cap: true, monthly_limit_usd: 0 },
        mtdCost: 0,
      }),
    ).toBe("unavailable");
    expect(
      resolveHardSpendCapStatus({
        budget: { enabled: true, hard_cap: true, monthly_limit_usd: 10 },
        mtdCost: Number.NaN,
      }),
    ).toBe("unavailable");
    expect(
      resolveHardSpendCapStatus({
        budget: { enabled: false, hard_cap: true, monthly_limit_usd: 0 },
        mtdCost: 100,
      }),
    ).toBe("disabled");
    expect(
      resolveHardSpendCapStatus({
        budget: { enabled: true, hard_cap: false, monthly_limit_usd: 0 },
        mtdCost: 100,
      }),
    ).toBe("disabled");
  });

  it("enforces the persisted hard cap at and above the limit", () => {
    const budget = { enabled: true, hard_cap: true, monthly_limit_usd: 10 };
    expect(resolveHardSpendCapStatus({ budget, mtdCost: 9.999 })).toBe("within_limit");
    expect(resolveHardSpendCapStatus({ budget, mtdCost: 10 })).toBe("exceeded");
    expect(resolveHardSpendCapStatus({ budget, mtdCost: 11 })).toBe("exceeded");
  });

  it("fails provider work closed and repairs legacy rows instead of fabricating UI state", () => {
    const guard = read("src/lib/spend-guards.ts");
    const route = read("src/routes/spend-control-routes.ts");

    expect(guard).toContain("resolveHardSpendCapStatus(snap)");
    expect(guard).toContain('status === "unavailable"');
    expect(guard).toContain('code: "SPEND_GUARD_UNAVAILABLE"');
    expect(guard).toContain('throw new Error("Spend budget is missing or invalid.")');

    expect(route).toContain("ensurePersistedSpendBudget");
    expect(route).toContain("await ensureDefaultAiSpendBudget(userId, subscription?.plan ?? null)");
    expect(route).toContain("Spend guard is temporarily unavailable.");
    expect(route).not.toContain("monthly_limit_usd: 0,");
    expect(route).not.toContain("hard_cap: false,");
  });

  it("backfills only missing budgets and constrains malformed active hard caps", () => {
    const migration = read("drizzle/migrations/0107_backfill_spend_guards.sql");
    const journal = read("drizzle/migrations/meta/_journal.json");

    expect(migration).toContain("ON CONFLICT (user_id) DO NOTHING");
    expect(migration).toContain("THEN 69.60");
    expect(migration).toContain("THEN 38.00");
    expect(migration).toContain("THEN 18.36");
    expect(migration).toContain("THEN 8.68");
    expect(migration).toContain("ELSE 0.50");
    expect(migration).toContain("wireline_spend_budgets_valid_guard");
    expect(migration).toContain("NOT enabled OR NOT hard_cap OR monthly_limit_usd > 0");
    expect(migration).toContain("ALTER COLUMN monthly_limit_usd SET NOT NULL");
    expect(journal).toContain('"tag": "0107_backfill_spend_guards"');
  });
});
