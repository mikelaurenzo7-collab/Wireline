import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

/**
 * A launch gate exists to tell an operator what to fix. Reporting a confident,
 * specific fault that was really a connectivity failure is worse than
 * reporting nothing: it sends people to top up accounts, recreate alerts, and
 * hunt for missing indexes that were fine all along, while the actual problem
 * — the probe could not run — goes unnamed.
 *
 * Every probe therefore reports unreachability as its own blocker, and its
 * downstream assertions only run once the probe succeeded.
 */
describe("launch blockers distinguish a failed check from a failed probe", () => {
  const script = read("scripts/generate-launch-status.mjs");

  const PROBES = [
    { name: "database", unreachable: "database_unreachable", derived: "recap_agent_index_missing" },
    {
      name: "twilio",
      unreachable: "twilio_unreachable",
      derived: "twilio_prepaid_balance_below_150",
    },
    { name: "vercel", unreachable: "vercel_unreachable", derived: "production_commit_mismatch" },
    { name: "stripe", unreachable: "stripe_not_reachable", derived: "stripe_brand_not_wireline" },
  ];

  for (const probe of PROBES) {
    it(`${probe.name} reports unreachability rather than inventing a specific fault`, () => {
      expect(script).toContain(`blockers.push("${probe.unreachable}")`);
      // The derived assertion must sit after the reachability branch, not
      // beside it — otherwise an outage emits both.
      const guard = script.indexOf(`blockers.push("${probe.unreachable}")`);
      const derived = script.indexOf(`blockers.push("${probe.derived}")`);
      expect(derived).toBeGreaterThan(guard);
    });
  }

  it("guards each derived assertion behind an else, so one outage is one blocker", () => {
    for (const marker of [
      'if (database.status !== "reachable") {',
      'if (twilio.status !== "reachable") {',
      'if (vercel.status !== "ready") {',
      'if (stripe.status !== "reachable") {',
    ]) {
      expect(script).toContain(marker);
    }
    // The five Stripe assertions live inside the reachable branch together.
    const stripeBranch = script.slice(
      script.indexOf('if (stripe.status !== "reachable") {'),
      script.indexOf('if (database.status !== "reachable") {'),
    );
    for (const code of [
      "stripe_public_catalog_not_aligned",
      "stripe_brand_not_wireline",
      "stripe_customer_portal_not_ready",
      "stripe_webhook_not_aligned",
      "stripe_automatic_tax_not_ready",
    ]) {
      expect(stripeBranch).toContain(code);
    }
    expect(script).toContain('const PINNED_STRIPE_API_VERSION = "2026-07-29.dahlia"');
    expect(script).toContain("webhookResult.body?.has_more === true");
    expect(script).toContain("canonicalWebhooks.length !== 1");
    expect(script).toContain("webhook.livemode !== true");
    expect(script).toContain("webhook.api_version !== PINNED_STRIPE_API_VERSION");
  });
});

describe("migration drift is answerable, and the tool is honest about its coverage", () => {
  const script = read("scripts/check-migration-drift.mjs");

  it("is on-demand and read-only, not a build gate", () => {
    // A generalized parser blocking production deploys on its own false
    // positives would be worse than the gap it reports.
    const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    expect(pkg.scripts["db:drift"]).toBe("node scripts/check-migration-drift.mjs");
    expect(read("scripts/vercel-build.mjs")).not.toContain("check-migration-drift");
    expect(script).toContain("STRICT && drifted.length ? 1 : 0");
  });

  it("ignores statements inside dollar-quoted blocks", () => {
    // A CREATE inside `DO $$ IF ... THEN` is conditional by construction;
    // treating it as an expectation would manufacture false drift.
    expect(script).toContain("function stripDollarQuoted");
    expect(script).toContain("stripDollarQuoted(sql)");
  });

  it("reports what it could not verify instead of implying full coverage", () => {
    expect(script).toContain("statements_not_verifiable");
    expect(script).toContain("not verifiable from text");
  });

  it("flags a journalled migration whose effect is absent as the distinct case it is", () => {
    // drizzle records it as applied, so re-running db:migrate will not fix it —
    // and every tool that reads the journal reports the schema as correct.
    expect(script).toContain("[journalled]");
    expect(script).toContain("re-running db:migrate will NOT fix it");
  });

  it("checks high-risk CREATE OR REPLACE routine semantics", () => {
    expect(script).toContain("ROUTINE_SEMANTIC_EXPECTATIONS");
    expect(script).toContain("wireline_purge_old_data(uuid,integer)");
    expect(script).toContain('mustNotContain: ["wireline_webhooks", "wireline_intake_keys"]');
    expect(script).toContain("EXCEPTION\\s+WHEN\\s+OTHERS");
    expect(script).toContain("v_rows_deleted\\s*:=\\s*0");
    expect(script).toContain("0149_retention_purge_fails_closed");
    expect(script).toContain("pg_get_functiondef");
  });
});
