#!/usr/bin/env node
/**
 * Diagnostic twin of run-test-estate.mjs.
 *
 * Vercel can truncate a complete Vitest failure report after a large source
 * diff. This runner keeps the same credential-free estate, writes Vitest's JSON
 * report to a disposable file, and prints only failed files, failed tests, and
 * the first useful lines of each failure. It is used only by explicitly marked
 * preview release audits; canonical production keeps the standard runner.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";

import { buildTestEstateEnvironment } from "./lib/test-estate-environment.mjs";

const source = process.env;
const isolatedHome = mkdtempSync(join(tmpdir(), "wireline-test-estate-compact-"));
const reportPath = join(isolatedHome, "vitest-report.json");
const env = buildTestEstateEnvironment(source, isolatedHome);

writeFileSync(env.NPM_CONFIG_USERCONFIG, "", { encoding: "utf8" });
writeFileSync(env.GIT_CONFIG_GLOBAL, "", { encoding: "utf8" });

const vitest = resolve(process.cwd(), "node_modules/vitest/vitest.mjs");
const extraArgs = process.argv.slice(2);
let result;
let report;

try {
  result = spawnSync(
    process.execPath,
    [
      vitest,
      "run",
      "--exclude",
      "tests/e2e/**",
      "--reporter=json",
      `--outputFile=${reportPath}`,
      ...extraArgs,
    ],
    {
      cwd: process.cwd(),
      env,
      stdio: ["ignore", "inherit", "inherit"],
    },
  );

  try {
    report = JSON.parse(readFileSync(reportPath, "utf8"));
  } catch (error) {
    console.error(
      `Compact test reporter could not read ${basename(reportPath)}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (report) {
    const failedResults = Array.isArray(report.testResults)
      ? report.testResults.filter((entry) => entry?.status === "failed")
      : [];

    console.error("\n=== COMPACT FULL-ESTATE FAILURE REPORT ===");
    console.error(
      `Failed files: ${report.numFailedTestSuites ?? failedResults.length}; ` +
        `failed tests: ${report.numFailedTests ?? "unknown"}.`,
    );

    for (const fileResult of failedResults) {
      const fileName = fileResult.name
        ? relative(process.cwd(), fileResult.name).replaceAll("\\", "/")
        : "unknown test file";
      console.error(`\nFAIL ${fileName}`);

      const failedAssertions = Array.isArray(fileResult.assertionResults)
        ? fileResult.assertionResults.filter((assertion) => assertion?.status === "failed")
        : [];

      if (failedAssertions.length === 0 && fileResult.message) {
        console.error(compactFailure(fileResult.message));
      }

      for (const assertion of failedAssertions) {
        const title = [...(assertion.ancestorTitles || []), assertion.title]
          .filter(Boolean)
          .join(" > ");
        console.error(`  - ${title || "collection failure"}`);
        const failure = Array.isArray(assertion.failureMessages)
          ? assertion.failureMessages.find(Boolean)
          : null;
        if (failure) console.error(indent(compactFailure(failure), "    "));
      }
    }
    console.error("\n=== END COMPACT FAILURE REPORT ===\n");
  }
} finally {
  rmSync(isolatedHome, { recursive: true, force: true });
}

if (result?.error) throw result.error;
if (result?.signal) {
  console.error(`Clean-room test estate terminated by signal ${result.signal}.`);
  process.exit(1);
}
process.exit(result?.status ?? 1);

function compactFailure(value) {
  const lines = String(value)
    .replaceAll("\r\n", "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => {
      const trimmed = line.trim();
      return (
        trimmed &&
        !trimmed.startsWith("at ") &&
        !trimmed.startsWith("❯ ") &&
        !/^[-+ ]?Expected$/i.test(trimmed) &&
        !/^[-+ ]?Received$/i.test(trimmed)
      );
    });
  return lines.slice(0, 18).join("\n");
}

function indent(value, prefix) {
  return String(value)
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}
