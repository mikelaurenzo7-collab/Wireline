import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/**
 * The money-movement layer (Stripe, ledger, refunds) was already fortress-
 * grade; the exposure was the AI/telephony COGS-metering layer — paths that
 * reached paid providers WITHOUT passing through metering or caps. This
 * contract pins each of those paths closed:
 *
 * - The workspace composer + stream + PDF extraction called Claude with no
 *   cost accounting (invisible to enforceSpendCap and margin analytics) and
 *   the PDF route had no rate limit at all.
 * - Free/trial tenants had no spendBudgets row, so enforceSpendCap passed
 *   everything while the usage UI displayed a fictional "hard cap".
 * - Realtime simulation sessions (Grok + OpenAI) minted vendor-metered
 *   secrets with only a per-minute rate limit — no daily aggregate.
 * - Inbound calls for insolvent tenants ran the full assistant unbounded.
 */
describe("AI cost-protection contract", () => {
  it("workspace composer, stream, and PDF routes are metered and capped", () => {
    const source = read("src/routes/agent-workspace-routes.ts");
    const occurrences = source.match(/withAudit\("workspace"\)/g) || [];
    expect(occurrences.length).toBeGreaterThanOrEqual(3);
    expect(source.match(/enforceSpendCap/g)!.length).toBeGreaterThanOrEqual(4); // import + 3 mounts
    // The PDF route specifically carries the Claude rate limiter now.
    const pdfRoute = source.slice(source.indexOf('"/api/agents/:id/workspace/files"'));
    expect(pdfRoute.slice(0, 600)).toContain("claudeRateLimiter");
  });

  it("signup seeds a real default AI spend budget inside the signup transaction", () => {
    const trialGate = read("src/lib/trial-gate.ts");
    expect(trialGate).toContain("ensureDefaultAiSpendBudget");
    // Must pass the tx executor — seeding on the module drizzle would hit the
    // spend_budgets → users FK against the still-uncommitted user row and
    // silently drop the seed for every password signup.
    expect(trialGate).toContain("ensureDefaultAiSpendBudget(userId, null, tx)");
    const snapshot = read("src/lib/workspace-usage-snapshot.ts");
    expect(snapshot).toMatch(/executor:\s*any\s*=\s*drizzle/);
    // Both the read and the write go through the passed executor (the tx),
    // not the module-level drizzle.
    expect(snapshot).toMatch(/await executor\s*\.insert\(schema\.spendBudgets\)/);
    expect(snapshot).toMatch(/await executor\s*\.select/);
  });

  it("only the auto-seeded free cap is auto-raised; hand-set caps are never overwritten", () => {
    const snapshot = read("src/lib/workspace-usage-snapshot.ts");
    // A budget above the free default is a deliberate Account-Holder choice and
    // must not be silently raised on a plan change, even if it equals a paid
    // tier default.
    expect(snapshot).toContain("isAutoSeededFreeCap");
    expect(snapshot).toMatch(/current <= freeDefault/);
  });

  it("realtime simulation sessions carry a daily minute quota", () => {
    const quotas = read("src/lib/tenant-quotas.ts");
    // Dimension registered, and every tier declares a positive default
    // (5 declarations in PLAN_DEFAULTS + interface + ALL_DIMENSIONS entry).
    const declarations = quotas.match(/simulation_minutes_daily: \d+/g) || [];
    expect(declarations.length).toBe(5);
    for (const declaration of declarations) {
      expect(Number(declaration.split(":")[1])).toBeGreaterThan(0);
    }
    expect(quotas).toContain('"simulation_minutes_daily",');
    expect(read("src/routes/grok-voice-routes.ts")).toContain("simulationMinuteQuota");
    expect(read("src/routes/openai-realtime-routes.ts")).toContain("simulationMinuteQuota");
  });

  it("deep completion-grace debt routes inbound to a bounded take-a-message assistant", () => {
    const webhook = read("src/routes/vapi-v2.ts");
    expect(webhook).toContain("INBOUND_TAKE_MESSAGE_GRACE_USD");
    expect(webhook).toContain("getVoiceWalletSnapshot");
    const takeMessage = webhook.slice(webhook.indexOf("INBOUND_TAKE_MESSAGE_GRACE_USD"));
    expect(takeMessage.slice(0, 2000)).toContain("maxDurationSeconds");
  });
});
