#!/usr/bin/env node
/**
 * Guard against service-role inserts into tenant-owned tables without an
 * explicit `userId` or `userId`-bearing values variable nearby.
 *
 * This is intentionally conservative. It does not try to parse TypeScript; it
 * catches the easy-to-miss class of bugs that previously caused cross-tenant
 * orphan rows when a route inserted into a tenant table but forgot `userId`.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const USER_SCOPED_TABLES = new Set([
  "agents",
  "appointments",
  "auditLog",
  "calendarAccounts",
  "calendarEvents",
  "cadences",
  "cadenceRuns",
  "callLogs",
  "clonedVoices",
  "crmConnections",
  "directives",
  "dncList",
  "emailAccounts",
  "emailMessages",
  "emailThreads",
  "fleetTasks",
  "goals",
  "intakeKeys",
  "knowledge",
  "leadDossiers",
  "outboundCampaigns",
  "outboundLeads",
  "personality",
  "phoneNumbers",
  "quotaLimits",
  "quotaUsage",
  "settings",
  "smsMessages",
  "smsThreads",
  "spendAlerts",
  "spendBudgets",
  "supervisorSubscriptions",
  "teamMembers",
  "webhooks",
  "webhookDeliveries",
]);

const VALUE_VARIABLE_HINTS = [
  "user",
  "tenant",
  "lead",
  "rows",
  "values",
  "payload",
  "record",
  "data",
  "settings",
];

function parseArgs(argv) {
  const options = { sourceDir: "src" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--source-dir") {
      const next = argv[index + 1];
      if (!next) throw new Error("--source-dir requires a directory path");
      options.sourceDir = next;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function collectSourceFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(entryPath));
    } else if (
      /\.(ts|tsx)$/.test(entry.name) &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".test.tsx")
    ) {
      files.push(entryPath);
    }
  }
  return files.sort();
}

function findTenantInsertIssues(files) {
  const issues = [];

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const matches = source.matchAll(/insert\(schema\.(\w+)\)\.values\(([\s\S]{0,900}?)\)/g);
    for (const match of matches) {
      const [, table, valuesSnippet] = match;
      if (!USER_SCOPED_TABLES.has(table)) continue;

      const nearbySource = source.slice(Math.max(0, match.index - 900), match.index + 1400);
      if (/\buserId\b/.test(valuesSnippet) || /\buserId\b/.test(nearbySource)) continue;
      if (
        VALUE_VARIABLE_HINTS.some((hint) =>
          new RegExp(`\\b${hint}\\w*\\b`, "i").test(valuesSnippet),
        )
      ) {
        continue;
      }
      const line = source.slice(0, match.index).split("\n").length;
      issues.push(`${file}:${line} inserts schema.${table} without an obvious userId`);
    }
  }

  return issues;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const files = collectSourceFiles(options.sourceDir);
  const issues = findTenantInsertIssues(files);

  if (issues.length) {
    console.error("Tenant insert guard failed:\n");
    for (const issue of issues) console.error(`  - ${issue}`);
    process.exit(1);
  }

  console.log("✅ Tenant-owned inserts include an obvious userId or user-scoped values object");
}

main();
