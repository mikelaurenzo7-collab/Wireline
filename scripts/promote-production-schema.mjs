#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { resolveProductionMigrationDatabaseUrl } from "./lib/production-migration-database.mjs";

const REQUIRED_CONFIRMATION = "APPLY_APPEND_ONLY_BOTBOUND_MIGRATIONS";

function fail(message) {
  console.error(message);
  process.exit(1);
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (process.env.BOTBOUND_PRODUCTION_SCHEMA_CONFIRM !== REQUIRED_CONFIRMATION) {
  fail(
    "Refusing production schema promotion without BOTBOUND_PRODUCTION_SCHEMA_CONFIRM=" +
      REQUIRED_CONFIRMATION,
  );
}

const expectedSha = String(process.env.BOTBOUND_RELEASE_SHA || "").trim();
if (!/^[0-9a-f]{40}$/i.test(expectedSha)) {
  fail("BOTBOUND_RELEASE_SHA must be the exact 40-character commit being promoted.");
}

const head = spawnSync("git", ["rev-parse", "HEAD"], {
  cwd: process.cwd(),
  encoding: "utf8",
  shell: process.platform === "win32",
});
if (head.error || head.status !== 0) {
  fail("Unable to resolve the local release commit.");
}
if (head.stdout.trim().toLowerCase() !== expectedSha.toLowerCase()) {
  fail("Local HEAD does not match BOTBOUND_RELEASE_SHA; refusing schema promotion.");
}

const status = spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
  cwd: process.cwd(),
  encoding: "utf8",
  shell: process.platform === "win32",
});
if (status.error || status.status !== 0) {
  fail("Unable to verify that the local release checkout is clean.");
}
if (status.stdout.trim()) {
  fail(
    "Local release checkout is not clean; refusing to promote uncommitted schema under BOTBOUND_RELEASE_SHA.",
  );
}

const databaseUrl = String(process.env.POSTGRES_URL || process.env.DATABASE_URL || "").trim();
if (!databaseUrl) {
  fail("POSTGRES_URL or DATABASE_URL is required for schema promotion.");
}
const selected = resolveProductionMigrationDatabaseUrl(databaseUrl);
const validationEnv = {
  ...process.env,
  NODE_ENV: "production",
  POSTGRES_URL: selected.connectionString,
};

console.log("Validating the exact-head production environment before schema promotion.");
run("node", ["scripts/check-prod-env.mjs"], validationEnv);

// The runtime schema verifier normally prefers DATABASE_POOL_URL. Pin every
// mutating and verifying child process to the already-validated canonical
// session URL so an ambient pooler cannot redirect certification elsewhere.
const promotionEnv = {
  ...validationEnv,
  DATABASE_POOL_URL: selected.connectionString,
};
delete promotionEnv.DATABASE_URL;

console.log("Applying the exact-head append-only migration journal outside artifact compilation.");
run("npm", ["run", "db:migrate"], promotionEnv);
run("node", ["scripts/run-production-schema-effects.mjs"], promotionEnv);
console.log("Production schema promotion completed and schema effects verified.");
