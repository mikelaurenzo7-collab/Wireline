#!/usr/bin/env node
/**
 * csp-inventory.mjs — CI entrypoint (delegates to src/lib/csp-inventory.ts).
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const tsxCli = join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
const entry = join(repoRoot, "scripts/csp-inventory-run.ts");

const result = spawnSync(
  process.execPath,
  [tsxCli, entry, ...process.argv.slice(2)],
  { cwd: repoRoot, stdio: "inherit" },
);

process.exit(result.status ?? 1);
