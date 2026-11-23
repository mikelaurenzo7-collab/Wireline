#!/usr/bin/env node
/**
 * Prepare a disposable local Postgres for the real-database test lane
 * (`npm run test:db`). It never touches the shared Supabase database:
 * TEST_DATABASE_URL must point at localhost, and DATABASE_URL/POSTGRES_URL are
 * removed from the child environment before the schema push.
 *
 * Steps: create the roles production policies name, push the Drizzle schema,
 * then apply tests/db/fixtures/production-security.sql (row security,
 * policies and wireline_server grants exported from production).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const url = process.env.TEST_DATABASE_URL || "";
if (!url) {
  console.error(
    "TEST_DATABASE_URL is required, for example postgres://postgres@127.0.0.1:55432/wireline_test",
  );
  process.exit(2);
}
const host = (() => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
})();
if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host)) {
  console.error(`Refusing to prepare a non-local database (${host || "unparseable URL"}).`);
  process.exit(2);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
if (process.argv.includes("--fresh")) {
  await client.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
}
for (const role of ["wireline_server", "anon", "authenticated", "service_role"]) {
  await client.query(
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN CREATE ROLE ${role} NOLOGIN; END IF; END $$;`,
  );
}
await client.end();

const env = { ...process.env, POSTGRES_URL: url };
delete env.DATABASE_URL;
execFileSync("npx", ["drizzle-kit", "push", "--force"], { env, stdio: "inherit" });

const fixture = readFileSync(path.resolve("tests/db/fixtures/production-security.sql"), "utf8");
const apply = new pg.Client({ connectionString: url });
await apply.connect();
await apply.query(fixture);
const { rows } = await apply.query(
  "SELECT count(*)::int AS policies FROM pg_policies WHERE schemaname = 'public'",
);
await apply.end();
console.log(`Test database ready: ${rows[0].policies} production policies applied.`);
