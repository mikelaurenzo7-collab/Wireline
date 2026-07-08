#!/usr/bin/env ts-node
/**
 * Database Health Check Script
 * ---------------------------------------------------------------------------
 * Run this to verify your PostgreSQL database is optimally configured.
 *
 * Usage: npm run db:health
 */

import "../src/lib/load-env";
import { runDatabaseHealthCheck, printHealthReport } from "../src/lib/db-health-check";

async function main() {
  console.log("🔍 Running Wireline database health check...\n");

  const result = await runDatabaseHealthCheck();
  printHealthReport(result);

  if (!result.healthy) {
    console.log("\n❌ Database has critical issues. Please address before production.");
    process.exit(1);
  } else if (result.warnings.length > 0) {
    console.log("\n⚠️ Database is functional but has warnings to review.");
    process.exit(0);
  } else {
    console.log("\n✅ Database is optimally configured!");
    process.exit(0);
  }
}

main();
