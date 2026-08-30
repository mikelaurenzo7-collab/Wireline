import { execFileSync } from "node:child_process";
import { defineConfig } from "drizzle-kit";
import { getDrizzlePostgresCredentials } from "./src/lib/postgres-tls.mjs";
import { resolveProductionSchemaDatabase } from "./scripts/run-production-schema-effects.mjs";

// Migration 0152's 185 KB snapshot is deterministically materialized from the
// committed 0049 graph plus the native xAI table recipe. The script verifies a
// pinned SHA-256 before Drizzle Kit is allowed to inspect or mutate schema state.
execFileSync(process.execPath, ["scripts/materialize-drizzle-meta.mjs"], {
  cwd: process.cwd(),
  stdio: "inherit",
});

const migrationDatabaseUrl =
  resolveProductionSchemaDatabase(process.env)?.connectionString || process.env.DATABASE_URL || "";

export default defineConfig({
  // Customer-data tables remain on the canonical application schema surface.
  // Internal xAI phone bindings are tracked separately so encrypted provider
  // credentials never enter account-export enumeration, while Drizzle still
  // includes them in snapshots and future migration diffs.
  schema: ["./src/db/schema.ts", "./src/db/xai-voice-schema.ts"],
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: getDrizzlePostgresCredentials(migrationDatabaseUrl),
  verbose: true,
  strict: true,
});
