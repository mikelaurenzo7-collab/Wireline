#!/usr/bin/env node
/**
 * Pull Production env from Vercel into `.env.local`, then run an npm script.
 * Requires `VERCEL_TOKEN` and a linked project (`.vercel/project.json`).
 *
 * Usage: node scripts/run-with-vercel-env.mjs test:run
 *        node scripts/run-with-vercel-env.mjs e2e
 *        node scripts/run-with-vercel-env.mjs verify
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

if (!process.env.VERCEL_TOKEN) {
  console.error("[run-with-vercel-env] VERCEL_TOKEN is not set.");
  console.error("Add it in Cursor Cloud secrets or: export VERCEL_TOKEN=…");
  process.exit(1);
}

if (!existsSync(".vercel/project.json")) {
  console.error("[run-with-vercel-env] Missing .vercel/project.json");
  console.error("Run once: npx vercel link --yes --project <name> --scope <team>");
  process.exit(1);
}

const envTarget = process.env.VERCEL_ENV_PULL_TARGET || "production";

const pull = spawnSync(
  "npx",
  ["vercel@latest", "env", "pull", ".env.local", "--yes", "--environment", envTarget],
  { stdio: "inherit", env: process.env },
);
if (pull.status) process.exit(pull.status ?? 1);

const script = process.argv[2];
if (!script) {
  console.error("[run-with-vercel-env] Missing npm script name, e.g. test:run");
  process.exit(1);
}

const run = spawnSync("npm", ["run", script], {
  stdio: "inherit",
  env: {
    ...process.env,
    ...(script === "test:run" || script === "e2e" || script === "verify"
      ? { WIRELINE_USE_VERCEL_ENV_IN_TEST: "true" }
      : {}),
  },
});
process.exit(run.status ?? 0);
