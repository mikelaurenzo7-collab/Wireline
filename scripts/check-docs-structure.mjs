#!/usr/bin/env node
/**
 * check-docs-structure.mjs
 * ----------------------------------------------------------------------
 * Verifies that the *structural headline numbers* quoted in the docs
 * (README.md, ARCHITECTURE.md) stay in sync with the code that is their
 * source of truth:
 *
 *   - table count      ← `pgTable("...")` definitions in src/db/schema.ts
 *   - migration count  ← `*.sql` files in drizzle/migrations/
 *   - index count      ← distinct `CREATE [UNIQUE] INDEX` names in those
 *                        migrations
 *
 * Why: pricing drift is already guarded by check-readme-pricing.mjs, but
 * the audit found the structural claims drifting too — ARCHITECTURE said
 * "55 tables; 17 migrations" while the repo had 57 tables and 27
 * migrations, and the README still advertised "15 custom database
 * indexes" against 50+ real ones. Numbers a reader trusts must not be
 * allowed to rot. This locks them down at CI, mirroring the pricing guard.
 *
 * Exit code 0 = in sync. Exit code 1 = drift, with an actionable message.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");

const read = (rel) => readFileSync(resolve(repoRoot, rel), "utf8");

// ---------------------------------------------------------------------------
// Derive the ground-truth numbers from source.
// ---------------------------------------------------------------------------

// Tables: every `pgTable("name", ...)` declaration in the schema.
const schemaSource = read("src/db/schema.ts");
const tableNames = new Set(
  [...schemaSource.matchAll(/pgTable\(\s*"([a-zA-Z_]+)"/g)].map((m) => m[1]),
);
const tableCount = tableNames.size;

// Migrations: every .sql file in the drizzle migrations directory.
const migrationFiles = readdirSync(resolve(repoRoot, "drizzle/migrations")).filter((f) =>
  f.endsWith(".sql"),
);
const migrationCount = migrationFiles.length;

// Indexes: distinct index names created across all migrations. Counting
// distinct names (not raw statements) keeps idempotent re-creations of the
// same index from inflating the total.
const indexNames = new Set();
for (const file of migrationFiles) {
  const sql = read(`drizzle/migrations/${file}`);
  for (const m of sql.matchAll(
    /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi,
  )) {
    indexNames.add(m[1].toLowerCase());
  }
}
const indexCount = indexNames.size;

// ---------------------------------------------------------------------------
// Assert the docs quote those numbers.
// ---------------------------------------------------------------------------

const readme = read("README.md");
const architecture = read("ARCHITECTURE.md");

const issues = [];

// README: "<N> custom database indexes"
const readmeIndexRe = /(\d+)\s+custom database indexes/;
const readmeIndexMatch = readmeIndexRe.exec(readme);
if (!readmeIndexMatch) {
  issues.push('❌  README.md: could not find a "<N> custom database indexes" claim to verify.');
} else if (Number(readmeIndexMatch[1]) !== indexCount) {
  issues.push(
    `❌  README.md says "${readmeIndexMatch[1]} custom database indexes" but the migrations define ${indexCount}. ` +
      `Update README.md to "${indexCount} custom database indexes".`,
  );
}

// ARCHITECTURE: "<T> tables managed by Drizzle; <M> migrations"
const archHeaderRe = /(\d+)\s+tables managed by Drizzle;\s*(\d+)\s+migrations/;
const archHeaderMatch = archHeaderRe.exec(architecture);
if (!archHeaderMatch) {
  issues.push(
    '❌  ARCHITECTURE.md: could not find the "<T> tables managed by Drizzle; <M> migrations" claim to verify.',
  );
} else {
  if (Number(archHeaderMatch[1]) !== tableCount) {
    issues.push(
      `❌  ARCHITECTURE.md says "${archHeaderMatch[1]} tables managed by Drizzle" but src/db/schema.ts defines ${tableCount}. ` +
        `Update ARCHITECTURE.md to "${tableCount} tables managed by Drizzle".`,
    );
  }
  if (Number(archHeaderMatch[2]) !== migrationCount) {
    issues.push(
      `❌  ARCHITECTURE.md says "${archHeaderMatch[2]} migrations" but drizzle/migrations has ${migrationCount} .sql files. ` +
        `Update ARCHITECTURE.md to "${migrationCount} migrations".`,
    );
  }
}

// ARCHITECTURE: "all <T> tables in dependency order" (account-deletion prose)
const archCascadeRe = /all\s+(\d+)\s+tables in dependency order/;
const archCascadeMatch = archCascadeRe.exec(architecture);
if (!archCascadeMatch) {
  issues.push(
    '❌  ARCHITECTURE.md: could not find the "all <N> tables in dependency order" claim to verify.',
  );
} else if (Number(archCascadeMatch[1]) !== tableCount) {
  issues.push(
    `❌  ARCHITECTURE.md says "all ${archCascadeMatch[1]} tables in dependency order" but src/db/schema.ts defines ${tableCount}. ` +
      `Update ARCHITECTURE.md to "all ${tableCount} tables in dependency order".`,
  );
}

if (issues.length > 0) {
  console.error("📛  Docs structural numbers are out of sync with source:\n");
  for (const i of issues) console.error("  " + i);
  console.error(
    `\n  Source of truth — tables: ${tableCount} (src/db/schema.ts), ` +
      `migrations: ${migrationCount} (drizzle/migrations), indexes: ${indexCount} (migrations).`,
  );
  process.exit(1);
}

console.log(
  `✅  Docs structural numbers match source — tables: ${tableCount}, migrations: ${migrationCount}, indexes: ${indexCount}.`,
);
process.exit(0);
