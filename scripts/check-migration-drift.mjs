/**
 * scripts/check-migration-drift.mjs
 *
 * Answer one question the repository currently cannot: which committed
 * migrations have actually landed in the live database?
 *
 * Why this exists
 * ---------------
 * `drizzle-kit migrate` — the only migration step the Vercel build runs — is
 * driven by `drizzle/migrations/meta/_journal.json`, and that journal lists 47
 * of the 152 committed `.sql` files. The other 105 were applied out of band and
 * are outside drizzle's control entirely: a developer who adds one of those
 * files and expects the deploy to run it will be wrong, silently, and the code
 * depending on it will fail at runtime instead of at deploy time.
 *
 * Being journalled is not sufficient either. `0107_recap_artifacts_agent_index`
 * IS in the journal, yet `idx_wireline_recap_artifacts_agent_id` is absent from
 * production — the drizzle bookkeeping records it as applied while its effect
 * is missing. That is worse than an unapplied migration, because every tool
 * that reads the journal reports the schema as correct.
 *
 * `scripts/check-production-schema-effects.mjs` already has the right idea and
 * runs on every production build, but its expectations are hand-maintained and
 * cover a handful of tables. This is the same idea generalized: derive the
 * expectations from the migration files themselves.
 *
 * Deliberately NOT a build gate
 * -----------------------------
 * Read-only, on demand (`npm run db:drift`), exit 0 unless `--strict`. A
 * generalized parser blocking production deploys on its own false positives
 * would be a worse problem than the one it reports. The build keeps its
 * existing hand-curated gate; this tells an operator where to look.
 *
 * Coverage is partial, and says so
 * --------------------------------
 * Verifiable: CREATE [UNIQUE] INDEX, CREATE TABLE, CREATE POLICY,
 * CREATE OR REPLACE FUNCTION, CREATE TRIGGER, ALTER TABLE ... ADD COLUMN.
 * Not verifiable from statement text: GRANT/REVOKE, DROP, COMMENT, data
 * UPDATE/INSERT, and anything inside a `DO $$ ... $$` block (those are
 * conditional by construction, so treating them as expectations would
 * manufacture false drift). The report prints how many statements it skipped
 * so "no drift" is never mistaken for "fully verified".
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const { Pool } = pg;
const MIGRATIONS_DIR = join(process.cwd(), "drizzle", "migrations");
const STRICT = process.argv.includes("--strict");
const JSON_OUT = process.argv.includes("--json");

/**
 * Blank out `$tag$ ... $tag$` bodies so statements inside DO blocks and
 * function bodies are not read as unconditional expectations. Newlines are
 * preserved so reported line numbers stay honest.
 */
function stripDollarQuoted(sql) {
  return sql.replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, (block) =>
    block.replace(/[^\n]/g, " "),
  );
}

function stripLineComments(sql) {
  return sql.replace(/--[^\n]*/g, "");
}

function unquote(identifier) {
  const trimmed = identifier.trim().replace(/;$/, "");
  const bare = trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1) : trimmed;
  // Strip an explicit schema qualifier; every object here lives in public.
  return bare.includes(".") ? bare.slice(bare.lastIndexOf(".") + 1) : bare;
}

/** Expectations this migration file asserts about the live schema. */
function parseExpectations(sql) {
  const source = stripLineComments(stripDollarQuoted(sql));
  const expectations = [];

  for (const m of source.matchAll(
    /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?([\w".]+)/gi,
  )) {
    expectations.push({ kind: "index", name: unquote(m[1]) });
  }
  for (const m of source.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w".]+)/gi)) {
    expectations.push({ kind: "table", name: unquote(m[1]) });
  }
  for (const m of source.matchAll(
    /CREATE\s+POLICY\s+([\w".]+)\s+ON\s+([\w".]+)/gi,
  )) {
    expectations.push({ kind: "policy", name: unquote(m[1]), table: unquote(m[2]) });
  }
  for (const m of source.matchAll(
    /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([\w".]+)\s*\(/gi,
  )) {
    expectations.push({ kind: "function", name: unquote(m[1]) });
  }
  for (const m of source.matchAll(/CREATE\s+TRIGGER\s+([\w".]+)[\s\S]{0,200}?\bON\s+([\w".]+)/gi)) {
    expectations.push({ kind: "trigger", name: unquote(m[1]), table: unquote(m[2]) });
  }
  for (const m of source.matchAll(
    /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?([\w".]+)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w".]+)/gi,
  )) {
    expectations.push({ kind: "column", table: unquote(m[1]), name: unquote(m[2]) });
  }

  // Statements this parser cannot turn into a checkable expectation.
  const unverifiable = (
    source.match(/^\s*(GRANT|REVOKE|DROP|COMMENT|UPDATE|INSERT|ALTER\s+POLICY|DO)\b/gim) || []
  ).length;

  return { expectations, unverifiable };
}

async function loadLiveSchema(pool) {
  const [indexes, tables, policies, functions, triggers, columns] = await Promise.all([
    pool.query(`SELECT indexname AS n FROM pg_indexes WHERE schemaname = 'public'`),
    pool.query(`SELECT tablename AS n FROM pg_tables WHERE schemaname = 'public'`),
    pool.query(`SELECT policyname AS n, tablename AS t FROM pg_policies WHERE schemaname = 'public'`),
    pool.query(
      `SELECT p.proname AS n FROM pg_proc p
         JOIN pg_namespace ns ON ns.oid = p.pronamespace WHERE ns.nspname = 'public'`,
    ),
    pool.query(
      `SELECT t.tgname AS n, c.relname AS t FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace ns ON ns.oid = c.relnamespace
        WHERE ns.nspname = 'public' AND NOT t.tgisinternal`,
    ),
    pool.query(
      `SELECT table_name AS t, column_name AS n
         FROM information_schema.columns WHERE table_schema = 'public'`,
    ),
  ]);
  return {
    index: new Set(indexes.rows.map((r) => r.n)),
    table: new Set(tables.rows.map((r) => r.n)),
    policy: new Set(policies.rows.map((r) => `${r.t}.${r.n}`)),
    function: new Set(functions.rows.map((r) => r.n)),
    trigger: new Set(triggers.rows.map((r) => `${r.t}.${r.n}`)),
    column: new Set(columns.rows.map((r) => `${r.t}.${r.n}`)),
  };
}

function isPresent(live, expectation) {
  switch (expectation.kind) {
    case "index":
    case "table":
    case "function":
      return live[expectation.kind].has(expectation.name);
    case "policy":
    case "trigger":
    case "column":
      return live[expectation.kind].has(`${expectation.table}.${expectation.name}`);
    default:
      return true;
  }
}

async function main() {
  const connectionString = String(
    process.env.DATABASE_POOL_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL || "",
  ).trim();
  if (!connectionString) {
    console.error(
      "Migration drift check needs DATABASE_POOL_URL, POSTGRES_URL, or DATABASE_URL.",
    );
    process.exit(1);
  }

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const journalled = new Set(
    JSON.parse(readFileSync(join(MIGRATIONS_DIR, "meta", "_journal.json"), "utf8")).entries.map(
      (e) => e.tag,
    ),
  );

  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 15_000 });
  let live;
  try {
    live = await loadLiveSchema(pool);
  } finally {
    await pool.end().catch(() => {});
  }

  const drifted = [];
  let checked = 0;
  let skipped = 0;

  for (const file of files) {
    const tag = file.replace(/\.sql$/, "");
    const { expectations, unverifiable } = parseExpectations(
      readFileSync(join(MIGRATIONS_DIR, file), "utf8"),
    );
    skipped += unverifiable;
    checked += expectations.length;
    const missing = expectations.filter((e) => !isPresent(live, e));
    if (missing.length) {
      drifted.push({
        migration: tag,
        journalled: journalled.has(tag),
        expected: expectations.length,
        missing: missing.map((e) =>
          e.table ? `${e.kind} ${e.table}.${e.name}` : `${e.kind} ${e.name}`,
        ),
      });
    }
  }

  const report = {
    migration_files: files.length,
    journalled_files: journalled.size,
    unjournalled_files: files.length - journalled.size,
    objects_checked: checked,
    statements_not_verifiable: skipped,
    drifted_migrations: drifted.length,
    drift: drifted,
  };

  if (JSON_OUT) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("\n=== WIRELINE MIGRATION DRIFT ===\n");
    console.log(
      `Migration files: ${report.migration_files} ` +
        `(${report.journalled_files} journalled, ${report.unjournalled_files} applied out of band)`,
    );
    console.log(
      `Objects checked: ${report.objects_checked}  ` +
        `(${report.statements_not_verifiable} statements not verifiable from text — ` +
        `GRANT/REVOKE/DROP/COMMENT/data writes/DO blocks)`,
    );
    if (!drifted.length) {
      console.log("\nNo drift found in the verifiable set.\n");
    } else {
      console.log(`\n${drifted.length} migration(s) with missing effects:\n`);
      for (const d of drifted) {
        console.log(`  ${d.migration}${d.journalled ? " [journalled]" : " [not journalled]"}`);
        for (const m of d.missing) console.log(`      missing: ${m}`);
      }
      console.log(
        "\nA [journalled] entry here means drizzle records the migration as applied " +
          "while its effect is absent — re-running db:migrate will NOT fix it.\n",
      );
    }
  }

  process.exit(STRICT && drifted.length ? 1 : 0);
}

main().catch((error) => {
  console.error("Migration drift check failed:", error?.message || error);
  process.exit(1);
});
