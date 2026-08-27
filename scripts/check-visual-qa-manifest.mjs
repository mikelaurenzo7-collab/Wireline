#!/usr/bin/env node
/**
 * Fail CI when visual QA manifest contains P0 layout/auth/navigation issues.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const manifestPath = process.argv[2] || process.env.WIRELINE_VISUAL_MANIFEST;
if (!manifestPath) {
  console.error("Usage: node scripts/check-visual-qa-manifest.mjs <path/to/manifest.json>");
  process.exit(2);
}

const P0_KINDS = new Set([
  "http",
  "navigation",
  "capture",
  "overflow",
  "control-overflow",
  "redirect",
  "auth",
  "console",
  "pageerror",
  // The capture script records this when #root never mounted — a screenshot of
  // a proxy/gateway interstitial is not evidence the app rendered, and the
  // gate must agree with the capture script about what counts as P0.
  "shell-not-mounted",
]);

const manifest = JSON.parse(readFileSync(path.resolve(manifestPath), "utf8"));
const issues = Array.isArray(manifest.issues) ? manifest.issues : [];
const p0 = issues.filter((issue) => P0_KINDS.has(issue.kind));
const exactCommit = /^[0-9a-f]{40}$/i;
const sourceCommit = String(manifest.sourceCommit || "").toLowerCase();
const sourceBefore = String(manifest.sourceVerificationBefore?.deployedCommit || "").toLowerCase();
const sourceAfter = String(manifest.sourceVerificationAfter?.deployedCommit || "").toLowerCase();

if (manifest.qaAccountConfigured !== true || manifest.authenticatedCapture !== true) {
  console.error(
    "Visual QA authentication gate failed: a verified dedicated demo account was not captured.",
  );
  process.exit(1);
}

if (
  !exactCommit.test(sourceCommit) ||
  sourceBefore !== sourceCommit ||
  sourceAfter !== sourceCommit
) {
  console.error(
    "Visual QA source gate failed: the checkout and pre/post-capture production commits do not match.",
  );
  process.exit(1);
}

if (p0.length) {
  console.error(`Visual QA P0 gate failed: ${p0.length} issue(s)`);
  for (const issue of p0.slice(0, 20)) {
    console.error(`  [${issue.kind}] ${issue.viewport} ${issue.route}: ${issue.detail}`);
  }
  process.exit(1);
}

console.log(`Visual QA manifest ok (${issues.length} non-blocking issue(s) ignored)`);
