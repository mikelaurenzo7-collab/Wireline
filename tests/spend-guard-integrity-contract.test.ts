import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveAiDailySpendAlertUsd } from "../src/lib/ai-spend-alert";
import {
  defaultAiSpendBudgetUsdForTier,
  FREE_BUILDER_SIMULATION_ALLOWANCE_USD,
  subscriptionPlanToTier,
} from "../src/lib/plan-entitlements";
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
    expect(guard).toContain('recovery_path: "/settings/billing"');
    expect(guard).not.toContain("Increase or disable the cap");

    expect(route).toContain("ensurePersistedSpendBudget");
    expect(route).toContain("await ensureDefaultAiSpendBudget(userId, planId)");
    expect(route).toContain("Spend guard is temporarily unavailable.");
    expect(route).not.toContain("monthly_limit_usd: 0,");
    expect(route).not.toContain("hard_cap: false,");
  });

  it("funds a deliberate Free Builder simulation allowance without changing paid envelopes", () => {
    expect(FREE_BUILDER_SIMULATION_ALLOWANCE_USD).toBe(1.5);
    expect(defaultAiSpendBudgetUsdForTier("free")).toBe(1.5);
    expect(defaultAiSpendBudgetUsdForTier("personal")).toBe(8.68);
    expect(defaultAiSpendBudgetUsdForTier("team")).toBe(18.36);
    expect(defaultAiSpendBudgetUsdForTier("business")).toBe(37.36);
    expect(defaultAiSpendBudgetUsdForTier("enterprise")).toBe(69.6);
    expect(subscriptionPlanToTier("definitely-not-a-plan")).toBe("free");

    const route = read("src/routes/spend-control-routes.ts");
    expect(route).toContain('type SpendGuardScope = "plan_funded" | "free_simulation_allowance"');
    expect(route).toContain('guardScope === "free_simulation_allowance"');
    expect(route).toContain("live_provider_work_enabled: liveProviderWorkEnabled");
    expect(route).toContain("Wireline could not resolve the active plan");

    const migration = read("drizzle/migrations/0134_free_builder_simulation_allowance.sql");
    const journal = read("drizzle/migrations/meta/_journal.json");
    expect(migration).toContain("ALTER COLUMN monthly_limit_usd SET DEFAULT 1.50");
    expect(migration).toContain("managed_default = true");
    expect(migration).toContain("monthly_limit_usd = 0.50");
    expect(migration).toContain("monthly_limit_usd = 1.50");
    expect(migration).toContain("NOT EXISTS");
    expect(journal).toContain('"tag": "0134_free_builder_simulation_allowance"');
  });

  it("keeps AI spend telemetry provider-neutral with exact legacy behavior", () => {
    expect(
      resolveAiDailySpendAlertUsd({
        WIRELINE_AI_DAILY_ALERT_USD: "12.5",
        CLAUDE_DAILY_ALERT_USD: "900",
        CLAUDE_MONTHLY_BUDGET_USD: "400",
      }),
    ).toBe(12.5);
    expect(
      resolveAiDailySpendAlertUsd({
        WIRELINE_AI_DAILY_ALERT_USD: undefined,
        CLAUDE_DAILY_ALERT_USD: "900",
        CLAUDE_MONTHLY_BUDGET_USD: "400",
      }),
    ).toBe(9);
    expect(
      resolveAiDailySpendAlertUsd({
        WIRELINE_AI_DAILY_ALERT_USD: undefined,
        CLAUDE_DAILY_ALERT_USD: undefined,
        CLAUDE_MONTHLY_BUDGET_USD: "400",
      }),
    ).toBe(4);
    expect(
      resolveAiDailySpendAlertUsd({
        WIRELINE_AI_DAILY_ALERT_USD: "not-a-number",
        CLAUDE_DAILY_ALERT_USD: "800",
        CLAUDE_MONTHLY_BUDGET_USD: "400",
      }),
    ).toBe(0);
    expect(
      resolveAiDailySpendAlertUsd({
        WIRELINE_AI_DAILY_ALERT_USD: "-10",
        CLAUDE_DAILY_ALERT_USD: undefined,
        CLAUDE_MONTHLY_BUDGET_USD: undefined,
      }),
    ).toBe(0);
    expect(
      resolveAiDailySpendAlertUsd({
        WIRELINE_AI_DAILY_ALERT_USD: " ",
        CLAUDE_DAILY_ALERT_USD: "",
        CLAUDE_MONTHLY_BUDGET_USD: undefined,
      }),
    ).toBe(0);

    const guard = read("src/lib/spend-guards.ts");
    expect(guard).toContain("resolveAiDailySpendAlertUsd()");
    expect(guard).toContain("Daily AI spend alert threshold crossed");
    expect(guard).not.toContain("Daily Claude spend alert threshold crossed");
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

  it("claims each threshold alert once per period before dispatching", () => {
    const guard = read("src/lib/spend-guards.ts");
    const migration = read("drizzle/migrations/0128_spend_alerts_threshold_dedup.sql");
    const journal = read("drizzle/migrations/meta/_journal.json");

    // The webhook only fires when this request actually inserted the alert
    // row; a conflicting concurrent or repeated evaluation skips dispatch.
    expect(guard).toContain(".onConflictDoNothing()");
    expect(guard).toContain(".returning({ id: schema.spendAlerts.id })");
    expect(guard).toContain("if (!claimed) continue;");
    expect(migration).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS uq_spend_alerts_user_period_threshold",
    );
    expect(migration).toContain("a.id > b.id");
    expect(journal).toContain('"tag": "0128_spend_alerts_threshold_dedup"');
  });
});
