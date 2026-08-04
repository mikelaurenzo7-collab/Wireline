import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

function executableSql(sql: string): string {
  return sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim();
}

describe("subscription entitlement provenance", () => {
  const migration = read("drizzle/migrations/0130_subscription_entitlement_provenance.sql");
  const audit = read("ops/reconciliation/subscription_entitlement_provenance.sql");
  const journal = read("drizzle/migrations/meta/_journal.json");

  it("reproduces the live provenance columns idempotently", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS entitlement_source text");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS grant_reason text");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS stripe_price_id text");
    expect(migration).toContain("ALTER COLUMN entitlement_source SET DEFAULT 'manual'");
    expect(migration).toContain("ALTER COLUMN entitlement_source SET NOT NULL");
    expect(migration).toContain("CREATE INDEX IF NOT EXISTS idx_wireline_subscriptions_entitlement_source");
  });

  it("classifies legacy rows without inventing Stripe provenance", () => {
    expect(migration).toContain("WHEN stripe_subscription_id IS NOT NULL THEN 'stripe'");
    expect(migration).toContain("ELSE 'migration'");
    expect(migration).toContain("WHERE entitlement_source IS NULL");
    expect(migration).toContain("'stripe', 'demo', 'manual', 'migration'");
  });

  it("registers the canonical migration", () => {
    expect(journal).toContain('"idx": 27');
    expect(journal).toContain('"tag": "0130_subscription_entitlement_provenance"');
  });

  it("keeps the operator audit read-only and human-reviewed", () => {
    const executable = executableSql(audit);
    expect(executable).toMatch(/^SELECT\b/i);
    expect(executable).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|CREATE)\b/i);
    expect(audit).toContain("status IN ('active', 'trialing')");
    expect(audit).toContain("entitlement_source = 'stripe'");
    expect(audit).toContain("stripe_customer_id IS NULL OR stripe_subscription_id IS NULL");
    expect(audit).toContain("entitlement_source <> 'stripe'");
    expect(audit).toContain("NULLIF(BTRIM(grant_reason), '') IS NULL");
    expect(audit).toContain("Never auto-revoke access");
  });
});
