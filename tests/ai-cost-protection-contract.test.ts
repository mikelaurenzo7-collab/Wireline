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
    const pdfRoute = source.slice(source.indexOf('"/api/agents/:id/workspace/files"'));
    expect(pdfRoute.slice(0, 600)).toContain("claudeRateLimiter");
  });

  it("signup seeds a real default AI spend budget inside the signup transaction", () => {
    const trialGate = read("src/lib/trial-gate.ts");
    expect(trialGate).toContain("ensureDefaultAiSpendBudget");
    expect(trialGate).toContain("ensureDefaultAiSpendBudget(userId, null, tx)");
    const snapshot = read("src/lib/workspace-usage-snapshot.ts");
    expect(snapshot).toMatch(/executor:\s*any\s*=\s*drizzle/);
    expect(snapshot).toMatch(/await executor\s*\.insert\(schema\.spendBudgets\)/);
    expect(snapshot).toMatch(/await executor\s*\.select/);
  });

  it("moves only managed defaults, preserves customer limits, and repairs disabled caps", () => {
    const snapshot = read("src/lib/workspace-usage-snapshot.ts");
    const routes = read("src/routes/spend-control-routes.ts");
    const entitlements = read("src/lib/plan-entitlements.ts");
    const validation = read("src/lib/api-validation-base.ts");
    const stripeHelpers = read("src/lib/stripe-helpers.ts");
    expect(snapshot).toContain("existing.managedDefault === true");
    expect(snapshot).toContain("managedDefault\n      ? limit");
    expect(routes).toContain("managedDefault: false");
    expect(read("drizzle/migrations/0118_spend_budget_managed_default.sql")).toContain(
      "managed_default boolean NOT NULL DEFAULT false",
    );
    expect(snapshot).toContain("Math.min(current, limit)");
    expect(snapshot).toContain("existing.hardCap === true");
    expect(routes).toContain("limit > maximumLimitUsd");
    expect(routes).toContain("The provider spend guard is always enabled with a hard cap.");
    expect(entitlements).toContain('status === "active" || status === "trialing"');
    expect(stripeHelpers).toMatch(
      /stripeStatus === "active" \|\| stripeStatus === "trialing"[\s\S]*spendBudgetPlanId/,
    );
    expect(stripeHelpers).toContain(
      "await ensureDefaultAiSpendBudget(userId, spendBudgetPlanId)",
    );
    expect(validation).toContain("hard_cap: z.boolean().default(true)");
  });

  it("realtime simulation sessions carry a daily minute quota", () => {
    const quotas = read("src/lib/tenant-quotas.ts");
    const declarations = quotas.match(/simulation_minutes_daily: \d+/g) || [];
    expect(declarations.length).toBe(5);
    for (const declaration of declarations) {
      expect(Number(declaration.split(":")[1])).toBeGreaterThan(0);
    }
    expect(quotas).toContain('"simulation_minutes_daily",');
    expect(read("src/routes/grok-voice-routes.ts")).toContain("simulationMinuteQuota");
    expect(read("src/routes/openai-realtime-routes.ts")).toContain("simulationMinuteQuota");
  });

  it("deep completion-grace debt routes inbound to a durable bounded take-a-message assistant", () => {
    const webhook = read("src/routes/vapi-v2.ts");
    expect(webhook).toContain("INBOUND_TAKE_MESSAGE_GRACE_USD");
    expect(webhook).toContain("getVoiceWalletSnapshot");
    expect(webhook).toContain("buildDurableTakeMessageAssistant(webhookAgentId, agentVoiceName)");

    const helperStart = webhook.indexOf("function buildDurableTakeMessageAssistant");
    const routeStart = webhook.indexOf('router.post("/api/vapi-webhook"');
    const helper = webhook.slice(helperStart, routeStart);
    expect(helper).toContain("maxDurationSeconds: 300");
    expect(helper).toContain('name: "create_followup_task"');
    expect(helper).toContain("Promise follow-up only if the result explicitly confirms the task was created");
    expect(helper).toContain("promise follow-up only if the tool explicitly confirms creation");
    expect(helper).not.toContain("book_appointment");
  });
});
