import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "drizzle/migrations/0163_guard_account_environment_promotion.sql",
  "utf8",
);

describe("account environment production-promotion boundary", () => {
  it("keeps the preflight privileged, count-only, and non-destructive", () => {
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = public, pg_temp");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("TO service_role");
    expect(migration).toContain("blocker_count");
    expect(migration).toContain("'blockers', report.blockers");

    const preflight = migration.slice(
      migration.indexOf(
        "CREATE OR REPLACE FUNCTION public.wireline_account_environment_promotion_preflight",
      ),
      migration.indexOf(
        "COMMENT ON FUNCTION public.wireline_account_environment_promotion_preflight",
      ),
    );
    expect(preflight).not.toMatch(/\b(?:DELETE|UPDATE|INSERT|TRUNCATE)\b/);
    expect(preflight).not.toContain("stripe_customer_id',");
    expect(preflight).not.toContain("phone_number',");
    expect(preflight).not.toContain("customer_email',");
  });

  it("rejects every required promotion hazard with actionable categories", () => {
    for (const code of [
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
      expect(migration).toContain(`'${code}'`);
    }

    expect(migration).toContain("entitlement_source = 'demo'");
    expect(migration).toContain("grant_reason = 'admin_demo_seed'");
    expect(migration).toContain("subscriptions.entitlement_source <> 'stripe'");
    expect(migration).toContain("settings.extra_agents, 0) > 0");
    expect(migration).toContain("settings.live_video_addon_enabled");
    expect(migration).toContain("wireline_credit_ledger");
    expect(migration).toContain("demo = true");
    expect(migration).toContain("LIKE 'seed-call-%'");
    expect(migration).toContain("LIKE 'seed-email-%'");
    expect(migration).toContain("LIKE 'seed-gmail-%'");
    expect(migration).toContain("LIKE 'seed-sms-%'");
    expect(migration).toContain("1?[2-9][0-9]{2}55501[0-9]{2}");
    expect(migration).toContain("1555010[0-9]{4}");
    expect(migration).toContain("(^|\\.)example(\\.(com|net|org))?$");
    expect(migration).toContain("btrim(coalesce(email, ''))");
    expect(migration).toContain("btrim(coalesce(customer_email, ''))");
    expect(migration).toContain("'\\.+$'");
    expect(migration).toContain("wireline_lead_dossiers");
    expect(migration).toContain("wireline_consent_log");
    expect(migration).toContain("wireline_orphan_carrier_resources");
    expect(migration).toContain("wireline_account_operation_leases");
    expect(migration).toContain("wireline_deletion_queue");
    expect(migration).toContain("Production promotion requires a SERIALIZABLE transaction");
  });

  it("runs under the deletion/provider lock and records successful proof", () => {
    const lockAt = migration.indexOf(
      "pg_advisory_xact_lock(hashtext('account-deletion:' || v_user_id::text))",
    );
    const settingsLockAt = migration.indexOf("FOR UPDATE OF settings", lockAt);
    const preflightAt = migration.indexOf(
      "wireline_account_environment_promotion_preflight(v_user_id)",
      settingsLockAt,
    );
    const updateAt = migration.indexOf("UPDATE public.wireline_settings", preflightAt);
    const auditAt = migration.indexOf("'promotion_preflight', v_promotion_preflight", updateAt);

    expect(lockAt).toBeGreaterThan(-1);
    expect(settingsLockAt).toBeGreaterThan(lockAt);
    expect(preflightAt).toBeGreaterThan(settingsLockAt);
    expect(updateAt).toBeGreaterThan(preflightAt);
    expect(auditAt).toBeGreaterThan(updateAt);
    expect(migration).toContain("coalesce((v_promotion_preflight ->> 'ready')::boolean, false)");
  });

  it("never relabels historical demo/test evidence as production activity", () => {
    expect(migration).toContain(
      "IF NOT (v_environment = 'production' AND v_previous_environment <> 'production') THEN",
    );
    expect(migration).toContain("'historical_product_events_preserved'");
    expect(migration).toContain("wireline_audit_log.event_type = 'product.event'");
  });
});
