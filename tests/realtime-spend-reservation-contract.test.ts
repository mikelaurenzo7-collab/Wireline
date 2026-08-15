import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("realtime spend reservation contract", () => {
  it("locks the tenant budget, reads fresh spend, and debits before provider work", () => {
    const accounting = read("src/middleware/audit-middleware.ts");
    const reserve = accounting.slice(
      accounting.indexOf("export async function reservePlatformCostRecord"),
      accounting.indexOf("export async function releasePlatformCostReservation"),
    );

    expect(reserve).toContain('.for("update")');
    expect(reserve).toContain("monthToDateUsd + opts.costUsd > monthlyLimitUsd");
    expect(reserve).toContain("insert(schema.auditLog)");
    expect(reserve).toContain('accounting_state: "reserved_before_provider"');
    expect(reserve.indexOf("monthToDateUsd + opts.costUsd")).toBeLessThan(
      reserve.indexOf("insert(schema.auditLog)"),
    );
  });

  it("returns rejected quota only for definitive no-session outcomes", () => {
    const helper = read("src/lib/realtime-spend-reservation.ts");
    const quota = read("src/lib/tenant-quotas.ts");
    const limiter = read("src/middleware/api-rate-limits.ts");

    expect(helper).toContain("error instanceof AppError && error.status === 502");
    expect(helper).toContain("Promise.allSettled");
    expect(helper).toContain("releasePlatformCostReservation(reservation)");
    expect(helper).toContain("releaseSimulationMinuteQuota(req)");
    expect(quota).toContain("async releaseUsage(");
    expect(quota).toContain("periodKey?: string");
    expect(quota).toContain("reservedPeriodKey");
    expect(quota).toContain("greatest(${schema.quotaUsage.used}");
    expect(limiter).toContain("wirelineSimulationQuotaReservation");
    expect(limiter).toContain("periodKey: decision.period_key");
  });

  it("validates request bodies before consuming a five-minute quota reservation", () => {
    for (const path of [
      "src/routes/openai-realtime-routes.ts",
      "src/routes/grok-voice-routes.ts",
    ]) {
      const route = read(path);
      const sessionRoute = route.slice(route.indexOf('"/api/voice/'));
      expect(sessionRoute.indexOf("validateBody(")).toBeGreaterThan(-1);
      expect(sessionRoute.indexOf("validateBody(")).toBeLessThan(
        sessionRoute.indexOf("simulationMinuteQuota,"),
      );
    }
  });

  it("reserves ChatGPT MCP simulation spend before minting and refunds definitive failures", () => {
    const route = read("src/routes/chatgpt-mcp-account-routes.ts");
    const reserve = route.indexOf("reservePlatformCostRecord({");
    const provider = route.indexOf("createOpenAIRealtimeClientSecret({");

    expect(reserve).toBeGreaterThan(-1);
    expect(reserve).toBeLessThan(provider);
    expect(route).not.toContain("persistPlatformCostRecord({");
    expect(route).toContain("releasePlatformCostReservation(spendDecision.reservation)");
    expect(route).toContain("quota.period_key");
    expect(route).toContain("commitPlatformCostReservation(spendDecision.reservation)");
  });
});
