#!/usr/bin/env node
/**
 * Canonical Vercel deployment entrypoint.
 *
 * Keep the project build command short while preserving one ordered release
 * pipeline: sanitize retired client configuration, prove the sanitizer contract,
 * run the application gate, build the public health function, and smoke the
 * resulting handler.
 */
import "./sanitize-retired-client-env.mjs";
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
// gate can run. A broken sanitizer must fail before the release path can mutate
// database or external-provider state.
run("npx", ["vitest", "run", "tests/retired-client-env-sanitizer-contract.test.ts"]);
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
