import { execFileSync } from "node:child_process";
import { defineConfig } from "drizzle-kit";
import { getDrizzlePostgresCredentials } from "./src/lib/postgres-tls.mjs";

// The historical 0152 snapshot is deterministically materialized when needed.
// The script verifies a pinned SHA-256 before Drizzle Kit is allowed to inspect
// or mutate schema state; it does not add a retired provider to the live schema.
execFileSync(process.execPath, ["scripts/materialize-drizzle-meta.mjs"], {
  cwd: process.cwd(),
  stdio: "inherit",
});

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: getDrizzlePostgresCredentials(
    process.env.POSTGRES_URL || process.env.DATABASE_URL || "",
  ),
  verbose: true,
  strict: true,
});
