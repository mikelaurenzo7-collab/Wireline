/** Explicit data migration; preview by default. Never runs during auth or build. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { getPostgresConnectionConfig } from "../../src/lib/postgres-tls.mjs";
import { assertCleanCheckout, resolveSourceCommit } from "../lib/release-source-verification.mjs";
import {
  planFounderDomainRefresh,
  SHOWCASE_DOMAIN_REFRESH_VERSION,
} from "../lib/showcase-domain-refresh.mjs";

const args = process.argv.slice(2);
const value = (name) => args[args.indexOf(name) + 1];
const userId = args.includes("--user-id") ? value("--user-id") : "";
const apply = args.includes("--apply");
if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("Supply the audited founder --user-id.");
const sourceCommit = resolveSourceCommit(process.cwd());
if (apply) {
  assertCleanCheckout(process.cwd(), sourceCommit);
  const expected = args.includes("--expected-source") ? value("--expected-source") : "";
  if (!/^[0-9a-f]{40}$/.test(expected) || expected !== sourceCommit) {
    throw new Error("Apply requires --expected-source matching the reviewed checkout.");
  }
  execFileSync("git", ["merge-base", "--is-ancestor", sourceCommit, "origin/main"], {
    stdio: "ignore",
  });
  const response = await fetch("https://botbound-api.onrender.com/healthz", {
    signal: AbortSignal.timeout(15000),
    headers: { "Cache-Control": "no-cache" },
  });
  const health = await response.json();
  if (!response.ok || health.sourceCommit !== sourceCommit || health.trafficEnabled !== false) {
    throw new Error("Apply requires the reviewed Render release with API traffic closed.");
  }
}
const connection = process.env.DATABASE_POOL_URL || process.env.POSTGRES_URL;
if (!connection) throw new Error("A database connection is required.");
const db = new pg.Client({
  ...getPostgresConnectionConfig(connection),
  connectionTimeoutMillis: 15000,
});
try {
  await db.connect();
  await db.query(apply ? "BEGIN" : "BEGIN TRANSACTION READ ONLY");
  await db.query("SET LOCAL statement_timeout = '15s'");
  await db.query("SET LOCAL lock_timeout = '5s'");
  const visibility = await db.query(
    "SELECT rolbypassrls OR rolsuper AS complete FROM pg_roles WHERE rolname = current_user",
  );
  if (!visibility.rows[0]?.complete) throw new Error("Complete migration visibility is required.");
  const { rows } = await db.query(
    `SELECT id, user_id AS "userId", name, system_prompt_override AS "systemPromptOverride",
      business_variables AS "businessVariables", website_url AS "websiteUrl" FROM wireline_agents
      WHERE user_id = $1 AND (business_variables->>'founder_showcase' = 'true'
        OR business_variables->>'founder_fleet_seed' = 'true')
      ORDER BY id${apply ? " FOR UPDATE" : ""}`,
    [userId],
  );
  if (!rows.length) throw new Error("No managed founder Bots found for the supplied owner.");
  const plans = rows.map((row) => ({ row, plan: planFounderDomainRefresh(row) }));
  const report = {
    version: SHOWCASE_DOMAIN_REFRESH_VERSION,
    sourceCommit,
    apply,
    bots: plans.map(({ row, plan }) => ({ id: row.id, name: row.name, status: plan.status })),
  };
  if (apply && plans.some(({ plan }) => ["manual-review", "not-managed"].includes(plan.status))) {
    throw new Error("A saved founder setting needs manual review; no changes were applied.");
  }
  for (const { row, plan } of plans) {
    if (!apply || plan.status !== "refresh") continue;
    const updated = await db.query(
      `UPDATE wireline_agents SET system_prompt_override = $1, business_variables = $2::jsonb, website_url = $7,
        updated_at = now() WHERE id = $3 AND user_id = $4 AND system_prompt_override IS NOT DISTINCT FROM $5
        AND business_variables = $6::jsonb AND website_url IS NOT DISTINCT FROM $8`,
      [
        plan.systemPromptOverride ?? row.systemPromptOverride,
        JSON.stringify(plan.businessVariables),
        row.id,
        userId,
        row.systemPromptOverride,
        JSON.stringify(row.businessVariables),
        plan.websiteUrl ?? row.websiteUrl,
        row.websiteUrl,
      ],
    );
    if (updated.rowCount !== 1) throw new Error("Saved prompt changed; migration rolled back.");
  }
  await db.query(apply ? "COMMIT" : "ROLLBACK");
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await db.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await db.end();
}
