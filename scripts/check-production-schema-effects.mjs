import pg from "pg";

const { Pool } = pg;
const connectionString = String(process.env.POSTGRES_URL || process.env.DATABASE_URL || "").trim();

if (!connectionString) {
  console.error("Production schema verification requires POSTGRES_URL or DATABASE_URL.");
  process.exit(1);
}

const expected = [
  {
    table: "wireline_email_delivery_suppressions",
    index: "idx_email_delivery_suppressions_updated",
  },
  {
    table: "wireline_resend_webhook_events",
    index: "idx_resend_webhook_events_type_occurred",
  },
];

const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10_000 });

try {
  const tables = expected.map(({ table }) => table);
  const indexes = expected.map(({ index }) => index);

  const [tableResult, indexResult, policyResult, privilegeResult] = await Promise.all([
    pool.query(
      `SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
          AND c.relname = ANY($1::text[])`,
      [tables],
    ),
    pool.query(
      `SELECT indexname
         FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = ANY($1::text[])`,
      [indexes],
    ),
    pool.query(
      `SELECT tablename, policyname
         FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = ANY($1::text[])
          AND policyname IN ('deny_direct_api_access', 'wireline_server_access')`,
      [tables],
    ),
    pool.query(
      `SELECT table_name,
              has_table_privilege('wireline_server', format('public.%I', table_name), 'SELECT,INSERT,UPDATE,DELETE') AS server_rw
         FROM unnest($1::text[]) AS table_name`,
      [tables],
    ),
  ]);

  const tableState = new Map(tableResult.rows.map((row) => [row.table_name, row.rls_enabled]));
  const indexState = new Set(indexResult.rows.map((row) => row.indexname));
  const policyState = new Set(
    policyResult.rows.map((row) => `${row.tablename}:${row.policyname}`),
  );
  const privilegeState = new Map(
    privilegeResult.rows.map((row) => [row.table_name, row.server_rw === true]),
  );

  const failures = [];
  for (const item of expected) {
    if (!tableState.has(item.table)) failures.push(`${item.table}:missing_table`);
    else if (tableState.get(item.table) !== true) failures.push(`${item.table}:rls_disabled`);
    if (!indexState.has(item.index)) failures.push(`${item.table}:missing_index:${item.index}`);
    if (!policyState.has(`${item.table}:deny_direct_api_access`)) {
      failures.push(`${item.table}:missing_deny_policy`);
    }
    if (!policyState.has(`${item.table}:wireline_server_access`)) {
      failures.push(`${item.table}:missing_server_policy`);
    }
    if (privilegeState.get(item.table) !== true) failures.push(`${item.table}:missing_server_grants`);
  }

  if (failures.length > 0) {
    console.error("Production schema effects are incomplete:", failures.join(", "));
    process.exitCode = 1;
  } else {
    console.log("Production schema effects verified: Resend feedback tables, RLS, indexes, policies, and server grants are ready.");
  }
} catch (error) {
  console.error(
    "Production schema verification failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
