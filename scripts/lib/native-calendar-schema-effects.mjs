import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../../drizzle/migrations/0174_native_booking_calendar.sql", import.meta.url),
  "utf8",
);
const normalized = (value) =>
  String(value ?? "")
    .replace(/\r\n?/gu, "\n")
    .trim();
export const NATIVE_CALENDAR_FUNCTION_BODY = normalized(
  migration.match(/AS \$\$([\s\S]*?)\$\$;/u)?.[1],
);
if (!NATIVE_CALENDAR_FUNCTION_BODY)
  throw new Error("Native Calendar migration function body is missing.");

function isTenantEquality(expression) {
  let predicate = String(expression ?? "").trim();
  if (predicate.startsWith("(") && predicate.endsWith(")"))
    predicate = predicate.slice(1, -1).trim();
  // Supabase may wrap this stable tenant lookup in an initplan. Accept only
  // that scalar SELECT or the direct function call, never extra OR/FROM terms.
  return /^user_id\s*=\s*(?:(?:public\.)?wireline_current_user_id\(\)|\(\s*SELECT\s+(?:public\.)?wireline_current_user_id\(\)(?:\s+AS\s+wireline_current_user_id)?\s*\))$/u.test(
    predicate,
  );
}

export function evaluateNativeCalendarSchemaEffects(state) {
  const failures = [];
  const fail = (reason) => failures.push(`native_calendar:${reason}`);
  for (const name of ["wireline_settings", "wireline_appointments", "wireline_calendar_events"]) {
    const table = state.tables.find((row) => row.name === name);
    if (
      !table ||
      !table.rls_enabled ||
      !table.can_select ||
      !table.can_insert ||
      !table.can_update ||
      !table.can_delete
    )
      fail(`table_access:${name}`);
    const policy = state.policies.find(
      (row) => row.tablename === name && row.policyname === "tenant_isolation",
    );
    if (
      !policy ||
      policy.cmd !== "ALL" ||
      !isTenantEquality(policy.qual) ||
      !isTenantEquality(policy.with_check ?? policy.qual)
    )
      fail(`tenant_policy:${name}`);
  }
  for (const [table, column, type, nullable] of [
    ["wireline_settings", "native_calendar", "jsonb", true],
    ...["start_at", "end_at"].map((column) => [
      "wireline_appointments",
      column,
      "timestamptz",
      true,
    ]),
    ...["time_zone", "booking_source", "booking_request_key", "booking_fingerprint"].map(
      (column) => ["wireline_appointments", column, "text", true],
    ),
    ["wireline_appointments", "buffer_minutes", "int4", false],
  ]) {
    const actual = state.columns.find(
      (row) => row.table_name === table && row.column_name === column,
    );
    if (!actual || actual.udt_name !== type || (actual.is_nullable === "YES") !== nullable)
      fail(`column:${table}.${column}`);
    if (column === "buffer_minutes" && !/^0(?:::integer)?$/u.test(String(actual?.column_default)))
      fail("buffer_default");
  }
  const retry = state.indexes.find((row) => row.name === "uq_appointments_booking_request");
  if (
    !retry?.valid ||
    !retry.unique ||
    retry.table_name !== "wireline_appointments" ||
    !/USING btree \(user_id, booking_request_key\)/u.test(String(retry.definition)) ||
    !/WHERE \(booking_request_key IS NOT NULL\)/u.test(String(retry.definition))
  )
    fail("retry_index");
  const constraint = state.constraints.find(
    (row) => row.name === "appointments_native_interval_valid",
  );
  if (!constraint?.validated || constraint.table_name !== "wireline_appointments")
    fail("interval_constraint");
  const definition = String(constraint?.definition ?? "");
  for (const pattern of [
    /buffer_minutes\s*>=\s*0/u,
    /buffer_minutes\s*<=\s*120/u,
    /end_at\s*>\s*start_at/u,
    /booking_source IS DISTINCT FROM 'native'/u,
    /booking_fingerprint IS NOT NULL/u,
    /booking_request_key IS NOT NULL/u,
    /time_zone IS NOT NULL/u,
    /\^\[0-9a-f\]\{64\}\$/u,
  ]) {
    if (!pattern.test(definition)) fail("interval_constraint_definition");
  }
  const trigger = state.triggers.find((row) => row.name === "guard_native_calendar_appointment");
  if (
    !trigger ||
    trigger.enabled !== "O" ||
    Number(trigger.type) !== 23 ||
    trigger.function_name !== "guard_native_calendar_appointment" ||
    trigger.table_name !== "wireline_appointments"
  )
    fail("booking_trigger");
  const routine = state.functions.find((row) => row.name === "guard_native_calendar_appointment");
  if (
    !routine ||
    routine.security_definer !== false ||
    routine.result !== "trigger" ||
    routine.arguments !== "" ||
    !Array.isArray(routine.config) ||
    !routine.config.includes("search_path=pg_catalog, public") ||
    routine.owner_only_execute !== true
  )
    fail("function_security");
  if (normalized(routine?.body) !== NATIVE_CALENDAR_FUNCTION_BODY) fail("function_body_drift");
  return [...new Set(failures)];
}

export async function verifyNativeCalendarSchemaEffects(database) {
  const tables = ["wireline_settings", "wireline_appointments", "wireline_calendar_events"];
  const [tableResult, policyResult, columns, indexes, constraints, triggers, functions] =
    await Promise.all([
      database.query(
        `SELECT c.relname AS name,c.relrowsecurity AS rls_enabled,
      has_table_privilege('wireline_server',c.oid,'SELECT') AS can_select,has_table_privilege('wireline_server',c.oid,'INSERT') AS can_insert,
      has_table_privilege('wireline_server',c.oid,'UPDATE') AS can_update,has_table_privilege('wireline_server',c.oid,'DELETE') AS can_delete
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[])`,
        [tables],
      ),
      database.query(
        "SELECT tablename,policyname,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename=ANY($1::text[])",
        [tables],
      ),
      database.query(
        "SELECT table_name,column_name,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1::text[])",
        [tables],
      ),
      database.query(`SELECT i.relname AS name,t.relname AS table_name,x.indisvalid AS valid,x.indisunique AS unique,pg_get_indexdef(i.oid) AS definition
      FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_class t ON t.oid=x.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname='public' AND i.relname='uq_appointments_booking_request'`),
      database.query(`SELECT c.conname AS name,t.relname AS table_name,c.convalidated AS validated,pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname='public' AND c.conname='appointments_native_interval_valid'`),
      database.query(`SELECT g.tgname AS name,t.relname AS table_name,g.tgenabled AS enabled,g.tgtype AS type,p.proname AS function_name
      FROM pg_trigger g JOIN pg_class t ON t.oid=g.tgrelid JOIN pg_namespace n ON n.oid=t.relnamespace JOIN pg_proc p ON p.oid=g.tgfoid
      WHERE n.nspname='public' AND NOT g.tgisinternal AND g.tgname='guard_native_calendar_appointment'`),
      database.query(`SELECT p.proname AS name,p.prosecdef AS security_definer,p.proconfig AS config,p.prosrc AS body,
      pg_get_function_result(p.oid) AS result,pg_get_function_identity_arguments(p.oid) AS arguments,
      NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.privilege_type='EXECUTE' AND a.grantee<>p.proowner) AS owner_only_execute
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='guard_native_calendar_appointment'`),
    ]);
  return evaluateNativeCalendarSchemaEffects({
    tables: tableResult.rows,
    policies: policyResult.rows,
    columns: columns.rows,
    indexes: indexes.rows,
    constraints: constraints.rows,
    triggers: triggers.rows,
    functions: functions.rows,
  });
}
