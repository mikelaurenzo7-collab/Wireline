#!/usr/bin/env node
import { spawnSync } from "node:child_process";

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("Running read-only BotBound provider release preflight.");
run("npm", ["run", "vendor:readiness"]);
run("npm", ["run", "stripe:portal:verify"]);
run("npm", ["run", "stripe:webhook:check"]);
run("node", ["scripts/check-resend-webhook-readiness.mjs"]);
console.log("BotBound provider release preflight passed without mutating provider state.");
