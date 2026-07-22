/**
 * Database Health Check & Optimization Utility
 * ---------------------------------------------------------------------------
 * Validates PostgreSQL database schema, indexes, and performance settings
 * specific to the Supabase/Wireline deployment.
 *
 * Run via: npm run db:health
 * Or programmatically: await runDatabaseHealthCheck()
 */

import { Pool } from "pg";
import { log } from "./server-context";

export interface HealthCheckResult {
  healthy: boolean;
  issues: string[];
  warnings: string[];
  optimizations: string[];
  stats: {
    tableCount: number;
    indexCount: number;
    totalRowsEstimate: number;
    largestTables: Array<{ name: string; rows: number; size: string }>;
    missingIndexes: string[];
    slowQueries: string[];
  };
}

/**
 * Run comprehensive database health check
 */
export async function runDatabaseHealthCheck(): Promise<HealthCheckResult> {
  const result: HealthCheckResult = {
    healthy: true,
    issues: [],
    warnings: [],
    optimizations: [],
    stats: {
      tableCount: 0,
      indexCount: 0,
      totalRowsEstimate: 0,
      largestTables: [],
      missingIndexes: [],
      slowQueries: [],
    },
  };

  const dbUrl = process.env.POSTGRES_URL;

  if (!dbUrl) {
    result.healthy = false;
    result.issues.push("POSTGRES_URL environment variable not set");
    return result;
  }

  const pool = new Pool({ connectionString: dbUrl });

  try {
    const client = await pool.connect();

    // 1. Check connection and basic stats
    const versionResult = await client.query("SELECT version()");
    log.info("PostgreSQL version", { version: versionResult.rows[0]?.version });

    // 2. Check table count
    const tableCountResult = await client.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    `);
    result.stats.tableCount = parseInt(tableCountResult.rows[0]?.count || "0");

    // 3. Check index count
    const indexCountResult = await client.query(`
      SELECT COUNT(*) as count 
      FROM pg_indexes 
      WHERE schemaname = 'public'
    `);
    result.stats.indexCount = parseInt(indexCountResult.rows[0]?.count || "0");

    // 4. Check for required tables
    const requiredTables = [
      "wireline_users",
      "wireline_settings",
      "wireline_agents",
      "wireline_call_logs",
      "wireline_subscriptions",
      "wireline_design_profiles",
    ];

    for (const table of requiredTables) {
      const tableExists = await client.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        )`,
        [table],
      );
      if (!tableExists.rows[0]?.exists) {
        result.healthy = false;
        result.issues.push(`Required table missing: ${table}`);
      }
    }

    const requiredColumns = [
      { table: "wireline_settings", column: "signup_plan_interest" },
      { table: "wireline_settings", column: "signup_wedge" },
      { table: "wireline_settings", column: "acquisition_source" },
      { table: "wireline_settings", column: "acquisition_medium" },
      { table: "wireline_settings", column: "acquisition_campaign" },
      {
        table: "wireline_director_conversation_messages",
        column: "thread_key",
      },
    ];

    /** RLS on, zero policies — service-role-only tables (see DATABASE_SETUP.md). */
    const serviceRoleLockdownTables = new Set([
      "wireline_oauth_pending_codes",
      "wireline_stripe_events",
      "wireline_call_reliability_staging",
      "wireline_webhook_health",
      "wireline_demo_call_events",
    ]);

    for (const { table, column } of requiredColumns) {
      const columnExists = await client.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_schema = 'public'
          AND table_name = $1
          AND column_name = $2
        )`,
        [table, column],
      );
      if (!columnExists.rows[0]?.exists) {
        result.healthy = false;
        result.issues.push(`Required column missing: ${table}.${column}`);
      }
    }

    // 5. Check for critical indexes
    const criticalIndexes = [
      { table: "wireline_users", column: "email" },
      { table: "wireline_agents", column: "user_id" },
      { table: "wireline_call_logs", column: "user_id" },
      { table: "wireline_call_logs", column: "vapi_call_id" },
      { table: "wireline_subscriptions", column: "user_id" },
      { table: "wireline_recap_artifacts", column: "agent_id" },
    ];

    for (const { table, column } of criticalIndexes) {
      const indexExists = await client.query(
        `SELECT EXISTS (
          SELECT 1 FROM pg_indexes 
          WHERE schemaname = 'public' 
          AND tablename = $1
          AND indexdef LIKE $2
        )`,
        [table, `%(${column})%`],
      );
      if (!indexExists.rows[0]?.exists) {
        result.warnings.push(`Missing index on ${table}(${column})`);
        result.stats.missingIndexes.push(`${table}(${column})`);
      }
    }

    // 6. Check table sizes and row counts
    const tableStats = await client.query(`
      SELECT 
        relname as table_name,
        n_live_tup as row_count,
        pg_size_pretty(pg_total_relation_size(relid)) as size
      FROM pg_stat_user_tables
      WHERE schemaname = 'public'
      ORDER BY n_live_tup DESC
      LIMIT 10
    `);

    result.stats.largestTables = tableStats.rows.map(
      (row: { table_name: string; row_count: string; size: string }) => ({
        name: row.table_name,
        rows: parseInt(row.row_count || "0"),
        size: row.size,
      }),
    );

    result.stats.totalRowsEstimate = result.stats.largestTables.reduce((sum, t) => sum + t.rows, 0);

    // 7. Check for foreign key constraint issues
    const fkCheck = await client.query(`
      SELECT 
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
    `);

    if (fkCheck.rows.length < 10) {
      result.warnings.push("Low foreign key count - verify referential integrity setup");
    }

    // 8. Check for bloat in heavily updated tables
    const bloatCheck = await client.query(`
      SELECT schemaname, relname as tablename, 
        n_tup_ins as inserts,
        n_tup_upd as updates,
        n_tup_del as deletes
      FROM pg_stat_user_tables
      WHERE n_tup_upd + n_tup_del > n_tup_ins * 0.5
      AND schemaname = 'public'
      LIMIT 5
    `);

    if (bloatCheck.rows.length > 0) {
      result.optimizations.push(
        `Consider VACUUM ANALYZE for frequently updated tables: ${bloatCheck.rows.map((r: { tablename: string }) => r.tablename).join(", ")}`,
      );
    }

    // 9. Check connection pool settings
    const poolStats = await client.query(`
      SELECT 
        count(*) as total_connections,
        count(*) FILTER (WHERE state = 'active') as active_connections,
        count(*) FILTER (WHERE state = 'idle') as idle_connections
      FROM pg_stat_activity
      WHERE datname = current_database()
    `);

    const activeConnections = parseInt(poolStats.rows[0]?.active_connections || "0");
    if (activeConnections > 80) {
      result.warnings.push(
        `High active connection count (${activeConnections}) - monitor pool sizing`,
      );
    }

    // 10. Check for long-running queries
    const longQueries = await client.query(`
      SELECT pid, state, query_start, query
      FROM pg_stat_activity
      WHERE state = 'active'
      AND query_start < NOW() - INTERVAL '30 seconds'
      AND query NOT LIKE '%pg_stat_activity%'
      LIMIT 5
    `);

    if (longQueries.rows.length > 0) {
      result.warnings.push(`${longQueries.rows.length} long-running queries detected (>30s)`);
      result.stats.slowQueries = longQueries.rows.map((r: { query: string }) =>
        r.query.substring(0, 100),
      );
    }

    // 11. Verify RLS is enabled on appropriate tables
    const rlsCheck = await client.query(`
      SELECT tablename, relrowsecurity as rls_enabled
      FROM pg_tables
      JOIN pg_class ON pg_tables.tablename = pg_class.relname
      WHERE schemaname = 'public'
      AND tablename IN ('wireline_users', 'wireline_settings', 'wireline_agents', 'wireline_call_logs')
    `);

    for (const row of rlsCheck.rows) {
      if (!row.rls_enabled) {
        result.warnings.push(`Row Level Security not enabled on ${row.tablename}`);
      }
    }

    const rlsNoPolicy = await client.query(`
      SELECT t.tablename
      FROM pg_tables t
      WHERE t.schemaname = 'public'
        AND t.rowsecurity = true
        AND NOT EXISTS (
          SELECT 1 FROM pg_policies p
          WHERE p.schemaname = t.schemaname AND p.tablename = t.tablename
        )
      ORDER BY t.tablename
    `);
    for (const row of rlsNoPolicy.rows as Array<{ tablename: string }>) {
      if (!serviceRoleLockdownTables.has(row.tablename) && !row.tablename.includes("_backup_")) {
        result.healthy = false;
        result.issues.push(
          `RLS enabled but no policies on ${row.tablename} (expected only oauth_pending_codes + stripe_events)`,
        );
      }
    }

    // 12. Check for unused indexes (maintenance recommendation)
    const unusedIndexes = await client.query(`
      SELECT schemaname, relname as tablename, indexrelname
      FROM pg_stat_user_indexes
      WHERE idx_scan = 0 
      AND schemaname = 'public'
      AND indexrelname NOT LIKE '%pkey%'
      LIMIT 10
    `);

    if (unusedIndexes.rows.length > 5) {
      result.optimizations.push(
        `${unusedIndexes.rows.length} potentially unused indexes found - consider removing for write performance`,
      );
    }

    client.release();
    await pool.end();

    // Final health determination
    if (result.issues.length > 0) {
      result.healthy = false;
    }

    log.info("Database health check completed", {
      healthy: result.healthy,
      issueCount: result.issues.length,
      warningCount: result.warnings.length,
      optimizationCount: result.optimizations.length,
      tableCount: result.stats.tableCount,
      indexCount: result.stats.indexCount,
    });

    return result;
  } catch (error) {
    result.healthy = false;
    result.issues.push(
      `Health check failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    log.error("Database health check failed", { error });
    return result;
  }
}

/**
 * Print health check results in a readable format
 */
/* eslint-disable no-console -- CLI output function; intentional use of console for terminal display. */
export function printHealthReport(result: HealthCheckResult): void {
  console.log("\n" + "=".repeat(70));
  console.log("WIRELINE DATABASE HEALTH REPORT");
  console.log("=".repeat(70));

  console.log(`\nStatus: ${result.healthy ? "✅ HEALTHY" : "❌ ISSUES DETECTED"}`);

  console.log("\n📊 STATISTICS:");
  console.log(`  Tables: ${result.stats.tableCount}`);
  console.log(`  Indexes: ${result.stats.indexCount}`);
  console.log(`  Estimated Total Rows: ${result.stats.totalRowsEstimate.toLocaleString()}`);

  if (result.stats.largestTables.length > 0) {
    console.log("\n📈 LARGEST TABLES:");
    result.stats.largestTables.slice(0, 5).forEach((t) => {
      console.log(`  • ${t.name}: ${t.rows.toLocaleString()} rows (${t.size})`);
    });
  }

  if (result.issues.length > 0) {
    console.log("\n❌ CRITICAL ISSUES:");
    result.issues.forEach((issue) => console.log(`  • ${issue}`));
  }

  if (result.warnings.length > 0) {
    console.log("\n⚠️ WARNINGS:");
    result.warnings.forEach((warning) => console.log(`  • ${warning}`));
  }

  if (result.optimizations.length > 0) {
    console.log("\n💡 OPTIMIZATION RECOMMENDATIONS:");
    result.optimizations.forEach((opt) => console.log(`  • ${opt}`));
  }

  if (result.stats.missingIndexes.length > 0) {
    console.log("\n🔧 MISSING INDEXES:");
    result.stats.missingIndexes.forEach((idx) => console.log(`  • ${idx}`));
  }

  console.log("\n" + "=".repeat(70));
}
/* eslint-enable no-console */

/**
 * Get recommended indexes for better query performance
 */
export function getRecommendedIndexes(): Array<{
  table: string;
  columns: string[];
  reason: string;
}> {
  return [
    {
      table: "wireline_call_logs",
      columns: ["user_id", "created_at DESC"],
      reason: "Frequently queried for user's recent call history",
    },
    {
      table: "wireline_email_threads",
      columns: ["user_id", "last_message_at DESC"],
      reason: "Inbox queries sorted by recency",
    },
    {
      table: "wireline_campaigns",
      columns: ["user_id", "status"],
      reason: "Active campaign lookups by user",
    },
    {
      table: "wireline_audit_log",
      columns: ["user_id", "created_at DESC"],
      reason: "Audit queries for compliance reporting",
    },
  ];
}

/**
 * Generate SQL to create missing indexes
 */
export function generateIndexSql(
  recommendations: ReturnType<typeof getRecommendedIndexes>,
): string {
  return recommendations
    .map(
      (rec) => `-- ${rec.reason}
CREATE INDEX IF NOT EXISTS idx_${rec.table}_${rec.columns.join("_").replace(/ DESC/g, "_desc")} 
ON ${rec.table} (${rec.columns.join(", ")});`,
    )
    .join("\n\n");
}
