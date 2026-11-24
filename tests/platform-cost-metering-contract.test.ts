import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  defaultAiSpendBudgetUsdForPlan,
  defaultAiSpendBudgetUsdForTier,
  FREE_BUILDER_SIMULATION_ALLOWANCE_USD,
} from "../src/lib/plan-entitlements";
import { planById } from "../src/lib/plan-catalog";

const read = (path: string) => readFileSync(path, "utf8");

/**
 * The plan-entitlements AI-spend envelope claims to fund "provider COGS", and
 * the commercial prose tells customers where each workload draws from. Both
 * were only half-true until platform research was metered: Perplexity ran as
 * invisible COGS outside every budget. These contracts pin the completeness of the envelope and the
 * honesty of the copy that describes it.
 */
describe("platform cost metering contract", () => {
  const middleware = read("src/middleware/audit-middleware.ts");
  const perplexity = read("src/lib/perplexity-platform.ts");

  it("provides a flat-reserve cost record that feeds the same spend pipeline", () => {
    expect(middleware).toContain("export async function persistPlatformCostRecord");
    expect(middleware).toContain("export function platformCostReserveUsd");
    // The record must hit the same ledger and evaluation the token pipeline hits.
    const helper = middleware.slice(
      middleware.indexOf("export async function persistPlatformCostRecord"),
      middleware.indexOf("export function withAudit"),
    );
    expect(helper).toContain("insert(schema.auditLog)");
    expect(helper).toContain("recordDailySpend(opts.costUsd)");
    expect(helper).toContain("evaluateSpend(opts.userId, opts.costUsd)");
  });

  it("meters every Perplexity HTTP surface exactly once, from ambient tenant context", () => {
    expect(perplexity).toContain("tenantStore.getStore()");
    for (const purpose of ["search", "sonar", "agent", "embeddings"]) {
      expect(
        perplexity.match(new RegExp(`meterPerplexityRequests\\("${purpose}"`, "g")),
        purpose,
      ).toHaveLength(1);
    }
  });

  it("keeps the envelope copy telling the implemented story", () => {
    const catalog = read("src/lib/plan-catalog.ts");
    const balance = read("src/lib/conversation-balance.ts");
    const welcome = read("src/lib/subscription-welcome-credit.ts");
    // The Runtime Allowance must no longer claim to fund platform AI/research —
    // those draw from the metered AI envelope.
    for (const source of [catalog, balance, welcome]) {
      expect(source).not.toContain("platform AI/research, enrichment");
    }
    expect(balance).toMatch(
      /Platform AI,\s*\* research, and enrichment use the included managed AI allowance instead/,
    );
    expect(balance).toContain("Runtime Balance funds eligible prepaid extras and voice overflow");
    expect(catalog).toContain("separate from Runtime Allowance and voice");
  });

  it("discloses paid Personal's managed AI envelope in lockstep with exact-plan enforcement", () => {
    const personal = planById("personal")!;
    expect(personal.price_usd_monthly).toBeGreaterThan(0);
    const disclosed = personal.features.find((feature) =>
      feature.includes("monthly managed allowance for AI"),
    );
    expect(disclosed).toBeDefined();
    expect(disclosed).toContain(`$${personal.ai_spend_allowance_usd_monthly.toFixed(2)}`);
    expect(defaultAiSpendBudgetUsdForPlan("personal")).toBe(
      personal.ai_spend_allowance_usd_monthly,
    );
    expect(personal.features.join(" ")).not.toContain("private AI simulation each month");
  });

  it("retains a bounded private simulation allowance for accounts without a paid plan", () => {
    expect(FREE_BUILDER_SIMULATION_ALLOWANCE_USD).toBe(1.5);
    expect(defaultAiSpendBudgetUsdForTier("free")).toBe(FREE_BUILDER_SIMULATION_ALLOWANCE_USD);
    expect(defaultAiSpendBudgetUsdForPlan(null)).toBe(FREE_BUILDER_SIMULATION_ALLOWANCE_USD);
  });
});
