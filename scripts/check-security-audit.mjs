#!/usr/bin/env node
/**
 * Production-dependency vulnerability gate.
 *
 * Runs `npm audit --omit=dev` and fails on any high/critical advisory that is
 * not explicitly accepted below. A plain `npm audit --audit-level=high` can
 * never pass while an unfixable-but-unreachable advisory exists, and a gate
 * that is permanently red trains everyone to ignore it — this keeps the
 * ladder green AND fully sensitive to anything new.
 *
 * Every acceptance must name the advisory, justify why the vulnerable path is
 * unreachable here, and state the condition that retires the acceptance. An
 * acceptance whose condition has been met should be deleted in the same PR
 * that acts on it.
 */
import { execSync } from "node:child_process";

const ACCEPTED = [
  {
    id: "GHSA-qwww-vcr4-c8h2",
    module: "react-router",
    reason:
      "RSC-mode CSRF (action execution before 400). Wireline uses plain <Routes> JSX client routing — " +
      "no RSC, no data-router `action`s, no useActionData — so the vulnerable path is unreachable. " +
      "No patched release exists on the react-router-dom 7.x line (7.18.1 is latest; npm's only 'fix' " +
      "is a seven-minor downgrade to 7.11.0).",
    retireWhen:
      "react-router-dom publishes a 7.x/8.x release above the advisory range — upgrade and delete this entry.",
  },
];

const acceptedIds = new Set(ACCEPTED.map((entry) => entry.id));

let raw;
try {
  raw = execSync("npm audit --json --omit=dev", { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
} catch (error) {
  // npm audit exits non-zero when advisories exist; the JSON body still lands
  // on stdout. Anything without parseable stdout is a real failure.
  raw = error.stdout;
  if (!raw) {
    console.error("npm audit did not produce output:", error.message);
    process.exit(1);
  }
}

const report = JSON.parse(raw);
const vulnerabilities = report.vulnerabilities || {};
const blocking = [];
const accepted = [];

for (const [name, vuln] of Object.entries(vulnerabilities)) {
  if (!["high", "critical"].includes(vuln.severity)) continue;
  const advisories = (vuln.via || []).filter((via) => typeof via === "object");
  // Transitive entries (via = package-name strings only) are counted through
  // their root advisory; skip them so one advisory is judged exactly once.
  if (!advisories.length) continue;
  for (const advisory of advisories) {
    const ghsa = (advisory.url || "").split("/").pop();
    if (acceptedIds.has(ghsa)) {
      accepted.push({ name, ghsa, title: advisory.title });
    } else {
      blocking.push({ name, ghsa, severity: vuln.severity, title: advisory.title });
    }
  }
}

for (const entry of accepted) {
  const record = ACCEPTED.find((candidate) => candidate.id === entry.ghsa);
  console.log(
    `ACCEPTED RISK: ${entry.ghsa} (${entry.name}) — ${entry.title}\n` +
      `  why unreachable: ${record.reason}\n  retire when: ${record.retireWhen}`,
  );
}

if (blocking.length) {
  console.error("Security audit gate failed — unaccepted high/critical advisories:");
  for (const entry of blocking) {
    console.error(`- ${entry.severity.toUpperCase()} ${entry.ghsa} in ${entry.name}: ${entry.title}`);
  }
  console.error(
    "Fix the dependency, or (only for a provably unreachable path with no available fix) add an " +
      "explicit acceptance with justification and retirement condition in scripts/check-security-audit.mjs.",
  );
  process.exit(1);
}

console.log(
  `Security audit gate passed: 0 unaccepted high/critical production advisories` +
    `${accepted.length ? ` (${accepted.length} explicitly accepted, listed above)` : ""}.`,
);
