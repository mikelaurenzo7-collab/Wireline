#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";

import { validateVisualQaManifest } from "./visual-qa-manifest.mjs";

const smokeMode = process.argv.includes("--smoke");
const manifestArgument =
  process.argv.slice(2).find((argument) => argument !== "--smoke") ||
  process.env.WIRELINE_VISUAL_MANIFEST;
if (!manifestArgument) {
  console.error(
    "Usage: node scripts/check-visual-qa-manifest.mjs [--smoke] <path/to/manifest.json>",
  );
  process.exit(2);
}

const manifestPath = path.resolve(manifestArgument);
let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch (error) {
  console.error(
    `Visual QA manifest could not be read: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}

const smokeBlockingKinds = new Set([
  "http",
  "navigation",
  "capture",
  "overflow",
  "control-overflow",
  "redirect",
  "auth",
]);
const errors = smokeMode
  ? (Array.isArray(manifest.issues) ? manifest.issues : [])
      .filter((issue) => smokeBlockingKinds.has(issue?.kind))
      .map(
        (issue) =>
          `[${issue?.kind || "issue"}] ${issue?.viewport || "unknown"} ${issue?.route || "unknown"}: ${issue?.detail || "No detail"}`,
      )
  : validateVisualQaManifest(manifest, {
      manifestDir: path.dirname(manifestPath),
      checkFiles: true,
    });

if (errors.length > 0) {
  console.error(`Visual QA gate failed: ${errors.length} unexplained problem(s).`);
  for (const error of errors.slice(0, 80)) console.error(`- ${error}`);
  if (errors.length > 80) console.error(`- ...and ${errors.length - 80} more.`);
  process.exit(1);
}

console.log(
  smokeMode
    ? `Visual QA smoke manifest passed (${Array.isArray(manifest.issues) ? manifest.issues.length : 0} recorded issue(s)).`
    : `Visual QA manifest passed: ${manifest.screenshotCountActual} settled viewport captures, including authenticated routes.`,
);
