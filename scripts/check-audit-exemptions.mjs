#!/usr/bin/env node
/**
 * Audit Exemption Check
 * 
 * Runs `npm audit` and fails the build on high/critical vulnerabilities
 * unless the GHSA ID is documented in `.audit-exemptions`.
 * 
 * Usage:
 *   node scripts/check-audit-exemptions.mjs
 * 
 * Exit codes:
 *   0 - No unexempted high/critical vulns
 *   1 - Found unexempted vulnerabilities (fail the build)
 */

import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Read exemption file (one GHSA-XXXX-XXXX-XXXX per line, comments allowed)
const exemptionsPath = resolve(process.cwd(), ".audit-exemptions");
const exemptedGHSAs = new Set();

if (existsSync(exemptionsPath)) {
  const lines = readFileSync(exemptionsPath, "utf-8").split("\n");
  for (const line of lines) {
    const match = line.trim().match(/^(GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4})/i);
    if (match) {
      exemptedGHSAs.add(match[1].toUpperCase());
    }
  }
}

console.log(`Loaded ${exemptedGHSAs.size} exempted GHSA(s) from .audit-exemptions`);

// Run npm audit --json
let auditOutput;
try {
  auditOutput = execSync("npm audit --json --audit-level=high", { encoding: "utf-8" });
} catch (err) {
  // npm audit exits non-zero when vulnerabilities are found
  auditOutput = err.stdout;
}

const auditData = JSON.parse(auditOutput);
const vulnerabilities = auditData.vulnerabilities || {};

// Collect unexempted high/critical vulns
const unexempted = [];
for (const [pkgName, vuln] of Object.entries(vulnerabilities)) {
  if (vuln.severity === "high" || vuln.severity === "critical") {
    // Check if any of the advisory IDs (GHSA-*) are exempted
    const advisories = vuln.via.filter(v => typeof v === "object");
    const ghsaIds = advisories.map(a => a.source || "").filter(s => s.startsWith("GHSA-"));
    
    const isExempted = ghsaIds.some(id => exemptedGHSAs.has(id.toUpperCase()));
    
    if (!isExempted) {
      unexempted.push({
        package: pkgName,
        severity: vuln.severity,
        ghsas: ghsaIds,
        title: advisories[0]?.title || "Unknown",
      });
    }
  }
}

if (unexempted.length === 0) {
  console.log("✓ No unexempted high or critical vulnerabilities found.\n");
  process.exit(0);
}

console.log(`\n✗ Found ${unexempted.length} unexempted high/critical vulnerabilities:\n`);
for (const vuln of unexempted) {
  console.log(`  · ${vuln.package} (${vuln.severity.toUpperCase()})`);
  console.log(`    ${vuln.title}`);
  console.log(`    GHSA: ${vuln.ghsas.join(", ") || "N/A"}`);
}

console.log("\nTo exempt a vulnerability, add its GHSA ID to .audit-exemptions with reasoning.\n");
process.exit(1);
