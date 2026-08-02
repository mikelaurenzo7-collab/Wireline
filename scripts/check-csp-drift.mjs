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
import { createHash } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
const vercelPath = resolve(repoRoot, "vercel.json");
const staticHtmlSources = [
  "index.html",
  "public/chatgpt-app-privacy.html",
  "public/legal/data-deletion.html",
];

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

function hashSource(source) {
  return `'sha256-${createHash("sha256").update(source).digest("base64")}'`;
}

/**
 * `<script type="application/ld+json">` (and other JSON data blocks) are never
 * executed by the browser, so CSP `script-src` does not apply to them and they
 * must not be hashed into the policy — doing so would force a CSP header
 * rewrite on every JSON-LD copy edit while granting a real script-execution
 * allowance to a data payload. Every other type (no type, `module`,
 * `importmap`, `speculationrules`, …) is script-src governed and still
 * requires an exact hash.
 */
const NON_EXECUTABLE_SCRIPT_TYPE_RE = /^\s*(?:application\/(?:ld\+)?json)\s*$/i;

function isNonExecutableScriptTag(openTag) {
  const type = openTag.match(/\btype\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
  if (!type) return false;
  return NON_EXECUTABLE_SCRIPT_TYPE_RE.test(type[2] ?? type[3] ?? type[4] ?? "");
}

function inlineBlocks(html, tagName) {
  const normalized = html.replace(/\r\n/g, "\n");
  const pattern =
    tagName === "script"
      ? /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi
      : /<style([^>]*)>([\s\S]*?)<\/style>/gi;
  return [...normalized.matchAll(pattern)]
    .filter((match) => tagName !== "script" || !isNonExecutableScriptTag(match[1]))
    .map((match) => match[2]);
}

function assertStaticInlineSourcesAllowed(csp) {
  const missing = [];
  for (const relativePath of staticHtmlSources) {
    const html = readFileSync(resolve(repoRoot, relativePath), "utf8");
    for (const block of inlineBlocks(html, "script")) {
      const source = hashSource(block);
      if (!csp.includes(source)) missing.push({ relativePath, tagName: "script", source });
    }
    for (const block of inlineBlocks(html, "style")) {
      const source = hashSource(block);
      if (!csp.includes(source)) missing.push({ relativePath, tagName: "style", source });
    }
  }

  if (!missing.length) return;

  console.error("check-csp-drift: static inline HTML source is not covered by buildCSP()\n");
  for (const item of missing) {
    console.error(`  ${item.relativePath} <${item.tagName}> requires ${item.source}`);
  }
  console.error("\nMove the block to an external asset or add the exact hash to src/lib/csp.ts.");
  process.exit(1);
}

const write = process.argv.includes("--write");
const expected = expectedCsp();
assertStaticInlineSourcesAllowed(expected);
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
