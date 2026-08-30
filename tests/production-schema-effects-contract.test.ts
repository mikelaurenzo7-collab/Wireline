import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const buildSource = readFileSync("scripts/vercel-build.mjs", "utf8");
const verifierSource = readFileSync("scripts/check-production-schema-effects.mjs", "utf8");
const wrapperSource = readFileSync("scripts/run-production-schema-effects.mjs", "utf8");
const schemaSource = readFileSync("src/db/schema-base.ts", "utf8");
const mailboxPersistence = readFileSync("src/lib/mailbox-inbox-persist.ts", "utf8");
const migrationSource = readFileSync(
  "drizzle/migrations/0142_resend_delivery_feedback.sql",
  "utf8",
);
const accountOperationLeaseMigration = readFileSync(
  "drizzle/migrations/0161_account_operation_leases.sql",
  "utf8",
);
const stripeClaimFencingMigration = readFileSync(
  "drizzle/migrations/0164_stripe_event_claim_fencing.sql",
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
      "subscription_orphans",
      "training_backup_orphans",
    ]) {
      expect(verifierSource).toContain(orphanCheck);
    }
    expect(verifierSource).not.toContain("wireline_jobs t LEFT JOIN public.wireline_users");
  });

  it("keeps provider-backed inbox history owned by the mailbox lifecycle", () => {
    const emailThreadSchema = schemaSource.match(
      /export const emailThreads[\s\S]*?export const emailMessages/,
    )?.[0];

    expect(emailThreadSchema).toBeTruthy();
    expect(emailThreadSchema).toContain('accountId: uuid("account_id").references');
    expect(emailThreadSchema).toContain('onDelete: "cascade"');
    expect(mailboxPersistence).toContain("accountId: message.accountId");
    expect(mailboxPersistence).toContain("${schema.emailThreads.accountId} = excluded.account_id");
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

  it("certifies migration 0168 OpenAI Realtime effects on the live schema", () => {
    expect(verifierSource).toContain("voice_llm_provider");
    expect(verifierSource).toContain("voice_llm_model");
    expect(verifierSource).toContain("runtime_cohesion:wrong_voice_llm_provider_default");
    expect(verifierSource).toContain("runtime_cohesion:wrong_voice_llm_model_default");
    expect(verifierSource).toContain("'gpt-realtime-2.1'");
    expect(verifierSource).not.toContain("AS invalid_runtime_pairs");
    expect(verifierSource).not.toContain("runtime_cohesion:invalid_");
  });

  it("certifies the nullable, server-only terminal audit-receipt boundary", () => {
    expect(verifierSource).toContain("wireline_audit_log");
    expect(verifierSource).toContain("server_audit_insert");
    expect(verifierSource).toContain("relrowsecurity");
    expect(verifierSource).toContain("indisunique");
    expect(verifierSource).toContain("indisvalid");
    expect(verifierSource).toContain("pg_get_expr");
    expect(verifierSource).toContain("convalidated");
    expect(verifierSource).toContain("confdeltype");
    expect(verifierSource).toContain("constraint_row.conkey");
    expect(verifierSource).toContain("constraint_row.confkey");
    expect(
      verifierSource.match(/to_jsonb\(ARRAY\(\s*SELECT child_column\.attname/gu),
    ).toHaveLength(2);
    expect(
      verifierSource.match(/to_jsonb\(ARRAY\(\s*SELECT parent_column\.attname/gu),
    ).toHaveLength(2);
    expect(verifierSource).toContain("audit_receipt:missing_user_id_column");
    expect(verifierSource).toContain("audit_receipt:user_id_not_nullable");
    expect(verifierSource).toContain("audit_receipt:missing_server_insert_policy");
    expect(verifierSource).toContain("audit_receipt:rls_disabled");
    expect(verifierSource).toContain("audit_receipt:missing_deletion_receipt_unique_index");
    expect(verifierSource).toContain("audit_receipt:missing_user_fk");
    expect(verifierSource).toContain("audit_receipt:wrong_user_fk_definition");
    expect(verifierSource).toContain("carrier_orphan:resolved_pii_retained");
  });

  it("certifies subscription ownership cannot survive or follow account erasure", () => {
    expect(verifierSource).toContain("wireline_subscriptions_user_id_wireline_users_id_fk");
    expect(verifierSource).toContain("subscription_orphans");
    expect(verifierSource).toContain("subscription_erasure:missing_user_fk");
    expect(verifierSource).toContain("subscription_erasure:wrong_user_fk_definition");
    expect(verifierSource).toContain("competing_user_fks");
  });

  it("certifies the complete account-operation lease boundary before runtime use", () => {
    expect(accountOperationLeaseMigration).toContain("wireline_account_operation_leases");
    for (const invariant of [
      "exact_user_fk_count",
      "user_fk_count",
      "lease_columns",
      "wireline_account_operation_leases_kind_check",
      "idx_account_operation_leases_active_user",
      "relrowsecurity",
      "tenant_isolation",
      "public_dml_revoked",
      "server_select",
      "server_insert",
      "server_update",
      "server_delete",
      "anon_dml",
      "authenticated_dml",
      "service_dml",
      "account_operation_leases:missing_table",
      "account_operation_leases:wrong_column",
      "account_operation_leases:wrong_user_fk",
      "account_operation_leases:wrong_kind_check",
      "account_operation_leases:wrong_active_index",
      "account_operation_leases:wrong_tenant_policy",
      "account_operation_leases:wrong_table_acl",
    ]) {
      expect(verifierSource).toContain(invariant);
    }
  });

  it("certifies Stripe claim-token fencing, 15-minute reclaim semantics, and ACL", () => {
    expect(stripeClaimFencingMigration).toContain("INTERVAL '15 minutes'");
    for (const invariant of [
      "claim_token_type",
      "claim_token_nullable",
      "wireline_reclaim_abandoned_stripe_event_claim_before_insert",
      "trigger_function_matches",
      "pg_get_function_result",
      "public_execute_revoked",
      "anon_execute",
      "authenticated_execute",
      "stripe_claim_fencing:missing_claim_token",
      "stripe_claim_fencing:wrong_reclaim_trigger",
      "stripe_claim_fencing:missing_reclaim_function",
      "stripe_claim_fencing:wrong_reclaim_function_boundary",
      "stripe_claim_fencing:wrong_reclaim_lease_semantics",
      "stripe_claim_fencing:wrong_reclaim_function_acl",
    ]) {
      expect(verifierSource).toContain(invariant);
    }
    expect(verifierSource).toContain("hasStripeReclaimLeaseSemantics");
    expect(verifierSource).toContain("00:15:00");
    expect(verifierSource).toContain("00:05:00");
  });

  it("certifies the live account-environment promotion body and ACL", () => {
    expect(verifierSource).toContain("wireline_account_environment_promotion_preflight");
    expect(verifierSource).toContain("wireline_set_account_environment");
    expect(verifierSource).toContain("account_environment:missing_function");
    expect(verifierSource).toContain("account_environment:wrong_function_acl");
    expect(verifierSource).toContain("account_environment:preflight_is_mutating");
    expect(verifierSource).toContain("procedure_row.provolatile AS volatility");
    expect(verifierSource).toContain('promotionPreflight.volatility !== "s"');
    expect(verifierSource).toContain("procedure_row.prosrc AS function_body");
    expect(verifierSource).toContain("expectedPromotionPreflightBody");
    expect(verifierSource).toContain("0163_guard_account_environment_promotion.sql");
    expect(verifierSource).toContain("account_environment:preflight_body_drift");
    expect(verifierSource).toContain("account_environment:mutation_missing_${checkName}");
    expect(verifierSource).toContain('"promotion_preflight"');
    expect(verifierSource).toContain('"account_lock"');
    expect(verifierSource).toContain('"audit_proof"');
    expect(verifierSource).toContain("DEMO_ENTITLEMENT");
    expect(verifierSource).toContain("RESERVED_DEMO_CONTACTS");
    expect(verifierSource).toContain("PENDING_RISKY_STATE");
    expect(verifierSource).toContain("general_nanp_555_01xx");
    expect(verifierSource).toContain("example_domain_families");
    expect(verifierSource).toContain("lead_dossier_contacts");
    expect(verifierSource).toContain("consent_ledger_contacts");
  });

  it("certifies retained-provider de-identification as a structural security boundary", () => {
    expect(verifierSource).toContain("pg_get_constraintdef");
    expect(verifierSource).toContain("carrier_orphan:non_pending_status_retained");
    expect(verifierSource).toContain("carrier_orphan:missing_pending_only_constraint");
    expect(verifierSource).toContain("xai_binding:wrong_owner_identity_constraint");
    expect(verifierSource).toContain("xai_binding:missing_tenant_policy");
    expect(verifierSource).toContain("xai_binding:wrong_tenant_policy_definition");

    expect(verifierSource).toContain("pg_get_function_identity_arguments");
    expect(verifierSource).toContain("pg_get_functiondef");
    expect(verifierSource).toContain("prosecdef");
    expect(verifierSource).toContain("proconfig");
    expect(verifierSource).toContain("rolsuper OR owner_role.rolbypassrls");
    expect(verifierSource).toContain("has_function_privilege");
    expect(verifierSource).toContain("aclexplode");
    expect(verifierSource).toContain("public_execute_revoked");

    for (const boundary of [
      "wireline_retire_xai_phone_binding",
      "wireline_scrub_xai_phone_bindings_for_purge",
      "function_not_security_definer",
      "function_search_path_not_pinned",
      "function_owner_not_trusted",
      "wrong_function_acl",
      '"phone_lock"',
      '"account_lock"',
      '"purging_gate"',
      '"ordered_phone_locks"',
      '"sentinel_user"',
      '"sentinel_agent"',
    ]) {
      expect(verifierSource).toContain(boundary);
    }
  });

  it("runs the read-only schema assertion on every real production build against runtime-selected DB truth", () => {
    const migrate = 'run("npm", ["run", "db:migrate"]);';
    const verify = 'run("node", ["scripts/run-production-schema-effects.mjs"]);';
    const migrateAt = buildSource.indexOf(migrate);
    const verifyAt = buildSource.indexOf(verify);

    expect(migrateAt).toBeGreaterThan(-1);
    expect(verifyAt).toBeGreaterThan(migrateAt);
    expect(buildSource).toContain("const shouldVerifyProductionSchema = isCanonicalProduction;");
    expect(buildSource.slice(migrateAt, verifyAt)).toContain("if (shouldVerifyProductionSchema)");
    expect(buildSource.slice(migrateAt, verifyAt)).toContain("Skipping database migrations");
    expect(wrapperSource).toContain("resolveProductionSchemaDatabase");
    expect(wrapperSource).toContain("DATABASE_POOL_URL");
    expect(wrapperSource).toContain("POSTGRES_URL");
    expect(wrapperSource).toContain("delete childEnv.DATABASE_URL");
    expect(wrapperSource).toContain('"scripts/check-production-schema-effects.mjs"');
  });
});
