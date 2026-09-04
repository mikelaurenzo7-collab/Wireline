#!/usr/bin/env node
/**
 * Production-dependency vulnerability gate.
 *
 * npm's Bulk Advisory endpoint is the primary source. When that transport is
 * inconclusive, the gate queries OSV.dev's official package-version batch API
 * and retrieves the matching vulnerability records. Either source must return
 * a structurally valid, complete report; if both are unavailable or malformed,
 * the build fails closed.
 *
 * Every acceptance must name the advisory, justify why the vulnerable path is
 * unreachable here, and state the condition that retires the acceptance. An
 * acceptance whose condition has been met should be deleted in the same PR
 * that acts on it.
 */
import { readFileSync } from "node:fs";
import {
  buildProductionPackagePayload,
  classifyHighSeverityAdvisories,
  countPackageVersions,
  flattenBulkAdvisories,
  requestBulkAdvisories,
} from "./lib/npm-bulk-audit.mjs";
import { requestOsvAdvisories } from "./lib/osv-audit.mjs";

/*
 * Empty by design. Retired 2026-08-10: GHSA-qwww-vcr4-c8h2 named
 * react-router-dom 7.x, and its stated retirement condition - "publishes a
 * 7.x/8.x release above the advisory range" - has been met. The project now
 * depends on react-router ^8.3.0 and no longer depends on react-router-dom at
 * all, so the acceptance matched nothing and, left in place, would have
 * silently pre-approved any FUTURE advisory that happened to reuse the id.
 * An acceptance that no longer names a live risk is a hole, not a note.
 */
const ACCEPTED = [];

for (const entry of ACCEPTED) {
  if (!entry?.id || !entry?.reason || !entry?.retireWhen) {
    console.error(
      "Security audit gate configuration is invalid: every acceptance needs id/reason/retireWhen.",
    );
    process.exit(1);
  }
}

const acceptedIds = new Set(ACCEPTED.map((entry) => entry.id));
if (acceptedIds.size !== ACCEPTED.length) {
  console.error(
    "Security audit gate configuration is invalid: accepted advisory ids must be unique.",
  );
  process.exit(1);
}

let payload;
try {
  const lockfile = JSON.parse(
    readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"),
  );
  payload = buildProductionPackagePayload(lockfile);
} catch (error) {
  console.error(
    `Security audit gate FAILED - package-lock.json could not be prepared: ${
      error instanceof Error ? error.message : "unknown error"
    }`,
  );
  process.exit(1);
}

const installedVersionCount = countPackageVersions(payload);
console.log(
  `Security audit: checking ${installedVersionCount} installed production package versions ` +
    `across ${Object.keys(payload).length} packages.`,
);

let advisories;
let auditSource;
let npmFailure;

try {
  const report = await requestBulkAdvisories(payload, {
    registry: process.env.NPM_AUDIT_REGISTRY || "https://registry.npmjs.org/",
    attempts: 1,
    timeoutMs: 60_000,
    onBatch: ({ batchNumber, batchCount, packageCount }) => {
      console.log(
        `Security audit: npm batch ${batchNumber}/${batchCount} (${packageCount} packages).`,
      );
    },
  });
  advisories = flattenBulkAdvisories(report);
  auditSource = "npm Bulk Advisory";
} catch (error) {
  npmFailure = error instanceof Error ? error.message : "unknown npm audit error";
  console.warn(`Security audit: npm was inconclusive (${npmFailure}).`);
  console.warn("Security audit: querying OSV.dev as the authoritative fallback.");

  try {
    advisories = await requestOsvAdvisories(payload, {
      onBatch: ({ batchNumber, batchCount, queryCount }) => {
        console.log(
          `Security audit: OSV batch ${batchNumber}/${batchCount} (${queryCount} package versions).`,
        );
      },
    });
    auditSource = "OSV.dev";
  } catch (osvError) {
    console.error(
      "Security audit gate FAILED - neither authoritative vulnerability source returned a usable report.",
    );
    console.error(`  npm reported: ${npmFailure}`);
    console.error(
      `  OSV reported: ${osvError instanceof Error ? osvError.message : "unknown OSV audit error"}`,
    );
    console.error("  Re-run with registry access. Do not treat an inconclusive audit as a pass.");
    process.exit(1);
  }
}

const { blocking, accepted } = classifyHighSeverityAdvisories(advisories, acceptedIds);

for (const entry of accepted) {
  const record = ACCEPTED.find((candidate) => candidate.id === entry.id);
  console.log(
    `ACCEPTED RISK: ${entry.id} (${entry.packageName}) - ${entry.title}\n` +
      `  why unreachable: ${record.reason}\n  retire when: ${record.retireWhen}`,
  );
}

if (blocking.length) {
  console.error(
    `Security audit gate failed via ${auditSource} - unaccepted high/critical production advisories:`,
  );
  for (const entry of blocking) {
    console.error(
      `- ${entry.severity.toUpperCase()} ${entry.id} in ${entry.packageName}: ${entry.title} ` +
        `(affected: ${entry.vulnerableVersions})`,
    );
  }
  console.error(
    "Fix the dependency, or (only for a provably unreachable path with no available fix) add an " +
      "explicit acceptance with justification and retirement condition in scripts/check-security-audit.mjs.",
  );
  process.exit(1);
}

console.log(
  `Security audit gate passed via ${auditSource}: 0 unaccepted high/critical production advisories across ` +
    `${installedVersionCount} installed production package versions` +
    `${accepted.length ? ` (${accepted.length} explicitly accepted, listed above)` : ""}.`,
);
