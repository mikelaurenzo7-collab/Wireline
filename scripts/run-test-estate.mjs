#!/usr/bin/env node
/**
 * Run Vitest without inheriting live deployment credentials, account identity,
 * provider configuration, observability transports, or a production runtime
 * identity.
 *
 * Canonical Vercel production builds must prove the exact source tree before
 * migrations or provider release assertions. The child process starts from a
 * minimal OS-only allowlist and an isolated temporary home. Unknown future
 * variables are therefore omitted by default rather than trusted until a
 * growing credential denylist happens to recognize them.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { buildTestEstateEnvironment } from "./lib/test-estate-environment.mjs";

const source = process.env;
const productionTarget = String(source.VERCEL_ENV || "").trim() === "production";
const isolatedHome = mkdtempSync(join(tmpdir(), "wireline-test-estate-"));
const env = buildTestEstateEnvironment(source, isolatedHome);

// Keep package and Git discovery inside the disposable home even if a tool
// chooses to inspect user-level configuration while a contract test runs.
writeFileSync(env.NPM_CONFIG_USERCONFIG, "", { encoding: "utf8" });
writeFileSync(env.GIT_CONFIG_GLOBAL, "", { encoding: "utf8" });

const vitest = resolve(process.cwd(), "node_modules/vitest/vitest.mjs");
const extraArgs = process.argv.slice(2);
const selection = extraArgs.length
  ? `focused selection (${extraArgs.length} file${extraArgs.length === 1 ? "" : "s"})`
  : "complete non-E2E estate";
console.log(
  `Running ${selection} in clean-room mode` +
    `${productionTarget ? " for a canonical production candidate" : ""}; ` +
    `${Object.keys(env).length} allowlisted runtime variables supplied.`,
);

let result;
try {
  result = spawnSync(
    process.execPath,
    [vitest, "run", "--exclude", "tests/e2e/**", ...extraArgs],
    {
      cwd: process.cwd(),
      env,
      stdio: "inherit",
    },
  );
} finally {
  rmSync(isolatedHome, { recursive: true, force: true });
}

if (result.error) throw result.error;
if (result.signal) {
  console.error(`Clean-room test estate terminated by signal ${result.signal}.`);
  process.exit(1);
}
process.exit(result.status ?? 1);
