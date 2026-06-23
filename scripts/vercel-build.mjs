#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const vercelEnv = process.env.VERCEL_ENV || "local";
const allowPreviewMigrations = process.env.WIRELINE_ALLOW_PREVIEW_MIGRATIONS === "1";

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.error) {
    console.error(`[vercel-build] ${command} failed to start:`, result.error);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (vercelEnv === "production" || allowPreviewMigrations) {
  console.log(`[vercel-build] Running database migrations for VERCEL_ENV=${vercelEnv}.`);
  run("npm", ["run", "db:migrate"]);
} else {
  console.log(
    `[vercel-build] Skipping database migrations for VERCEL_ENV=${vercelEnv}. Set WIRELINE_ALLOW_PREVIEW_MIGRATIONS=1 only for an intentional one-off migration deployment.`,
  );
}

run("npm", ["run", "build"]);
