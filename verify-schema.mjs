import pkg from "pg";
const { Client } = pkg;

const DB_URL =
  "postgresql://postgres.ogenlhodmwvyacvnrsnj:pNTS8jYf2vfYPLkj@aws-1-us-east-2.pooler.supabase.com:6543/postgres";

const client = new Client({ connectionString: DB_URL, statement_timeout: 10000 });

const issues = [];

function record(severity, table, detail) {
  issues.push({ severity, table, detail });
}

async function main() {
  await client.connect();
  console.log("Connected to Supabase Postgres.\n");

  // 1. ALL columns for agents table
  console.log("=== 1. wireline_agents columns ===");
  const { rows: agentCols } = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='wireline_agents'
    ORDER BY ordinal_position
  `);
  const agentColNames = agentCols.map((r) => r.column_name);
  console.log(`  Total: ${agentCols.length} columns`);
  console.log("  " + agentColNames.join(", "));
  if (!agentColNames.includes("updated_at")) {
    record("HIGH", "wireline_agents", `Missing updated_at — ${agentCols.length} mutable columns, no update timestamp`);
  }
  // Check timestamp columns
  const tsCols = agentColNames.filter((c) => c.endsWith("_at"));
  console.log(`  Timestamp columns: ${tsCols.join(", ") || "NONE"}`);

  // 2. userId nullable across all wireline tables
  console.log("\n=== 2. userId nullable check ===");
  const { rows: nullableUserId } = await client.query(`
    SELECT table_name, is_nullable FROM information_schema.columns
    WHERE table_schema='public' AND column_name = 'user_id' AND is_nullable = 'YES'
    ORDER BY table_name
  `);
  console.log(`  Tables with nullable user_id: ${nullableUserId.length}`);
  if (nullableUserId.length > 0) {
    nullableUserId.forEach((r) => console.log(`    ${r.table_name} = ${r.is_nullable}`));
  }
  if (nullableUserId.length > 10) {
    record("HIGH", "multiple", `${nullableUserId.length} tables have nullable user_id`);
  }

  // Also check userId (camelCase)
  const { rows: nullableUserIdCamel } = await client.query(`
    SELECT table_name, column_name, is_nullable FROM information_schema.columns
    WHERE table_schema='public' AND column_name IN ('userId', 'user_id') AND is_nullable = 'YES'
    ORDER BY table_name
  `);
  console.log(`  Tables with nullable userId/user_id (total): ${nullableUserIdCamel.length}`);

  // 3. FK indexes
  console.log("\n=== 3. FK index checks ===");
  const fksToCheck = [
    { table: "wireline_appointments", col: "agent_id" },
    { table: "wireline_email_threads", col: "account_id" },
    { table: "wireline_call_queues", col: "team_id" },
    { table: "wireline_outbound_leads", col: "agent_id" },
  ];
  for (const { table, col } of fksToCheck) {
    const { rows: idxs } = await client.query(
      `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename=$1`,
      [table],
    );
    const hasIndex = idxs.some(
      (i) => i.indexdef && i.indexdef.includes(`"${col}"`),
    );
    const allIndexes = idxs.map((i) => i.indexname).join(", ");
    console.log(`  ${table}.${col}: ${hasIndex ? "INDEXED" : "NO INDEX"} (indexes: ${allIndexes || "none"})`);
    if (!hasIndex) {
      record("MEDIUM", table, `Missing index on FK ${col}`);
    }
  }

  // 4. Tables missing updated_at
  console.log("\n=== 4. Missing updated_at ===");
  const tablesNeedingUA = [
    "wireline_directives",
    "wireline_personality",
    "wireline_agent_teams",
    "wireline_call_queues",
    "wireline_cadences",
    "wireline_fleet_tasks",
    "wireline_webhooks",
    "wireline_onboarding_progress",
  ];
  for (const t of tablesNeedingUA) {
    const { rows: cols } = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name='updated_at'`,
      [t],
    );
    console.log(`  ${t}: ${cols.length > 0 ? "HAS updated_at" : "MISSING"}`);
    if (cols.length === 0) record("MEDIUM", t, "Missing updated_at");
  }

  // 5. Unbounded text fields - use actual column names
  console.log("\n=== 5. Unbounded text fields ===");
  const { rows: unboundedText } = await client.query(`
    SELECT table_name, column_name, character_maximum_length
    FROM information_schema.columns
    WHERE table_schema='public' AND data_type = 'character varying'
      AND table_name IN ('wireline_users','wireline_agents','wireline_password_reset_tokens','wireline_email_verification_tokens')
      AND column_name IN ('email','password_hash','name','token_hash')
    ORDER BY table_name, column_name
  `);
  if (unboundedText.length === 0) {
    console.log("  No varchar columns found — columns likely use 'text' (unbounded). Checking text type...");
    const { rows: textCols } = await client.query(`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema='public' AND data_type='text'
        AND table_name IN ('wireline_users','wireline_agents','wireline_password_reset_tokens','wireline_email_verification_tokens')
        AND column_name IN ('email','password_hash','name','token_hash')
      ORDER BY table_name, column_name
    `);
    textCols.forEach((r) => console.log(`  ${r.table_name}.${r.column_name}: text (unbounded)`));
    if (textCols.length > 0) {
      record("LOW", "multiple", `${textCols.length} columns use unbounded text — no length constraints`);
    }
  }

  // 6. RLS policies
  console.log("\n=== 6. RLS policies ===");
  const { rows: rls } = await client.query(`
    SELECT tablename, policyname, cmd, qual FROM pg_policies
    WHERE schemaname='public'
    ORDER BY tablename, policyname
  `);
  console.log(`  Total RLS policies: ${rls.length}`);
  const rlsTables = [...new Set(rls.map((r) => r.tablename))];
  console.log(`  Tables with RLS: ${rlsTables.length}`);
  rlsTables.forEach((t) => console.log(`    ${t}`));
  if (rls.length < 30) {
    record("MEDIUM", "rls", `Only ${rls.length} RLS policies for 56 tables — check coverage`);
  }

  // 7. Stripe events
  console.log("\n=== 7. wireline_stripe_events ===");
  const { rows: stripeCols } = await client.query(`
    SELECT column_name, data_type, is_nullable FROM information_schema.columns
    WHERE table_schema='public' AND table_name='wireline_stripe_events'
    ORDER BY ordinal_position
  `);
  console.log(`  Columns: ${stripeCols.map((r) => `${r.column_name}(${r.data_type})`).join(", ")}`);
  const stripeColNames = stripeCols.map((r) => r.column_name);
  if (!stripeColNames.includes("status")) {
    record("CRITICAL", "wireline_stripe_events", "Missing 'status' column — webhook events lost on process death between insert and processing");
  }

  // 8. Row counts
  console.log("\n=== 8. Row counts ===");
  const countTables = [
    "wireline_users",
    "wireline_agents",
    "wireline_call_logs",
    "wireline_audit_log",
    "wireline_jobs",
    "wireline_subscriptions",
    "wireline_stripe_events",
  ];
  for (const t of countTables) {
    try {
      const { rows: c } = await client.query(`SELECT count(*) as n FROM ${t}`);
      console.log(`  ${t}: ${c[0].n} rows`);
    } catch (e) {
      console.log(`  ${t}: ERROR - ${e.message}`);
    }
  }

  // 9. Email suppressions
  console.log("\n=== 9. Email suppressions ===");
  try {
    const { rows: suppCount } = await client.query(`SELECT count(*) as n FROM wireline_email_suppressions`);
    console.log(`  rows: ${suppCount[0].n}`);
  } catch (e) {
    console.log(`  ERROR: ${e.message}`);
  }

  // 10. Migrations
  console.log("\n=== 10. Drizzle migrations ===");
  try {
    const { rows: meta } = await client.query(`SELECT count(*) as n FROM "__drizzle_migrations"`);
    console.log(`  Applied: ${meta[0].n}`);
  } catch (e) {
    console.log(`  ERROR: ${e.message}`);
  }

  // 11. Quota usage table
  console.log("\n=== 11. wireline_quota_usage ===");
  try {
    const { rows: quotaCols } = await client.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='wireline_quota_usage'
      ORDER BY ordinal_position
    `);
    console.log(`  ${quotaCols.map((r) => `${r.column_name}(${r.data_type})`).join(", ")}`);
  } catch (e) {
    console.log(`  ERROR: ${e.message}`);
  }

  // 12. Subscriptions - voice tracking
  console.log("\n=== 12. wireline_subscriptions voice/billing columns ===");
  const { rows: subCols } = await client.query(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name='wireline_subscriptions'
      AND column_name IN ('voice_minutes_used','plan','status','monthly_limit_usd','stripe_customer_id','cancel_at_period_end')
    ORDER BY ordinal_position
  `);
  subCols.forEach((r) => console.log(`  ${r.column_name}: ${r.data_type}`));

  // 13. Check call_logs for ttft tracking
  console.log("\n=== 13. wireline_call_logs TTFT ===");
  const { rows: callCols } = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='wireline_call_logs'
      AND column_name LIKE '%ttft%'
    ORDER BY ordinal_position
  `);
  console.log(`  TTFT columns: ${callCols.map((r) => r.column_name).join(", ") || "NONE"}`);

  // 14. Indexes on call_logs
  console.log("\n=== 14. wireline_call_logs indexes ===");
  const { rows: callIdx } = await client.query(`SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='wireline_call_logs'`);
  console.log(`  Count: ${callIdx.length}`);
  console.log("  " + callIdx.map((i) => i.indexname).join(", "));

  // 15. Complete column dump for agents (to count mutable vs timestamp cols)
  console.log("\n=== 15. wireline_agents detailed ===");
  agentCols.slice(0, 20).forEach((c) => {
    const nullable = c.is_nullable === "YES" ? "NULL" : "NOT NULL";
    console.log(`  ${c.column_name.padEnd(30)} ${c.data_type.padEnd(30)} ${nullable}`);
  });
  console.log(`  ... and ${agentCols.length - 20} more columns`);

  // Summary
  console.log("\n========================================");
  console.log("========== DB VERIFICATION SUMMARY ==========");
  console.log("========================================");

  const critical = issues.filter((i) => i.severity === "CRITICAL");
  const high = issues.filter((i) => i.severity === "HIGH");
  const medium = issues.filter((i) => i.severity === "MEDIUM");
  const low = issues.filter((i) => i.severity === "LOW");

  console.log(`\nCONFIRMED: CRITICAL=${critical.length} | HIGH=${high.length} | MEDIUM=${medium.length} | LOW=${low.length}`);

  if (critical.length) { console.log("\n--- CRITICAL ---"); critical.forEach((i) => console.log(`  ${i.table}: ${i.detail}`)); }
  if (high.length) { console.log("\n--- HIGH ---"); high.forEach((i) => console.log(`  ${i.table}: ${i.detail}`)); }
  if (medium.length) { console.log("\n--- MEDIUM ---"); medium.forEach((i) => console.log(`  ${i.table}: ${i.detail}`)); }
  if (low.length) { console.log("\n--- LOW ---"); low.forEach((i) => console.log(`  ${i.table}: ${i.detail}`)); }

  await client.end();
  console.log("\nDone.");
}

main().catch((e) => { console.error("FATAL:", e.message); console.error(e.stack); process.exit(1); });