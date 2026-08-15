import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const buildSource = readFileSync("scripts/vercel-build.mjs", "utf8");
const verifierSource = readFileSync("scripts/check-production-schema-effects.mjs", "utf8");
const wrapperSource = readFileSync("scripts/run-production-schema-effects.mjs", "utf8");
const migrationSource = readFileSync(
  "drizzle/migrations/0142_resend_delivery_feedback.sql",
  "utf8",
);

describe("production schema effects", () => {
  it("pins the full Resend feedback table contract, not just object names", () => {
    for (const table of [
      "wireline_email_delivery_suppressions",
      "wireline_resend_webhook_events",
    ]) {
      expect(migrationSource).toContain(table);
      expect(verifierSource).toContain(table);
    }

    expect(verifierSource).toContain("DATABASE_POOL_URL || process.env.POSTGRES_URL");
    expect(verifierSource).toContain("information_schema.columns");
    expect(verifierSource).toContain("PRIMARY KEY");
    expect(verifierSource).toContain("pg_get_indexdef");
    expect(verifierSource).toContain("indisvalid");
    expect(verifierSource).toContain("permissive, roles, cmd, qual, with_check");
    expect(verifierSource).toContain("wrong_deny_policy_definition");
    expect(verifierSource).toContain("wrong_server_policy_definition");
    expect(verifierSource).toContain("can_select");
    expect(verifierSource).toContain("can_insert");
    expect(verifierSource).toContain("can_update");
    expect(verifierSource).toContain("can_delete");
    expect(verifierSource).toContain("wrong_primary_key");
    expect(verifierSource).toContain("wrong_index_definition");
  });

  it("certifies agent ownership, auth cascades, and deletion reconciliation after migration", () => {
    expect(verifierSource).toContain("agents:null_account_binding");
    expect(verifierSource).toContain("agents:cross_user_account_binding");
    expect(verifierSource).toContain("wireline_agents_account_binding_guard");
    expect(verifierSource).toContain("wireline_enforce_agent_account_binding");
    expect(verifierSource).toContain("security_definer");
    expect(verifierSource).toContain("binding_function_search_path_not_pinned");

    for (const constraint of [
      "wireline_password_reset_tokens_user_id_fkey",
      "wireline_email_verification_tokens_user_id_fkey",
      "wireline_mcp_oauth_codes_user_id_fkey",
      "wireline_mcp_access_tokens_user_id_fkey",
      "wireline_mcp_refresh_tokens_user_id_fkey",
      "wireline_oauth_pending_codes_user_id_fkey",
    ]) {
      expect(verifierSource).toContain(constraint);
    }
    expect(verifierSource).toContain('String(fk.delete_rule).toUpperCase() !== "CASCADE"');

    for (const index of [
      "idx_mcp_oauth_codes_user_id",
      "idx_mcp_access_tokens_user_id",
      "idx_mcp_refresh_tokens_user_id",
      "idx_oauth_pending_codes_user_id",
      "idx_mcp_oauth_codes_expires_at",
    ]) {
      expect(verifierSource).toContain(index);
    }

    for (const orphanCheck of [
      "reset_orphans",
      "verification_orphans",
      "mcp_code_orphans",
      "mcp_access_orphans",
      "mcp_refresh_orphans",
      "pending_code_orphans",
      "director_message_orphans",
      "dnc_orphans",
      "audit_orphans",
      "training_backup_orphans",
    ]) {
      expect(verifierSource).toContain(orphanCheck);
    }
    expect(verifierSource).not.toContain("wireline_jobs t LEFT JOIN public.wireline_users");
  });

  it("certifies the live retention routine body, not merely its function name", () => {
    expect(verifierSource).toContain("pg_get_functiondef");
    expect(verifierSource).toContain("wireline_purge_old_data(uuid,integer)");
    expect(verifierSource).toContain("retention:delivery_log_not_purgeable");
    expect(verifierSource).toContain("retention:live_webhook_configuration_purgeable");
    expect(verifierSource).toContain("retention:live_intake_key_configuration_purgeable");
    expect(verifierSource).toContain("retention:purge_errors_suppressed");
    expect(verifierSource).toContain("retention:purge_function_search_path_not_pinned");
  });

  it("runs the read-only schema assertion on every real production build against runtime-selected DB truth", () => {
    const migrate = 'run("npm", ["run", "db:migrate"]);';
    const verify = 'run("node", ["scripts/run-production-schema-effects.mjs"]);';
    const migrateAt = buildSource.indexOf(migrate);
    const verifyAt = buildSource.indexOf(verify);

    expect(migrateAt).toBeGreaterThan(-1);
    expect(verifyAt).toBeGreaterThan(migrateAt);
    expect(buildSource).toContain(
      'const shouldVerifyProductionSchema = environment === "production" && !isDuplicateV0Project;',
    );
    expect(buildSource.slice(migrateAt, verifyAt)).toContain("if (shouldVerifyProductionSchema)");
    expect(buildSource.slice(migrateAt, verifyAt)).toContain("Skipping database migrations");
    expect(wrapperSource).toContain("resolveProductionSchemaDatabase");
    expect(wrapperSource).toContain("DATABASE_POOL_URL");
    expect(wrapperSource).toContain("POSTGRES_URL");
    expect(wrapperSource).toContain("delete childEnv.DATABASE_URL");
    expect(wrapperSource).toContain('"scripts/check-production-schema-effects.mjs"');
  });
});
