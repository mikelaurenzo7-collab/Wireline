import pg from "pg";

const { Pool } = pg;

// Match the deployed runtime's connection precedence. Migrations may use the
// direct POSTGRES_URL, but the release gate must certify the database the app
// will actually open after deployment.
const connectionString = String(
  process.env.DATABASE_POOL_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL || "",
).trim();

if (!connectionString) {
  console.error(
    "Production schema verification requires DATABASE_POOL_URL, POSTGRES_URL, or DATABASE_URL.",
  );
  process.exit(1);
}

const expected = [
  {
    table: "wireline_email_delivery_suppressions",
    primaryKey: ["email"],
    columns: {
      email: { type: "text", nullable: false },
      provider: { type: "text", nullable: false, defaultRequired: true },
      reason: { type: "text", nullable: false },
      first_seen_at: { type: "timestamptz", nullable: false, defaultRequired: true },
      updated_at: { type: "timestamptz", nullable: false, defaultRequired: true },
    },
    index: {
      name: "idx_email_delivery_suppressions_updated",
      fragments: [
        "ON public.wireline_email_delivery_suppressions",
        "USING btree (updated_at DESC)",
      ],
    },
  },
  {
    table: "wireline_resend_webhook_events",
    primaryKey: ["webhook_id"],
    columns: {
      webhook_id: { type: "text", nullable: false },
      event_type: { type: "text", nullable: false },
      email_id: { type: "text", nullable: true },
      occurred_at: { type: "timestamptz", nullable: false },
      recipient_count: { type: "int4", nullable: false, defaultRequired: true },
      suppression_count: { type: "int4", nullable: false, defaultRequired: true },
      detail_code: { type: "text", nullable: true },
      processed_at: { type: "timestamptz", nullable: false, defaultRequired: true },
    },
    index: {
      name: "idx_resend_webhook_events_type_occurred",
      fragments: [
        "ON public.wireline_resend_webhook_events",
        "USING btree (event_type, occurred_at DESC)",
      ],
    },
  },
];

const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10_000 });

function normalizeRoles(value) {
  if (Array.isArray(value)) return [...value].map(String).sort();
  return String(value || "")
    .replace(/^\{/, "")
    .replace(/\}$/, "")
    .split(",")
    .map((role) => role.trim().replace(/^"|"$/g, ""))
    .filter(Boolean)
    .sort();
}

function normalizePolicyExpression(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[()\s]/g, "");
}

function sameStringSet(actual, expectedValues) {
  if (actual.length !== expectedValues.length) return false;
  const expectedSorted = [...expectedValues].sort();
  return actual.every((value, index) => value === expectedSorted[index]);
}

try {
  const tables = expected.map(({ table }) => table);
  const indexes = expected.map(({ index }) => index.name);

  const [
    tableResult,
    columnResult,
    primaryKeyResult,
    indexResult,
    policyResult,
    privilegeResult,
  ] = await Promise.all([
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
      `SELECT table_name, column_name, udt_name, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ANY($1::text[])`,
      [tables],
    ),
    pool.query(
      `SELECT tc.table_name, kcu.column_name, kcu.ordinal_position
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = 'public'
          AND tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_name = ANY($1::text[])
        ORDER BY tc.table_name, kcu.ordinal_position`,
      [tables],
    ),
    pool.query(
      `SELECT t.relname AS table_name,
              i.relname AS index_name,
              pg_get_indexdef(i.oid) AS index_def,
              ix.indisvalid AS index_valid
         FROM pg_index ix
         JOIN pg_class i ON i.oid = ix.indexrelid
         JOIN pg_class t ON t.oid = ix.indrelid
         JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public'
          AND i.relname = ANY($1::text[])`,
      [indexes],
    ),
    pool.query(
      `SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
         FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = ANY($1::text[])
          AND policyname IN ('deny_direct_api_access', 'wireline_server_access')`,
      [tables],
    ),
    pool.query(
      `SELECT table_name,
              has_table_privilege('wireline_server', format('public.%I', table_name), 'SELECT') AS can_select,
              has_table_privilege('wireline_server', format('public.%I', table_name), 'INSERT') AS can_insert,
              has_table_privilege('wireline_server', format('public.%I', table_name), 'UPDATE') AS can_update,
              has_table_privilege('wireline_server', format('public.%I', table_name), 'DELETE') AS can_delete
         FROM unnest($1::text[]) AS table_name`,
      [tables],
    ),
  ]);

  const tableState = new Map(tableResult.rows.map((row) => [row.table_name, row.rls_enabled]));
  const columnState = new Map();
  for (const row of columnResult.rows) {
    columnState.set(`${row.table_name}:${row.column_name}`, row);
  }

  const primaryKeyState = new Map();
  for (const row of primaryKeyResult.rows) {
    const columns = primaryKeyState.get(row.table_name) ?? [];
    columns.push(row.column_name);
    primaryKeyState.set(row.table_name, columns);
  }

  const indexState = new Map(indexResult.rows.map((row) => [row.index_name, row]));
  const policyState = new Map(
    policyResult.rows.map((row) => [`${row.tablename}:${row.policyname}`, row]),
  );
  const privilegeState = new Map(privilegeResult.rows.map((row) => [row.table_name, row]));

  const failures = [];
  for (const item of expected) {
    if (!tableState.has(item.table)) {
      failures.push(`${item.table}:missing_table`);
      continue;
    }
    if (tableState.get(item.table) !== true) failures.push(`${item.table}:rls_disabled`);

    for (const [columnName, columnExpectation] of Object.entries(item.columns)) {
      const column = columnState.get(`${item.table}:${columnName}`);
      if (!column) {
        failures.push(`${item.table}:missing_column:${columnName}`);
        continue;
      }
      if (column.udt_name !== columnExpectation.type) {
        failures.push(`${item.table}:wrong_column_type:${columnName}:${column.udt_name}`);
      }
      const nullable = column.is_nullable === "YES";
      if (nullable !== columnExpectation.nullable) {
        failures.push(`${item.table}:wrong_nullability:${columnName}`);
      }
      if (columnExpectation.defaultRequired && !column.column_default) {
        failures.push(`${item.table}:missing_default:${columnName}`);
      }
    }

    const primaryKey = primaryKeyState.get(item.table) ?? [];
    if (!sameStringSet(primaryKey, item.primaryKey)) {
      failures.push(`${item.table}:wrong_primary_key:${primaryKey.join("+") || "missing"}`);
    }

    const index = indexState.get(item.index.name);
    if (!index) {
      failures.push(`${item.table}:missing_index:${item.index.name}`);
    } else {
      if (index.table_name !== item.table) {
        failures.push(`${item.table}:index_on_wrong_table:${item.index.name}:${index.table_name}`);
      }
      if (index.index_valid !== true) {
        failures.push(`${item.table}:invalid_index:${item.index.name}`);
      }
      for (const fragment of item.index.fragments) {
        if (!String(index.index_def || "").includes(fragment)) {
          failures.push(`${item.table}:wrong_index_definition:${item.index.name}`);
          break;
        }
      }
    }

    const denyPolicy = policyState.get(`${item.table}:deny_direct_api_access`);
    if (!denyPolicy) {
      failures.push(`${item.table}:missing_deny_policy`);
    } else if (
      String(denyPolicy.permissive).toUpperCase() !== "PERMISSIVE" ||
      String(denyPolicy.cmd).toUpperCase() !== "ALL" ||
      !sameStringSet(normalizeRoles(denyPolicy.roles), ["anon", "authenticated"]) ||
      normalizePolicyExpression(denyPolicy.qual) !== "false" ||
      normalizePolicyExpression(denyPolicy.with_check) !== "false"
    ) {
      failures.push(`${item.table}:wrong_deny_policy_definition`);
    }

    const serverPolicy = policyState.get(`${item.table}:wireline_server_access`);
    if (!serverPolicy) {
      failures.push(`${item.table}:missing_server_policy`);
    } else if (
      String(serverPolicy.permissive).toUpperCase() !== "PERMISSIVE" ||
      String(serverPolicy.cmd).toUpperCase() !== "ALL" ||
      !sameStringSet(normalizeRoles(serverPolicy.roles), ["wireline_server"]) ||
      normalizePolicyExpression(serverPolicy.qual) !== "true" ||
      normalizePolicyExpression(serverPolicy.with_check) !== "true"
    ) {
      failures.push(`${item.table}:wrong_server_policy_definition`);
    }

    const privileges = privilegeState.get(item.table);
    if (
      !privileges ||
      privileges.can_select !== true ||
      privileges.can_insert !== true ||
      privileges.can_update !== true ||
      privileges.can_delete !== true
    ) {
      failures.push(`${item.table}:missing_server_grants`);
    }
  }

  if (failures.length > 0) {
    console.error("Production schema effects are incomplete:", failures.join(", "));
    process.exitCode = 1;
  } else {
    console.log(
      "Production schema effects verified on the runtime-selected database: Resend feedback tables, columns, primary keys, RLS, index definitions, policy definitions, and server CRUD grants are ready.",
    );
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