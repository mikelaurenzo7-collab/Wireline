#!/usr/bin/env node
/**
 * `npm audit` blocking wrapper with per-advisory allowlist.
 *
 * Default behavior: runs `npm audit --json --audit-level=high` and
 * exits 1 if any high or critical advisory is reported.
 *
 * To temporarily ship while a transitive vuln is unfixable upstream,
 * add the advisory ID to `.npmaudit-allowlist.json`:
 *
 *   {
 *     "allowlist": [
 *       {
 *         "id": "GHSA-xxxx-yyyy-zzzz",
 *         "package": "some-transitive-dep",
 *         "reason": "Not exploitable in our usage path: we never pass user input to fn().",
 *         "expires": "2026-09-01"
 *       }
 *     ]
 *   }
 *
 * The expiry date forces re-review every quarter. Expired allowlist
 * entries are ignored (the advisory will fail the build again).
 */

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const ALLOWLIST_PATH = resolve(REPO_ROOT, ".npmaudit-allowlist.json");

function loadAllowlist() {
  if (!existsSync(ALLOWLIST_PATH)) return new Set();
  try {
    const raw = JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8"));
    const today = new Date().toISOString().slice(0, 10);
    const valid = (raw.allowlist || []).filter((entry) => {
      if (!entry.id) return false;
      if (entry.expires && entry.expires < today) {
        console.warn(`[audit-blocking] Allowlist entry for ${entry.id} expired on ${entry.expires}; advisory is once again blocking.`);
        return false;
      }
      return true;
    });
    return new Set(valid.map((e) => e.id));
  } catch (err) {
    console.error(`[audit-blocking] Failed to parse ${ALLOWLIST_PATH}: ${err.message}`);
    return new Set();
  }
}

const allowlist = loadAllowlist();

const result = spawnSync("npm", ["audit", "--json", "--audit-level=high"], {
  cwd: REPO_ROOT,
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
});

let parsed;
try {
  parsed = JSON.parse(result.stdout || "{}");
} catch (err) {
  console.error("[audit-blocking] Could not parse `npm audit` JSON output.");
  console.error(result.stdout?.slice(0, 2000));
  console.error(result.stderr?.slice(0, 2000));
  // Fail closed on unparseable output rather than silently passing.
  process.exit(1);
}

// `npm audit --json` emits a `vulnerabilities` map keyed by package name.
// Each entry has `severity` and a `via` array containing GHSA IDs (when the
// vuln is direct) or the names of upstream packages that pulled it in.
// We collect every advisory id (GHSA-…) at high or critical severity.
const blocking = [];
const allowed = [];
const vulnerabilities = parsed.vulnerabilities || {};
for (const [pkg, vuln] of Object.entries(vulnerabilities)) {
  if (vuln.severity !== "high" && vuln.severity !== "critical") continue;
  const advisories = (vuln.via || [])
    .filter((via) => typeof via === "object" && via.url && /GHSA-[a-z0-9-]+/i.test(via.url))
    .map((via) => {
      const m = via.url.match(/GHSA-[a-z0-9-]+/i);
      return { id: m[0], title: via.title, url: via.url };
    });
  for (const adv of advisories) {
    const target = { pkg, severity: vuln.severity, ...adv };
    if (allowlist.has(adv.id)) allowed.push(target);
    else blocking.push(target);
  }
}

if (allowed.length) {
  console.log(`\n[audit-blocking] ${allowed.length} advisory(ies) allowed via .npmaudit-allowlist.json:`);
  for (const a of allowed) console.log(`  · ${a.id} (${a.severity}) in ${a.pkg} — ${a.title}`);
}

if (blocking.length === 0) {
  console.log(`\n[audit-blocking] OK: no blocking high/critical advisories.\n`);
  process.exit(0);
}

console.error(`\n[audit-blocking] ✗ FAIL: ${blocking.length} blocking high/critical advisory(ies):\n`);
for (const a of blocking) {
  console.error(`  · ${a.id} (${a.severity}) in ${a.pkg}`);
  console.error(`    ${a.title}`);
  console.error(`    ${a.url}\n`);
}
console.error("Either upgrade the affected package(s), or add the advisory IDs to");
console.error(".npmaudit-allowlist.json with a justification and expiry date.\n");
process.exit(1);
