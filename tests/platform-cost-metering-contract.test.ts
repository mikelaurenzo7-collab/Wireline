import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

/**
 * The plan-entitlements AI-spend envelope claims to fund "provider COGS", and
 * the commercial prose tells customers where each workload draws from. Both
 * were only half-true until platform research and enrichment were metered:
 * Perplexity and platform-key Apollo ran as invisible COGS outside every
 * budget. These contracts pin the completeness of the envelope and the
 * honesty of the copy that describes it.
 */
describe("platform cost metering contract", () => {
  const middleware = read("src/middleware/audit-middleware.ts");
  const perplexity = read("src/lib/perplexity-platform.ts");
  const apollo = read("src/lib/apollo-service.ts");

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

  it("charges Apollo only when the platform key funded the call", () => {
    // A tenant's own OAuth connection spends their Apollo credits — charging
    // the Wireline envelope for it would double-bill them.
    expect(apollo).toContain('source: "tenant" | "platform"');
    expect(apollo).toContain('if (auth.source !== "platform" || !userId) return;');
    expect(apollo).toContain('meterPlatformApolloUsage(auth, userId, "lead_search")');
    expect(apollo).toContain('meterPlatformApolloUsage(auth, userId, "lead_match")');
    // Enrichment bills on a successful match only.
    const enrich = apollo.slice(apollo.indexOf("export async function enrichLead"));
    expect(enrich.indexOf("if (!p) return null;")).toBeLessThan(
      enrich.indexOf('meterPlatformApolloUsage(auth, userId, "lead_match")'),
    );
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
    expect(balance).toContain(
      "funds platform AI, research, and enrichment from its included AI envelope",
    );
  });
});
