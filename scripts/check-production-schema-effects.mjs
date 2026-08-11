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

const expectedAuthForeignKeys = new Map([
  ["wireline_password_reset_tokens_user_id_fkey", "wireline_password_reset_tokens"],
  ["wireline_email_verification_tokens_user_id_fkey", "wireline_email_verification_tokens"],
  ["wireline_mcp_oauth_codes_user_id_fkey", "wireline_mcp_oauth_codes"],
  ["wireline_mcp_access_tokens_user_id_fkey", "wireline_mcp_access_tokens"],
  ["wireline_mcp_refresh_tokens_user_id_fkey", "wireline_mcp_refresh_tokens"],
  ["wireline_oauth_pending_codes_user_id_fkey", "wireline_oauth_pending_codes"],
]);

const expectedAuthIndexes = new Map([
  ["idx_mcp_oauth_codes_user_id", ["wireline_mcp_oauth_codes", "(user_id)"]],
  ["idx_mcp_access_tokens_user_id", ["wireline_mcp_access_tokens", "(user_id)"]],
  ["idx_mcp_refresh_tokens_user_id", ["wireline_mcp_refresh_tokens", "(user_id)"]],
  ["idx_oauth_pending_codes_user_id", ["wireline_oauth_pending_codes", "(user_id)"]],
  ["idx_mcp_oauth_codes_expires_at", ["wireline_mcp_oauth_codes", "(expires_at)"]],
]);

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

  const [agentIntegrityResult, agentGuardResult, authFkResult, authIndexResult, orphanResult] =
    await Promise.all([
      pool.query(`
        SELECT
          count(*) FILTER (WHERE a.account_id IS NULL) AS null_accounts,
          count(*) FILTER (
            WHERE a.account_id IS NOT NULL
              AND (wa.id IS NULL OR wa.user_id IS DISTINCT FROM a.user_id)
          ) AS bad_owner_bindings
        FROM public.wireline_agents a
        LEFT JOIN public.wireline_accounts wa ON wa.id = a.account_id
      `),
      pool.query(`
        SELECT
          t.tgenabled,
          pg_get_triggerdef(t.oid) AS trigger_def,
          p.prosecdef AS security_definer,
          p.proconfig
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_proc p ON p.oid = t.tgfoid
        WHERE n.nspname = 'public'
          AND c.relname = 'wireline_agents'
          AND t.tgname = 'wireline_agents_account_binding_guard'
          AND NOT t.tgisinternal
      `),
      pool.query(
        `SELECT tc.constraint_name,
                tc.table_name,
                kcu.column_name,
                ccu.table_name AS foreign_table,
                ccu.column_name AS foreign_column,
                rc.delete_rule
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu
             ON tc.constraint_name = kcu.constraint_name
            AND tc.constraint_schema = kcu.constraint_schema
           JOIN information_schema.constraint_column_usage ccu
             ON ccu.constraint_name = tc.constraint_name
            AND ccu.constraint_schema = tc.constraint_schema
           JOIN information_schema.referential_constraints rc
             ON rc.constraint_name = tc.constraint_name
            AND rc.constraint_schema = tc.constraint_schema
          WHERE tc.constraint_schema = 'public'
            AND tc.constraint_type = 'FOREIGN KEY'
            AND tc.constraint_name = ANY($1::text[])`,
        [[...expectedAuthForeignKeys.keys()]],
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
        [[...expectedAuthIndexes.keys()]],
      ),
      pool.query(`
        SELECT
          (SELECT count(*) FROM public.wireline_password_reset_tokens t LEFT JOIN public.wireline_users u ON u.id = t.user_id WHERE t.user_id IS NOT NULL AND u.id IS NULL) AS reset_orphans,
          (SELECT count(*) FROM public.wireline_email_verification_tokens t LEFT JOIN public.wireline_users u ON u.id = t.user_id WHERE t.user_id IS NOT NULL AND u.id IS NULL) AS verification_orphans,
          (SELECT count(*) FROM public.wireline_mcp_oauth_codes t LEFT JOIN public.wireline_users u ON u.id = t.user_id WHERE t.user_id IS NOT NULL AND u.id IS NULL) AS mcp_code_orphans,
          (SELECT count(*) FROM public.wireline_mcp_access_tokens t LEFT JOIN public.wireline_users u ON u.id = t.user_id WHERE t.user_id IS NOT NULL AND u.id IS NULL) AS mcp_access_orphans,
          (SELECT count(*) FROM public.wireline_mcp_refresh_tokens t LEFT JOIN public.wireline_users u ON u.id = t.user_id WHERE t.user_id IS NOT NULL AND u.id IS NULL) AS mcp_refresh_orphans,
          (SELECT count(*) FROM public.wireline_oauth_pending_codes t LEFT JOIN public.wireline_users u ON u.id = t.user_id WHERE t.user_id IS NOT NULL AND u.id IS NULL) AS pending_code_orphans,
          (SELECT count(*) FROM public.wireline_director_conversation_messages t LEFT JOIN public.wireline_users u ON u.id = t.user_id WHERE t.user_id IS NOT NULL AND u.id IS NULL) AS director_message_orphans,
          (SELECT count(*) FROM public.wireline_dnc_list t LEFT JOIN public.wireline_users u ON u.id = t.user_id WHERE t.user_id IS NOT NULL AND u.id IS NULL) AS dnc_orphans,
          (SELECT count(*) FROM public.wireline_audit_log t LEFT JOIN public.wireline_users u ON u.id = t.user_id WHERE t.user_id IS NOT NULL AND u.id IS NULL) AS audit_orphans,
          (SELECT count(*) FROM public.wireline_training_backup_20260609 t LEFT JOIN public.wireline_users u ON u.id = t.user_id WHERE t.user_id IS NOT NULL AND u.id IS NULL) AS training_backup_orphans
      `),
    ]);

  const agentIntegrity = agentIntegrityResult.rows[0] ?? {};
  if (Number(agentIntegrity.null_accounts || 0) !== 0) failures.push("agents:null_account_binding");
  if (Number(agentIntegrity.bad_owner_bindings || 0) !== 0) {
    failures.push("agents:cross_user_account_binding");
  }

  const agentGuard = agentGuardResult.rows[0];
  if (!agentGuard) {
    failures.push("agents:missing_account_binding_trigger");
  } else {
    const triggerDef = String(agentGuard.trigger_def || "");
    const proconfig = Array.isArray(agentGuard.proconfig) ? agentGuard.proconfig.map(String) : [];
    if (agentGuard.tgenabled !== "O") failures.push("agents:account_binding_trigger_disabled");
    if (!triggerDef.includes("BEFORE INSERT OR UPDATE OF user_id, account_id")) {
      failures.push("agents:wrong_account_binding_trigger_definition");
    }
    if (!triggerDef.includes("EXECUTE FUNCTION wireline_enforce_agent_account_binding()")) {
      failures.push("agents:wrong_account_binding_trigger_function");
    }
    if (agentGuard.security_definer !== true) failures.push("agents:binding_function_not_security_definer");
    if (!proconfig.some((value) => /search_path=pg_catalog,\s*public/i.test(value))) {
      failures.push("agents:binding_function_search_path_not_pinned");
    }
  }

  const authFkState = new Map(authFkResult.rows.map((row) => [row.constraint_name, row]));
  for (const [constraintName, expectedTable] of expectedAuthForeignKeys) {
    const fk = authFkState.get(constraintName);
    if (!fk) {
      failures.push(`auth:missing_fk:${constraintName}`);
      continue;
    }
    if (
      fk.table_name !== expectedTable ||
      fk.column_name !== "user_id" ||
      fk.foreign_table !== "wireline_users" ||
      fk.foreign_column !== "id" ||
      String(fk.delete_rule).toUpperCase() !== "CASCADE"
    ) {
      failures.push(`auth:wrong_fk_definition:${constraintName}`);
    }
  }

  const authIndexState = new Map(authIndexResult.rows.map((row) => [row.index_name, row]));
  for (const [indexName, [expectedTable, columnFragment]] of expectedAuthIndexes) {
    const index = authIndexState.get(indexName);
    if (!index) {
      failures.push(`auth:missing_index:${indexName}`);
      continue;
    }
    if (index.table_name !== expectedTable || index.index_valid !== true) {
      failures.push(`auth:invalid_index:${indexName}`);
      continue;
    }
    const definition = String(index.index_def || "");
    if (!definition.includes(`ON public.${expectedTable}`) || !definition.includes(columnFragment)) {
      failures.push(`auth:wrong_index_definition:${indexName}`);
    }
  }

  const orphanState = orphanResult.rows[0] ?? {};
  for (const [key, value] of Object.entries(orphanState)) {
    if (Number(value || 0) !== 0) failures.push(`deletion:${key}:${value}`);
  }

  if (failures.length > 0) {
    console.error("Production schema effects are incomplete:", failures.join(", "));
    process.exitCode = 1;
  } else {
    console.log(
      "Production schema effects verified on the runtime-selected database: Resend feedback semantics, agent/account ownership, auth-token cascades/indexes, and deleted-user reconciliation are ready.",
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