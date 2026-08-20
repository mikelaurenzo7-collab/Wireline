#!/usr/bin/env node
/**
 * Canonical Vercel deployment entrypoint.
 *
 * Keep the project build command short while preserving one ordered release
 * pipeline: sanitize retired client configuration, migrate the final approved
 * customer-facing BotBound literals, prove the sanitizer contract, verify the
 * static Vercel CSP matches the canonical runtime policy, run the application
 * gate, build the public health function, and smoke the resulting handler.
 */
import "./sanitize-retired-client-env.mjs";
import "./apply-botbound-customer-literal-migration.mjs";
import { spawnSync } from "node:child_process";

function executable(command) {
  if (process.platform === "win32" && (command === "npx" || command === "npm")) {
    return `${command}.cmd`;
  }
  return command;
}

function run(command, args) {
  const result = spawnSync(executable(command), args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Prove the production compatibility bridge before migrations or any provider
// gate can run. The sanitizer and BotBound customer-literal migration are loaded
// in this parent process first; the contract itself then runs in the same
// credential-free clean room as every other build-time test process.
run(process.execPath, [
  "scripts/run-test-estate.mjs",
  "tests/retired-client-env-sanitizer-contract.test.ts",
]);
// Static Vercel responses bypass Express, so their CSP must stay byte-for-byte
// equivalent to the canonical runtime policy. This catches provider additions
// (for example Daily media transport for browser voice) before a deploy can
// silently ship a browser-only outage.
run(process.execPath, ["scripts/check-csp-drift.mjs"]);
run(process.execPath, ["scripts/vercel-build.mjs"]);
run("npx", [
  "esbuild",
  "src/entrypoints/public-health-api.ts",
  "--platform=node",
  "--bundle",
  "--format=cjs",
  "--outfile=dist/public-health-api.cjs",
]);
run(process.execPath, ["scripts/smoke-public-health-bundle.mjs"]);
