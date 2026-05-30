-- Defense-in-depth: make tenant-isolation RLS policies safe when the
-- `app.current_user_id` GUC is an empty string rather than NULL.
--
-- Background: the policies from 0023 cast the GUC directly with
--   current_setting('app.current_user_id', true)::uuid
-- A connection that never set the GUC returns NULL (safe → 0 rows). But once a
-- custom GUC has been SET and then reset (e.g. a transaction-mode pooler running
-- DISCARD ALL between statements), current_setting returns an EMPTY STRING, and
-- ''::uuid raises `invalid input syntax for type uuid: ""`. That error surfaced
-- as HTTP 500 on /api/agents and /api/dashboard/stats.
--
-- The primary fix lives in the app (scopeClientToTenant now pins the role + GUC
-- inside a single transaction so the context survives transaction poolers). This
-- migration is belt-and-suspenders: wrapping the GUC in NULLIF(..., '') makes an
-- empty value behave like NULL → the policy matches no rows (fail-closed) instead
-- of throwing. Re-creating the policies is idempotent and preserves tenant
-- isolation exactly; only the empty-string edge case changes (crash → 0 rows).

DO $$
DECLARE
  tbl text;
  -- All tenant-scoped tables keyed by user_id (wireline_users keys on id and is
  -- handled separately below).
  user_id_tables text[] := ARRAY[
    'wireline_settings',
    'wireline_user_preferences',
    'wireline_spend_budgets',
    'wireline_spend_alerts',
    'wireline_deletion_queue',
    'wireline_agents',
    'wireline_directives',
    'wireline_knowledge',
    'wireline_personality',
    'wireline_agent_lessons',
    'wireline_cloned_voices',
    'wireline_pronunciation_dictionaries',
    'wireline_agent_conversation_messages',
    'wireline_director_conversation_messages',
    'wireline_appointments',
    'wireline_call_logs',
    'wireline_email_accounts',
    'wireline_calendar_accounts',
    'wireline_calendar_events',
    'wireline_email_threads',
    'wireline_email_messages',
    'wireline_sms_threads',
    'wireline_sms_messages',
    'wireline_agent_teams',
    'wireline_call_queues',
    'wireline_cadences',
    'wireline_cadence_runs',
    'wireline_supervisor_subscriptions',
    'wireline_fleet_tasks',
    'wireline_phone_numbers',
    'wireline_outbound_campaigns',
    'wireline_outbound_leads',
    'wireline_signal_presence',
    'wireline_intake_keys',
    'wireline_audit_log',
    'wireline_webhooks',
    'wireline_webhook_deliveries',
    'wireline_dnc_list',
    'wireline_consent_log',
    'wireline_onboarding_progress',
    'wireline_subscriptions',
    'wireline_team_members',
    'wireline_quota_limits',
    'wireline_quota_usage',
    'wireline_crm_connections',
    'wireline_jobs',
    'wireline_lead_dossiers',
    'wireline_goals'
  ];
BEGIN
  -- wireline_users keys on its own id column.
  IF to_regclass('public.wireline_users') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE "wireline_users" ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "tenant_isolation" ON "wireline_users"';
    EXECUTE $q$
      CREATE POLICY "tenant_isolation" ON "wireline_users"
        FOR ALL
        USING (id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
        WITH CHECK (id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
    $q$;
  END IF;

  FOREACH tbl IN ARRAY user_id_tables LOOP
    -- Skip tables that don't exist in this database (schema drift safety).
    IF to_regclass('public.' || quote_ident(tbl)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation" ON %I', tbl);
    EXECUTE format(
      'CREATE POLICY "tenant_isolation" ON %I FOR ALL '
      'USING (user_id = NULLIF(current_setting(''app.current_user_id'', true), '''')::uuid) '
      'WITH CHECK (user_id = NULLIF(current_setting(''app.current_user_id'', true), '''')::uuid)',
      tbl
    );
  END LOOP;
END $$;
