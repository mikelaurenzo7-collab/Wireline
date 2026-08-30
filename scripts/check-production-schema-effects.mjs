import pg from "pg";
import { getPostgresConnectionConfig } from "../src/lib/postgres-tls.mjs";

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

const pool = new Pool({
  ...getPostgresConnectionConfig(connectionString),
  max: 1,
  connectionTimeoutMillis: 10_000,
});

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

function normalizeTextDefault(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/::(?:text|character varying)$/u, "")
    .replace(/^\((.*)\)$/u, "$1");
}

function hasPinnedEmptySearchPath(value) {
  const settings = Array.isArray(value) ? value.map(String) : [];
  return settings.some((setting) => /^search_path=(?:""|)$/u.test(setting.trim()));
}

function hasPinnedPublicTemporarySearchPath(value) {
  const settings = Array.isArray(value) ? value.map(String) : [];
  return settings.some((setting) => /^search_path=public,\s*pg_temp$/iu.test(setting.trim()));
}

function hasAccountOperationLeaseTenantBoundary(value) {
  const normalized = String(value ?? "")
    .toLowerCase()
    .replace(/[()\s"]/gu, "");
  return normalized.includes("user_id=") && normalized.includes("wireline_current_user_id");
}

function isAccountOperationLeaseKindConstraint(value) {
  const normalized = String(value ?? "")
    .toLowerCase()
    .replace(/::text/gu, "")
    .replace(/[()\s'"]/gu, "");
  return (
    normalized === "checkkind=anyarray[billing,provider]" ||
    normalized === "checkkindinbilling,provider"
  );
}

function hasStripeReclaimLeaseSemantics(value) {
  const definition = String(value ?? "");
  const hasFifteenMinuteLease =
    /INTERVAL\s*'15\s+minutes'/iu.test(definition) ||
    /'00:15:00'\s*::\s*interval/iu.test(definition);
  return (
    /IF\s+NEW\.status\s*<>\s*'processing'/iu.test(definition) &&
    /DELETE\s+FROM\s+public\.wireline_stripe_events/iu.test(definition) &&
    /event_id\s*=\s*NEW\.event_id/iu.test(definition) &&
    /status\s*=\s*'processing'/iu.test(definition) &&
    /processed_at\s+IS\s+NULL/iu.test(definition) &&
    /processed_at\s*<\s*clock_timestamp\s*\(\s*\)\s*-/iu.test(definition) &&
    hasFifteenMinuteLease &&
    !/'00:05:00'\s*::\s*interval/iu.test(definition) &&
    !/INTERVAL\s*'5\s+minutes'/iu.test(definition)
  );
}

function hasXAITenantPolicyBoundary(value) {
  const normalized = String(value ?? "")
    .toLowerCase()
    .replace(/[()\s"]/gu, "");
  return (
    normalized.includes("wireline_current_user_id") &&
    normalized.includes("user_idisdistinctfromid")
  );
}

function hasRetiredXAIOwnerConstraint(value) {
  const definition = String(value ?? "").toLowerCase();
  return (
    /user_id\s*=\s*id/u.test(definition) &&
    /agent_id\s*=\s*\(?\s*'retired:'/u.test(definition) &&
    /status[\s\S]*'retired'/u.test(definition) &&
    /status[\s\S]*'error'/u.test(definition) &&
    /user_id\s*<>\s*id/u.test(definition) &&
    /agent_id\s*<>\s*\(?\s*'retired:'/u.test(definition) &&
    /status\s*<>\s*'retired'/u.test(definition)
  );
}

function isPendingOnlyCarrierConstraint(value) {
  const normalized = String(value ?? "")
    .toLowerCase()
    .replace(/[()\s"]/gu, "");
  return normalized === "checkstatus='pending'" || normalized === "checkstatus='pending'::text";
}

try {
  const tables = expected.map(({ table }) => table);
  const indexes = expected.map(({ index }) => index.name);

  const [tableResult, columnResult, primaryKeyResult, indexResult, policyResult, privilegeResult] =
    await Promise.all([
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

  const [
    agentIntegrityResult,
    agentGuardResult,
    authFkResult,
    authIndexResult,
    orphanResult,
    retentionFunctionResult,
    runtimeCohesionResult,
    auditSystemReceiptResult,
    auditCascadeResult,
    subscriptionCascadeResult,
    resolvedCarrierOrphanResult,
    xaiBindingIdentityResult,
    xaiPolicyResult,
    xaiFunctionSecurityResult,
    accountEnvironmentPromotionResult,
    accountOperationLeaseResult,
    stripeClaimFencingResult,
  ] = await Promise.all([
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
          (SELECT count(*) FROM public.wireline_subscriptions t LEFT JOIN public.wireline_users u ON u.id = t.user_id WHERE t.user_id IS NOT NULL AND u.id IS NULL) AS subscription_orphans,
          (SELECT count(*) FROM public.wireline_training_backup_20260609 t LEFT JOIN public.wireline_users u ON u.id = t.user_id WHERE t.user_id IS NOT NULL AND u.id IS NULL) AS training_backup_orphans
      `),
    pool.query(`
        SELECT pg_get_functiondef(p.oid) AS function_def,
               p.proconfig
          FROM pg_proc p
         WHERE p.oid = to_regprocedure('public.wireline_purge_old_data(uuid,integer)')
      `),
    pool.query(`
        SELECT
          (SELECT column_default
             FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'wireline_settings'
              AND column_name = 'voice_llm_provider') AS provider_default,
          (SELECT column_default
             FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'wireline_settings'
              AND column_name = 'voice_llm_model') AS model_default,
          (SELECT count(*)
             FROM public.wireline_settings
            WHERE lower(coalesce(voice_llm_provider, '')) <> 'openai'
               OR lower(coalesce(voice_llm_model, '')) <> 'gpt-realtime-2.1') AS invalid_runtime_pairs
      `),
    pool.query(`
        SELECT
          c.is_nullable,
          audit_table.relrowsecurity AS rls_enabled,
          (
            SELECT index_state.indisunique
              FROM pg_index index_state
              JOIN pg_class index_class ON index_class.oid = index_state.indexrelid
              JOIN pg_namespace index_namespace ON index_namespace.oid = index_class.relnamespace
             WHERE index_namespace.nspname = 'public'
               AND index_class.relname = 'uq_audit_account_deletion_receipt'
               AND index_state.indrelid = audit_table.oid
          ) AS deletion_receipt_index_unique,
          (
            SELECT index_state.indisvalid
              FROM pg_index index_state
              JOIN pg_class index_class ON index_class.oid = index_state.indexrelid
              JOIN pg_namespace index_namespace ON index_namespace.oid = index_class.relnamespace
             WHERE index_namespace.nspname = 'public'
               AND index_class.relname = 'uq_audit_account_deletion_receipt'
               AND index_state.indrelid = audit_table.oid
          ) AS deletion_receipt_index_valid,
          (
            SELECT pg_get_indexdef(index_class.oid)
              FROM pg_index index_state
              JOIN pg_class index_class ON index_class.oid = index_state.indexrelid
              JOIN pg_namespace index_namespace ON index_namespace.oid = index_class.relnamespace
             WHERE index_namespace.nspname = 'public'
               AND index_class.relname = 'uq_audit_account_deletion_receipt'
               AND index_state.indrelid = audit_table.oid
          ) AS deletion_receipt_index_definition,
          (
            SELECT pg_get_expr(index_state.indpred, index_state.indrelid)
              FROM pg_index index_state
              JOIN pg_class index_class ON index_class.oid = index_state.indexrelid
              JOIN pg_namespace index_namespace ON index_namespace.oid = index_class.relnamespace
             WHERE index_namespace.nspname = 'public'
               AND index_class.relname = 'uq_audit_account_deletion_receipt'
               AND index_state.indrelid = audit_table.oid
          ) AS deletion_receipt_index_predicate,
          EXISTS (
            SELECT 1
              FROM pg_policies p
             WHERE p.schemaname = 'public'
               AND p.tablename = 'wireline_audit_log'
               AND p.policyname = 'server_audit_insert'
               AND upper(p.cmd) = 'INSERT'
               AND p.roles = ARRAY['wireline_server']::name[]
               AND lower(regexp_replace(coalesce(p.with_check, ''), '[()\\s]', '', 'g')) = 'true'
          ) AS server_insert_policy
          FROM information_schema.columns c
          JOIN pg_namespace audit_namespace ON audit_namespace.nspname = c.table_schema
          JOIN pg_class audit_table
            ON audit_table.relnamespace = audit_namespace.oid
           AND audit_table.relname = c.table_name
         WHERE c.table_schema = 'public'
           AND c.table_name = 'wireline_audit_log'
           AND c.column_name = 'user_id'
      `),
    pool.query(`
        SELECT
          constraint_row.convalidated,
          constraint_row.confdeltype,
          child_table.relname AS child_table,
          parent_table.relname AS parent_table,
          to_jsonb(ARRAY(
            SELECT child_column.attname
              FROM unnest(constraint_row.conkey) WITH ORDINALITY
                   AS child_key(attnum, position)
              JOIN pg_attribute child_column
                ON child_column.attrelid = constraint_row.conrelid
               AND child_column.attnum = child_key.attnum
             ORDER BY child_key.position
          )) AS child_columns,
          to_jsonb(ARRAY(
            SELECT parent_column.attname
              FROM unnest(constraint_row.confkey) WITH ORDINALITY
                   AS parent_key(attnum, position)
              JOIN pg_attribute parent_column
                ON parent_column.attrelid = constraint_row.confrelid
               AND parent_column.attnum = parent_key.attnum
             ORDER BY parent_key.position
          )) AS parent_columns
          FROM pg_constraint constraint_row
          JOIN pg_namespace constraint_namespace
            ON constraint_namespace.oid = constraint_row.connamespace
          JOIN pg_class child_table ON child_table.oid = constraint_row.conrelid
          JOIN pg_class parent_table ON parent_table.oid = constraint_row.confrelid
         WHERE constraint_namespace.nspname = 'public'
           AND constraint_row.conname =
               'wireline_audit_log_user_id_wireline_users_id_fk'
           AND constraint_row.contype = 'f'
           AND constraint_row.conrelid = 'public.wireline_audit_log'::regclass
      `),
    pool.query(`
        SELECT
          constraint_row.convalidated,
          constraint_row.confdeltype,
          child_table.relname AS child_table,
          parent_table.relname AS parent_table,
          to_jsonb(ARRAY(
            SELECT child_column.attname
              FROM unnest(constraint_row.conkey) WITH ORDINALITY
                   AS child_key(attnum, position)
              JOIN pg_attribute child_column
                ON child_column.attrelid = constraint_row.conrelid
               AND child_column.attnum = child_key.attnum
             ORDER BY child_key.position
          )) AS child_columns,
          to_jsonb(ARRAY(
            SELECT parent_column.attname
              FROM unnest(constraint_row.confkey) WITH ORDINALITY
                   AS parent_key(attnum, position)
              JOIN pg_attribute parent_column
                ON parent_column.attrelid = constraint_row.confrelid
               AND parent_column.attnum = parent_key.attnum
             ORDER BY parent_key.position
          )) AS parent_columns,
          (
            SELECT count(*)
              FROM pg_constraint AS competing_constraint
             WHERE competing_constraint.conrelid =
                   'public.wireline_subscriptions'::regclass
               AND competing_constraint.contype = 'f'
               AND competing_constraint.confrelid = 'public.wireline_users'::regclass
               AND competing_constraint.conname <>
                   'wireline_subscriptions_user_id_wireline_users_id_fk'
               AND competing_constraint.conkey = ARRAY[(
                 SELECT attnum
                   FROM pg_attribute
                  WHERE attrelid = 'public.wireline_subscriptions'::regclass
                    AND attname = 'user_id'
               )]::smallint[]
          ) AS competing_user_fks
          FROM pg_constraint constraint_row
          JOIN pg_namespace constraint_namespace
            ON constraint_namespace.oid = constraint_row.connamespace
          JOIN pg_class child_table ON child_table.oid = constraint_row.conrelid
          JOIN pg_class parent_table ON parent_table.oid = constraint_row.confrelid
         WHERE constraint_namespace.nspname = 'public'
           AND constraint_row.conname =
               'wireline_subscriptions_user_id_wireline_users_id_fk'
           AND constraint_row.contype = 'f'
           AND constraint_row.conrelid = 'public.wireline_subscriptions'::regclass
      `),
    pool.query(`
        SELECT
          (SELECT count(*)
             FROM public.wireline_orphan_carrier_resources
            WHERE status = 'resolved') AS retained_resolved_rows,
          (SELECT count(*)
             FROM public.wireline_orphan_carrier_resources
            WHERE status IS DISTINCT FROM 'pending') AS non_pending_rows,
          ARRAY(
            SELECT pg_get_constraintdef(constraint_row.oid, true)
              FROM pg_constraint constraint_row
             WHERE constraint_row.conrelid =
                   'public.wireline_orphan_carrier_resources'::regclass
               AND constraint_row.contype = 'c'
               AND constraint_row.convalidated
             ORDER BY constraint_row.conname
          ) AS validated_check_definitions
      `),
    pool.query(`
        SELECT
          count(*) FILTER (
            WHERE binding.status = 'retired'
              AND NOT (
                binding.user_id = binding.id
                AND binding.agent_id = 'retired:' || binding.id::text
              )
          ) AS attributable_retired_rows,
          count(*) FILTER (
            WHERE NOT (
                binding.user_id = binding.id
                AND binding.agent_id = 'retired:' || binding.id::text
              )
              AND (live_user.id IS NULL OR live_agent.id IS NULL)
          ) AS attributable_dangling_owner_rows,
          EXISTS (
            SELECT 1
              FROM pg_constraint constraint_row
             WHERE constraint_row.conrelid =
                   'public.wireline_xai_phone_bindings'::regclass
               AND constraint_row.conname = 'wireline_xai_binding_owner_identity'
               AND constraint_row.convalidated
          ) AS owner_identity_constraint,
          (
            SELECT pg_get_constraintdef(constraint_row.oid, true)
              FROM pg_constraint constraint_row
             WHERE constraint_row.conrelid =
                   'public.wireline_xai_phone_bindings'::regclass
               AND constraint_row.conname = 'wireline_xai_binding_owner_identity'
          ) AS owner_identity_constraint_definition
        FROM public.wireline_xai_phone_bindings AS binding
        LEFT JOIN public.wireline_users AS live_user ON live_user.id = binding.user_id
        LEFT JOIN public.wireline_agents AS live_agent
          ON live_agent.id = binding.agent_id
         AND live_agent.user_id = binding.user_id
      `),
    pool.query(`
        SELECT permissive, roles, cmd, qual, with_check
          FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename = 'wireline_xai_phone_bindings'
           AND policyname = 'tenant_isolation'
      `),
    pool.query(`
        SELECT
          procedure_row.proname AS function_name,
          pg_get_function_identity_arguments(procedure_row.oid) AS identity_arguments,
          pg_get_functiondef(procedure_row.oid) AS function_definition,
          procedure_row.prosecdef AS security_definer,
          procedure_row.proconfig,
          (owner_role.rolsuper OR owner_role.rolbypassrls) AS trusted_owner,
          has_function_privilege(
            'wireline_server', procedure_row.oid, 'EXECUTE'
          ) AS server_execute,
          has_function_privilege(
            'anon', procedure_row.oid, 'EXECUTE'
          ) AS anon_execute,
          has_function_privilege(
            'authenticated', procedure_row.oid, 'EXECUTE'
          ) AS authenticated_execute,
          has_function_privilege(
            'service_role', procedure_row.oid, 'EXECUTE'
          ) AS service_execute,
          NOT EXISTS (
            SELECT 1
              FROM aclexplode(
                COALESCE(
                  procedure_row.proacl,
                  acldefault('f', procedure_row.proowner)
                )
              ) AS function_acl
             WHERE function_acl.grantee = 0
               AND function_acl.privilege_type = 'EXECUTE'
          ) AS public_execute_revoked
          FROM pg_proc procedure_row
          JOIN pg_namespace procedure_namespace
            ON procedure_namespace.oid = procedure_row.pronamespace
          JOIN pg_roles owner_role ON owner_role.oid = procedure_row.proowner
         WHERE procedure_namespace.nspname = 'public'
           AND procedure_row.oid = ANY(
             ARRAY[
               to_regprocedure(
                 'public.wireline_retire_xai_phone_binding(uuid,text,uuid,text)'
               ),
               to_regprocedure(
                 'public.wireline_scrub_xai_phone_bindings_for_purge(uuid)'
               )
             ]::oid[]
           )
      `),
    pool.query(`
        SELECT
          procedure_row.proname AS function_name,
          pg_get_function_identity_arguments(procedure_row.oid) AS identity_arguments,
          pg_get_function_result(procedure_row.oid) AS function_result,
          pg_get_functiondef(procedure_row.oid) AS function_definition,
          procedure_row.prosecdef AS security_definer,
          procedure_row.provolatile AS volatility,
          procedure_row.proconfig,
          (owner_role.rolsuper OR owner_role.rolbypassrls) AS trusted_owner,
          has_function_privilege(
            'anon', procedure_row.oid, 'EXECUTE'
          ) AS anon_execute,
          has_function_privilege(
            'authenticated', procedure_row.oid, 'EXECUTE'
          ) AS authenticated_execute,
          has_function_privilege(
            'service_role', procedure_row.oid, 'EXECUTE'
          ) AS service_execute,
          NOT EXISTS (
            SELECT 1
              FROM aclexplode(
                COALESCE(
                  procedure_row.proacl,
                  acldefault('f', procedure_row.proowner)
                )
              ) AS function_acl
             WHERE function_acl.grantee = 0
               AND function_acl.privilege_type = 'EXECUTE'
          ) AS public_execute_revoked
          FROM pg_proc procedure_row
          JOIN pg_namespace procedure_namespace
            ON procedure_namespace.oid = procedure_row.pronamespace
          JOIN pg_roles owner_role ON owner_role.oid = procedure_row.proowner
         WHERE procedure_namespace.nspname = 'public'
           AND procedure_row.oid = ANY(
             ARRAY[
               to_regprocedure(
                 'public.wireline_account_environment_promotion_preflight(uuid)'
               ),
               to_regprocedure(
                 'public.wireline_set_account_environment(text,text,text,text)'
               )
             ]::oid[]
           )
      `),
    pool.query(`
        SELECT
          target.table_oid IS NOT NULL AS table_exists,
          table_row.relrowsecurity AS rls_enabled,
          (
            SELECT jsonb_object_agg(
              column_row.column_name,
              jsonb_build_object(
                'type', column_row.udt_name,
                'nullable', column_row.is_nullable,
                'default', column_row.column_default
              )
            )
              FROM information_schema.columns column_row
             WHERE column_row.table_schema = 'public'
               AND column_row.table_name =
                   'wireline_account_operation_leases'
          ) AS lease_columns,
          (
            SELECT count(*)
              FROM pg_constraint foreign_key
             WHERE foreign_key.conrelid = target.table_oid
               AND foreign_key.contype = 'f'
               AND foreign_key.confrelid =
                   to_regclass('public.wireline_users')
               AND foreign_key.confdeltype = 'c'
               AND foreign_key.convalidated
               AND foreign_key.conkey = ARRAY[(
                 SELECT column_row.attnum
                   FROM pg_attribute column_row
                  WHERE column_row.attrelid = target.table_oid
                    AND column_row.attname = 'user_id'
               )]::smallint[]
               AND foreign_key.confkey = ARRAY[(
                 SELECT column_row.attnum
                   FROM pg_attribute column_row
                  WHERE column_row.attrelid =
                        to_regclass('public.wireline_users')
                    AND column_row.attname = 'id'
               )]::smallint[]
          ) AS exact_user_fk_count,
          (
            SELECT count(*)
              FROM pg_constraint foreign_key
             WHERE foreign_key.conrelid = target.table_oid
               AND foreign_key.contype = 'f'
               AND foreign_key.conkey = ARRAY[(
                 SELECT column_row.attnum
                   FROM pg_attribute column_row
                  WHERE column_row.attrelid = target.table_oid
                    AND column_row.attname = 'user_id'
               )]::smallint[]
          ) AS user_fk_count,
          (
            SELECT pg_get_constraintdef(check_constraint.oid, true)
              FROM pg_constraint check_constraint
             WHERE check_constraint.conrelid = target.table_oid
               AND check_constraint.contype = 'c'
               AND check_constraint.conname =
                   'wireline_account_operation_leases_kind_check'
               AND check_constraint.convalidated
          ) AS kind_check_definition,
          (
            SELECT index_state.indisvalid
              FROM pg_index index_state
              JOIN pg_class index_row ON index_row.oid = index_state.indexrelid
             WHERE index_state.indrelid = target.table_oid
               AND index_row.relname = 'idx_account_operation_leases_active_user'
          ) AS active_index_valid,
          (
            SELECT pg_get_indexdef(index_row.oid)
              FROM pg_index index_state
              JOIN pg_class index_row ON index_row.oid = index_state.indexrelid
             WHERE index_state.indrelid = target.table_oid
               AND index_row.relname = 'idx_account_operation_leases_active_user'
          ) AS active_index_definition,
          policy_row.permissive AS policy_permissive,
          policy_row.roles AS policy_roles,
          policy_row.cmd AS policy_command,
          policy_row.qual AS policy_qual,
          policy_row.with_check AS policy_with_check,
          has_table_privilege(
            'wireline_server', target.table_oid, 'SELECT'
          ) AS server_select,
          has_table_privilege(
            'wireline_server', target.table_oid, 'INSERT'
          ) AS server_insert,
          has_table_privilege(
            'wireline_server', target.table_oid, 'UPDATE'
          ) AS server_update,
          has_table_privilege(
            'wireline_server', target.table_oid, 'DELETE'
          ) AS server_delete,
          (
            has_table_privilege('anon', target.table_oid, 'SELECT') OR
            has_table_privilege('anon', target.table_oid, 'INSERT') OR
            has_table_privilege('anon', target.table_oid, 'UPDATE') OR
            has_table_privilege('anon', target.table_oid, 'DELETE')
          ) AS anon_dml,
          (
            has_table_privilege('authenticated', target.table_oid, 'SELECT') OR
            has_table_privilege('authenticated', target.table_oid, 'INSERT') OR
            has_table_privilege('authenticated', target.table_oid, 'UPDATE') OR
            has_table_privilege('authenticated', target.table_oid, 'DELETE')
          ) AS authenticated_dml,
          (
            has_table_privilege('service_role', target.table_oid, 'SELECT') OR
            has_table_privilege('service_role', target.table_oid, 'INSERT') OR
            has_table_privilege('service_role', target.table_oid, 'UPDATE') OR
            has_table_privilege('service_role', target.table_oid, 'DELETE')
          ) AS service_dml,
          NOT EXISTS (
            SELECT 1
              FROM aclexplode(
                COALESCE(
                  table_row.relacl,
                  acldefault('r', table_row.relowner)
                )
              ) AS table_acl
             WHERE table_acl.grantee = 0
               AND table_acl.privilege_type = ANY(
                 ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]
               )
          ) AS public_dml_revoked
          FROM (
            SELECT to_regclass(
              'public.wireline_account_operation_leases'
            ) AS table_oid
          ) AS target
          LEFT JOIN pg_class table_row ON table_row.oid = target.table_oid
          LEFT JOIN pg_policies policy_row
            ON policy_row.schemaname = 'public'
           AND policy_row.tablename = 'wireline_account_operation_leases'
           AND policy_row.policyname = 'tenant_isolation'
      `),
    pool.query(`
        SELECT
          claim_column.udt_name AS claim_token_type,
          claim_column.is_nullable AS claim_token_nullable,
          trigger_row.tgenabled AS trigger_enabled,
          pg_get_triggerdef(trigger_row.oid) AS trigger_definition,
          trigger_row.tgfoid = target.function_oid AS trigger_function_matches,
          function_row.prosecdef AS security_definer,
          function_row.proconfig,
          function_language.lanname AS function_language,
          pg_get_function_identity_arguments(function_row.oid)
            AS identity_arguments,
          pg_get_function_result(function_row.oid) AS function_result,
          pg_get_functiondef(function_row.oid) AS function_definition,
          has_function_privilege(
            'anon', target.function_oid, 'EXECUTE'
          ) AS anon_execute,
          has_function_privilege(
            'authenticated', target.function_oid, 'EXECUTE'
          ) AS authenticated_execute,
          NOT EXISTS (
            SELECT 1
              FROM aclexplode(
                COALESCE(
                  function_row.proacl,
                  acldefault('f', function_row.proowner)
                )
              ) AS function_acl
             WHERE function_acl.grantee = 0
               AND function_acl.privilege_type = 'EXECUTE'
          ) AS public_execute_revoked
          FROM (
            SELECT
              to_regclass('public.wireline_stripe_events') AS table_oid,
              to_regprocedure(
                'public.wireline_reclaim_abandoned_stripe_event_claim()'
              ) AS function_oid
          ) AS target
          LEFT JOIN information_schema.columns claim_column
            ON claim_column.table_schema = 'public'
           AND claim_column.table_name = 'wireline_stripe_events'
           AND claim_column.column_name = 'claim_token'
          LEFT JOIN pg_trigger trigger_row
            ON trigger_row.tgrelid = target.table_oid
           AND trigger_row.tgname =
               'wireline_reclaim_abandoned_stripe_event_claim_before_insert'
           AND NOT trigger_row.tgisinternal
          LEFT JOIN pg_proc function_row ON function_row.oid = target.function_oid
          LEFT JOIN pg_language function_language
            ON function_language.oid = function_row.prolang
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
    if (agentGuard.security_definer !== true)
      failures.push("agents:binding_function_not_security_definer");
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
    if (
      !definition.includes(`ON public.${expectedTable}`) ||
      !definition.includes(columnFragment)
    ) {
      failures.push(`auth:wrong_index_definition:${indexName}`);
    }
  }

  const orphanState = orphanResult.rows[0] ?? {};
  for (const [key, value] of Object.entries(orphanState)) {
    if (Number(value || 0) !== 0) failures.push(`deletion:${key}:${value}`);
  }

  // A function name is not evidence that its latest CREATE OR REPLACE body
  // landed. Migration 0148 removes live webhook and intake-key configuration
  // from the retention sweep, and 0149 makes unexpected DELETE failures abort
  // so the durable job retries instead of recording a false success.
  // Certify those semantics after every production migration run so an old
  // body cannot pass merely because the routine already exists.
  const retentionFunction = retentionFunctionResult.rows[0];
  if (!retentionFunction) {
    failures.push("retention:missing_purge_function");
  } else {
    const definition = String(retentionFunction.function_def || "");
    const proconfig = Array.isArray(retentionFunction.proconfig)
      ? retentionFunction.proconfig.map(String)
      : [];
    if (!definition.includes("wireline_webhook_deliveries")) {
      failures.push("retention:delivery_log_not_purgeable");
    }
    if (definition.includes("wireline_webhooks")) {
      failures.push("retention:live_webhook_configuration_purgeable");
    }
    if (definition.includes("wireline_intake_keys")) {
      failures.push("retention:live_intake_key_configuration_purgeable");
    }
    if (
      /EXCEPTION\s+WHEN\s+OTHERS/i.test(definition) ||
      /v_rows_deleted\s*:=\s*0/i.test(definition)
    ) {
      failures.push("retention:purge_errors_suppressed");
    }
    if (!proconfig.some((value) => /search_path=public,\s*pg_temp/i.test(value))) {
      failures.push("retention:purge_function_search_path_not_pinned");
    }
  }

  // Migration 0168 makes OpenAI Realtime the only live-call provider/model pair.
  // Certify its live effects after migration replay instead of trusting only
  // the journal, which can lag when a repeat-safe correction landed manually.
  const runtimeCohesion = runtimeCohesionResult.rows[0] ?? {};
  if (normalizeTextDefault(runtimeCohesion.provider_default) !== "'openai'") {
    failures.push("runtime_cohesion:wrong_voice_llm_provider_default");
  }
  if (normalizeTextDefault(runtimeCohesion.model_default) !== "'gpt-realtime-2.1'") {
    failures.push("runtime_cohesion:wrong_voice_llm_model_default");
  }
  if (Number(runtimeCohesion.invalid_runtime_pairs || 0) !== 0) {
    failures.push(
      `runtime_cohesion:invalid_openai_realtime_pairs:${runtimeCohesion.invalid_runtime_pairs}`,
    );
  }

  const auditSystemReceipt = auditSystemReceiptResult.rows[0];
  if (!auditSystemReceipt) {
    failures.push("audit_receipt:missing_user_id_column");
  } else {
    if (auditSystemReceipt.is_nullable !== "YES") {
      failures.push("audit_receipt:user_id_not_nullable");
    }
    if (auditSystemReceipt.server_insert_policy !== true) {
      failures.push("audit_receipt:missing_server_insert_policy");
    }
    if (auditSystemReceipt.rls_enabled !== true) {
      failures.push("audit_receipt:rls_disabled");
    }
    const receiptIndexDefinition = String(
      auditSystemReceipt.deletion_receipt_index_definition || "",
    );
    const receiptIndexPredicate = String(auditSystemReceipt.deletion_receipt_index_predicate || "");
    if (
      auditSystemReceipt.deletion_receipt_index_unique !== true ||
      auditSystemReceipt.deletion_receipt_index_valid !== true ||
      !/ON\s+public\.wireline_audit_log\s+USING\s+btree\s*\(\s*event_type\s*,\s*resource_type\s*,\s*resource_id\s*\)/iu.test(
        receiptIndexDefinition,
      ) ||
      !/event_type\s*=\s*'account\.deletion\.completed'/iu.test(receiptIndexPredicate) ||
      !/resource_type\s*=\s*'account_deletion_receipt'/iu.test(receiptIndexPredicate) ||
      !/resource_id\s+IS\s+NOT\s+NULL/iu.test(receiptIndexPredicate)
    ) {
      failures.push("audit_receipt:missing_deletion_receipt_unique_index");
    }
  }

  const auditCascade = auditCascadeResult.rows[0];
  if (!auditCascade) {
    failures.push("audit_receipt:missing_user_fk");
  } else if (
    auditCascade.child_table !== "wireline_audit_log" ||
    auditCascade.parent_table !== "wireline_users" ||
    !sameStringSet((auditCascade.child_columns || []).map(String).sort(), ["user_id"]) ||
    !sameStringSet((auditCascade.parent_columns || []).map(String).sort(), ["id"]) ||
    auditCascade.confdeltype !== "c" ||
    auditCascade.convalidated !== true
  ) {
    failures.push("audit_receipt:wrong_user_fk_definition");
  }

  const subscriptionCascade = subscriptionCascadeResult.rows[0];
  if (!subscriptionCascade) {
    failures.push("subscription_erasure:missing_user_fk");
  } else if (
    subscriptionCascade.child_table !== "wireline_subscriptions" ||
    subscriptionCascade.parent_table !== "wireline_users" ||
    !sameStringSet((subscriptionCascade.child_columns || []).map(String).sort(), ["user_id"]) ||
    !sameStringSet((subscriptionCascade.parent_columns || []).map(String).sort(), ["id"]) ||
    subscriptionCascade.confdeltype !== "c" ||
    subscriptionCascade.convalidated !== true ||
    Number(subscriptionCascade.competing_user_fks || 0) !== 0
  ) {
    failures.push("subscription_erasure:wrong_user_fk_definition");
  }

  const accountOperationLease = accountOperationLeaseResult.rows[0] ?? {};
  if (accountOperationLease.table_exists !== true) {
    failures.push("account_operation_leases:missing_table");
  } else {
    if (accountOperationLease.rls_enabled !== true) {
      failures.push("account_operation_leases:rls_disabled");
    }
    const leaseColumns = accountOperationLease.lease_columns ?? {};
    const expectedLeaseColumns = {
      id: { type: "uuid", defaultRequired: true },
      user_id: { type: "uuid" },
      kind: { type: "text" },
      operation: { type: "text" },
      expires_at: { type: "timestamptz" },
      created_at: { type: "timestamptz", defaultRequired: true },
    };
    for (const [columnName, expectation] of Object.entries(expectedLeaseColumns)) {
      const column = leaseColumns[columnName];
      if (
        !column ||
        column.type !== expectation.type ||
        column.nullable !== "NO" ||
        (expectation.defaultRequired && !column.default)
      ) {
        failures.push(`account_operation_leases:wrong_column:${columnName}`);
      }
    }
    if (
      Number(accountOperationLease.exact_user_fk_count || 0) !== 1 ||
      Number(accountOperationLease.user_fk_count || 0) !== 1
    ) {
      failures.push("account_operation_leases:wrong_user_fk");
    }
    if (!isAccountOperationLeaseKindConstraint(accountOperationLease.kind_check_definition)) {
      failures.push("account_operation_leases:wrong_kind_check");
    }

    const activeIndexDefinition = String(accountOperationLease.active_index_definition || "");
    if (
      accountOperationLease.active_index_valid !== true ||
      !/ON\s+(?:public\.)?wireline_account_operation_leases\s+USING\s+btree\s*\(\s*user_id\s*,\s*expires_at\s*\)/iu.test(
        activeIndexDefinition,
      )
    ) {
      failures.push("account_operation_leases:wrong_active_index");
    }

    if (
      String(accountOperationLease.policy_permissive).toUpperCase() !== "PERMISSIVE" ||
      String(accountOperationLease.policy_command).toUpperCase() !== "ALL" ||
      !sameStringSet(normalizeRoles(accountOperationLease.policy_roles), ["wireline_server"]) ||
      !hasAccountOperationLeaseTenantBoundary(accountOperationLease.policy_qual) ||
      !hasAccountOperationLeaseTenantBoundary(accountOperationLease.policy_with_check)
    ) {
      failures.push("account_operation_leases:wrong_tenant_policy");
    }

    if (
      accountOperationLease.server_select !== true ||
      accountOperationLease.server_insert !== true ||
      accountOperationLease.server_update !== true ||
      accountOperationLease.server_delete !== true ||
      accountOperationLease.anon_dml !== false ||
      accountOperationLease.authenticated_dml !== false ||
      accountOperationLease.service_dml !== false ||
      accountOperationLease.public_dml_revoked !== true
    ) {
      failures.push("account_operation_leases:wrong_table_acl");
    }
  }

  const stripeClaimFencing = stripeClaimFencingResult.rows[0] ?? {};
  if (
    stripeClaimFencing.claim_token_type !== "uuid" ||
    stripeClaimFencing.claim_token_nullable !== "YES"
  ) {
    failures.push("stripe_claim_fencing:missing_claim_token");
  }

  const stripeTriggerDefinition = String(stripeClaimFencing.trigger_definition || "");
  if (
    stripeClaimFencing.trigger_enabled !== "O" ||
    stripeClaimFencing.trigger_function_matches !== true ||
    !/BEFORE\s+INSERT\s+ON\s+(?:public\.)?wireline_stripe_events\s+FOR\s+EACH\s+ROW\s+EXECUTE\s+FUNCTION\s+(?:public\.)?wireline_reclaim_abandoned_stripe_event_claim\(\)/iu.test(
      stripeTriggerDefinition,
    )
  ) {
    failures.push("stripe_claim_fencing:wrong_reclaim_trigger");
  }

  if (!stripeClaimFencing.function_definition) {
    failures.push("stripe_claim_fencing:missing_reclaim_function");
  } else {
    if (
      stripeClaimFencing.security_definer !== false ||
      String(stripeClaimFencing.function_language).toLowerCase() !== "plpgsql" ||
      String(stripeClaimFencing.identity_arguments || "") !== "" ||
      String(stripeClaimFencing.function_result).toLowerCase() !== "trigger" ||
      !hasPinnedPublicTemporarySearchPath(stripeClaimFencing.proconfig)
    ) {
      failures.push("stripe_claim_fencing:wrong_reclaim_function_boundary");
    }
    if (!hasStripeReclaimLeaseSemantics(stripeClaimFencing.function_definition)) {
      failures.push("stripe_claim_fencing:wrong_reclaim_lease_semantics");
    }
    if (
      stripeClaimFencing.anon_execute !== false ||
      stripeClaimFencing.authenticated_execute !== false ||
      stripeClaimFencing.public_execute_revoked !== true
    ) {
      failures.push("stripe_claim_fencing:wrong_reclaim_function_acl");
    }
  }

  const resolvedCarrierOrphans = resolvedCarrierOrphanResult.rows[0] ?? {};
  if (Number(resolvedCarrierOrphans.retained_resolved_rows || 0) !== 0) {
    failures.push(
      `carrier_orphan:resolved_pii_retained:${resolvedCarrierOrphans.retained_resolved_rows}`,
    );
  }
  if (Number(resolvedCarrierOrphans.non_pending_rows || 0) !== 0) {
    failures.push(
      `carrier_orphan:non_pending_status_retained:${resolvedCarrierOrphans.non_pending_rows}`,
    );
  }
  const carrierCheckDefinitions = Array.isArray(resolvedCarrierOrphans.validated_check_definitions)
    ? resolvedCarrierOrphans.validated_check_definitions
    : [];
  if (!carrierCheckDefinitions.some(isPendingOnlyCarrierConstraint)) {
    failures.push("carrier_orphan:missing_pending_only_constraint");
  }

  const xaiBindingIdentity = xaiBindingIdentityResult.rows[0] ?? {};
  if (Number(xaiBindingIdentity.attributable_retired_rows || 0) !== 0) {
    failures.push(
      `xai_binding:retired_owner_pii_retained:${xaiBindingIdentity.attributable_retired_rows}`,
    );
  }
  if (Number(xaiBindingIdentity.attributable_dangling_owner_rows || 0) !== 0) {
    failures.push(
      `xai_binding:dangling_owner_pii_retained:${xaiBindingIdentity.attributable_dangling_owner_rows}`,
    );
  }
  if (
    xaiBindingIdentity.owner_identity_constraint !== true ||
    !hasRetiredXAIOwnerConstraint(xaiBindingIdentity.owner_identity_constraint_definition)
  ) {
    failures.push("xai_binding:wrong_owner_identity_constraint");
  }

  const xaiPolicy = xaiPolicyResult.rows[0];
  if (!xaiPolicy) {
    failures.push("xai_binding:missing_tenant_policy");
  } else if (
    String(xaiPolicy.permissive).toUpperCase() !== "PERMISSIVE" ||
    String(xaiPolicy.cmd).toUpperCase() !== "ALL" ||
    !sameStringSet(normalizeRoles(xaiPolicy.roles), ["public"]) ||
    !hasXAITenantPolicyBoundary(xaiPolicy.qual) ||
    !hasXAITenantPolicyBoundary(xaiPolicy.with_check)
  ) {
    failures.push("xai_binding:wrong_tenant_policy_definition");
  }

  const xaiFunctions = new Map(
    xaiFunctionSecurityResult.rows.map((row) => [row.function_name, row]),
  );
  const expectedXAIFunctions = [
    {
      name: "wireline_retire_xai_phone_binding",
      arguments: "p_user_id uuid, p_phone_number text, p_claim_token uuid, p_last_error text",
      bodyChecks: [
        ["tenant_binding", /wireline_current_user_id\(\)\s+IS\s+DISTINCT\s+FROM\s+p_user_id/iu],
        ["phone_lock", /pg_advisory_xact_lock\s*\(\s*hashtext\s*\([\s\S]*?xai-phone:/iu],
        ["row_lock", /FOR\s+UPDATE/iu],
        ["lease_binding", /provisioning_token\s+IS\s+DISTINCT\s+FROM\s+p_claim_token/iu],
        ["sentinel_user", /SET\s+user_id\s*=\s*id/iu],
        ["sentinel_agent", /agent_id\s*=\s*['"]retired:/iu],
        ["retired_status", /status\s*=\s*['"]retired['"]/iu],
      ],
    },
    {
      name: "wireline_scrub_xai_phone_bindings_for_purge",
      arguments: "p_user_id uuid",
      bodyChecks: [
        ["account_lock", /pg_advisory_xact_lock\s*\(\s*hashtext\s*\([\s\S]*?account-deletion:/iu],
        ["purging_gate", /queue\.status\s*=\s*['"]purging['"]/iu],
        [
          "ordered_phone_locks",
          /ORDER\s+BY\s+phone_number[\s\S]*?pg_advisory_xact_lock\s*\(\s*hashtext\s*\([\s\S]*?xai-phone:/iu,
        ],
        ["sentinel_user", /SET\s+user_id\s*=\s*binding\.id/iu],
        ["sentinel_agent", /agent_id\s*=\s*['"]retired:/iu],
      ],
    },
  ];

  for (const expectedFunction of expectedXAIFunctions) {
    const liveFunction = xaiFunctions.get(expectedFunction.name);
    if (!liveFunction) {
      failures.push(`xai_binding:missing_function:${expectedFunction.name}`);
      continue;
    }
    if (String(liveFunction.identity_arguments) !== expectedFunction.arguments) {
      failures.push(`xai_binding:wrong_function_signature:${expectedFunction.name}`);
    }
    if (liveFunction.security_definer !== true) {
      failures.push(`xai_binding:function_not_security_definer:${expectedFunction.name}`);
    }
    if (!hasPinnedEmptySearchPath(liveFunction.proconfig)) {
      failures.push(`xai_binding:function_search_path_not_pinned:${expectedFunction.name}`);
    }
    if (liveFunction.trusted_owner !== true) {
      failures.push(`xai_binding:function_owner_not_trusted:${expectedFunction.name}`);
    }
    if (
      liveFunction.server_execute !== true ||
      liveFunction.anon_execute !== false ||
      liveFunction.authenticated_execute !== false ||
      liveFunction.service_execute !== false ||
      liveFunction.public_execute_revoked !== true
    ) {
      failures.push(`xai_binding:wrong_function_acl:${expectedFunction.name}`);
    }
    const functionDefinition = String(liveFunction.function_definition || "");
    for (const [checkName, pattern] of expectedFunction.bodyChecks) {
      if (!pattern.test(functionDefinition)) {
        failures.push(`xai_binding:function_body_missing_${checkName}:${expectedFunction.name}`);
      }
    }
  }

  const accountEnvironmentFunctions = new Map(
    accountEnvironmentPromotionResult.rows.map((row) => [row.function_name, row]),
  );
  const promotionPreflight = accountEnvironmentFunctions.get(
    "wireline_account_environment_promotion_preflight",
  );
  const environmentMutation = accountEnvironmentFunctions.get("wireline_set_account_environment");

  for (const [name, routine] of [
    ["wireline_account_environment_promotion_preflight", promotionPreflight],
    ["wireline_set_account_environment", environmentMutation],
  ]) {
    if (!routine) {
      failures.push(`account_environment:missing_function:${name}`);
      continue;
    }
    if (routine.security_definer !== true) {
      failures.push(`account_environment:function_not_security_definer:${name}`);
    }
    if (!hasPinnedPublicTemporarySearchPath(routine.proconfig)) {
      failures.push(`account_environment:function_search_path_not_pinned:${name}`);
    }
    if (routine.trusted_owner !== true) {
      failures.push(`account_environment:function_owner_not_trusted:${name}`);
    }
    if (
      routine.anon_execute !== false ||
      routine.authenticated_execute !== false ||
      routine.service_execute !== true ||
      routine.public_execute_revoked !== true
    ) {
      failures.push(`account_environment:wrong_function_acl:${name}`);
    }
  }

  if (promotionPreflight) {
    const definition = String(promotionPreflight.function_definition || "");
    if (String(promotionPreflight.identity_arguments) !== "p_user_id uuid") {
      failures.push("account_environment:wrong_preflight_signature");
    }
    if (String(promotionPreflight.function_result).toLowerCase() !== "jsonb") {
      failures.push("account_environment:wrong_preflight_result");
    }
    for (const blockerCode of [
      "ACCOUNT_NOT_FOUND",
      "DEMO_ENTITLEMENT",
      "DEMO_MARKED_ROWS",
      "DEMO_SEED_IDENTIFIERS",
      "RESERVED_DEMO_CONTACTS",
      "BILLING_PROVIDER_BINDING",
      "VOICE_OR_CARRIER_PROVIDER_RESOURCE",
      "EXTERNAL_CONNECTION",
      "LIVE_AUTOMATION_ENABLED",
      "PENDING_RISKY_STATE",
      "ACCOUNT_DELETION_PENDING",
    ]) {
      if (!definition.includes(blockerCode)) {
        failures.push(`account_environment:preflight_missing_blocker:${blockerCode}`);
      }
    }
    for (const [checkName, fragment] of [
      ["general_nanp_555_01xx", "1?[2-9][0-9]{2}55501[0-9]{2}"],
      ["example_domain_families", "example(\\.(com|net|org))?"],
      ["trimmed_example_domains", "btrim(coalesce"],
      ["lead_dossier_contacts", "wireline_lead_dossiers"],
      ["consent_ledger_contacts", "wireline_consent_log"],
    ]) {
      if (!definition.includes(fragment)) {
        failures.push(`account_environment:preflight_missing_${checkName}`);
      }
    }
    if (promotionPreflight.volatility !== "s") {
      failures.push("account_environment:preflight_is_mutating");
    }
  }

  if (environmentMutation) {
    const definition = String(environmentMutation.function_definition || "");
    if (
      String(environmentMutation.identity_arguments) !==
      "p_account_email text, p_environment text, p_reason text, p_actor_email text"
    ) {
      failures.push("account_environment:wrong_mutation_signature");
    }
    for (const [checkName, pattern] of [
      [
        "production_transition_gate",
        /v_environment\s*=\s*['"]production['"][\s\S]*?v_previous_environment\s*<>\s*['"]production['"]/iu,
      ],
      [
        "promotion_preflight",
        /wireline_account_environment_promotion_preflight\s*\(\s*v_user_id\s*\)/iu,
      ],
      [
        "serializable_boundary",
        /current_setting\s*\(\s*['"]transaction_isolation['"]\s*\)\s*<>\s*['"]serializable['"]/iu,
      ],
      ["account_lock", /pg_advisory_xact_lock\s*\(\s*hashtext\s*\([\s\S]*?account-deletion:/iu],
      ["blocked_detail", /DETAIL\s*=\s*v_promotion_preflight::text/iu],
      ["audit_proof", /['"]promotion_preflight['"]\s*,\s*v_promotion_preflight/iu],
      [
        "historical_evidence_preservation",
        /IF\s+NOT\s+\(v_environment\s*=\s*['"]production['"][\s\S]*?v_previous_environment\s*<>\s*['"]production['"]\)\s+THEN[\s\S]*?UPDATE\s+public\.wireline_audit_log/iu,
      ],
    ]) {
      if (!pattern.test(definition)) {
        failures.push(`account_environment:mutation_missing_${checkName}`);
      }
    }
  }

  if (failures.length > 0) {
    console.error("Production schema effects are incomplete:", failures.join(", "));
    process.exitCode = 1;
  } else {
    console.log(
      "Production schema effects verified on the runtime-selected database: Resend feedback semantics, agent/account ownership, auth-token cascades/indexes, deleted-user reconciliation, subscription and audit erasure, account-operation leases, Stripe claim fencing, carrier cleanup, retention configuration safety, runtime-cohesion defaults, de-identified retained xAI bindings, and guarded account-environment promotion are ready.",
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
