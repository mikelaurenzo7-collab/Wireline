#!/usr/bin/env node
/**
 * check-csp-drift.mjs
 * ----------------------------------------------------------------------
 * Ensures vercel.json Content-Security-Policy matches buildCSP(false) from
 * src/lib/csp.ts — single source of truth, no manual header drift.
 *
 * Usage:
 *   node scripts/check-csp-drift.mjs          # check (CI)
 *   node scripts/check-csp-drift.mjs --write  # sync vercel.json CSP header
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
const vercelPath = resolve(repoRoot, "vercel.json");

function expectedCsp() {
  const tsxCli = join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
  const result = spawnSync(
    process.execPath,
    [
      tsxCli,
      "-e",
      `import { buildCSP, buildConnectSrcs } from "./src/lib/csp.ts"; console.log(buildCSP(false, undefined, buildConnectSrcs(false)));`,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );

  if (result.status !== 0) {
    console.error("check-csp-drift: failed to evaluate buildCSP()", result.stderr);
    process.exit(1);
  }

  const csp = result.stdout.trim();
  if (!csp || !csp.includes("default-src")) {
    console.error("check-csp-drift: buildCSP() returned unexpected output:", csp);
    process.exit(1);
  }
  return csp;
}

function readVercelCsp() {
  const config = JSON.parse(readFileSync(vercelPath, "utf8"));
  const headersBlock = config.headers?.find((h) => h.source === "/(.*)");
  const cspHeader = headersBlock?.headers?.find((h) => h.key === "Content-Security-Policy");
  return { config, cspHeader, cspValue: cspHeader?.value ?? null };
}

const write = process.argv.includes("--write");
const expected = expectedCsp();
const { config, cspHeader, cspValue } = readVercelCsp();

if (!cspHeader) {
  console.error("check-csp-drift: vercel.json missing Content-Security-Policy header on /(.*)");
  process.exit(1);
}

if (write) {
  if (cspValue === expected) {
    console.log("check-csp-drift: vercel.json already in sync");
    process.exit(0);
  }
  cspHeader.value = expected;
  writeFileSync(vercelPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  console.log("check-csp-drift: synced vercel.json CSP from buildCSP(false)");
  process.exit(0);
}

if (cspValue !== expected) {
  console.error("check-csp-drift: vercel.json CSP drift detected\n");
  console.error("Expected (from buildCSP):");
  console.error(`  ${expected}\n`);
  console.error("Found in vercel.json:");
  console.error(`  ${cspValue}\n`);
  console.error("Fix: node scripts/check-csp-drift.mjs --write");
  process.exit(1);
}

console.log("check-csp-drift: vercel.json CSP matches buildCSP(false)");
