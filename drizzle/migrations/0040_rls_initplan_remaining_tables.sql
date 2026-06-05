-- 0040: RLS InitPlan optimization for remaining tenant_isolation policies.
-- Wraps GUC reads in scalar subselects so Postgres evaluates once per query
-- (Supabase advisor lint 0003). Skips tables already patched in 0036.

DO $$
DECLARE
  tbl text;
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
  guc_expr text := '(SELECT NULLIF(current_setting(''app.current_user_id'', true), '''')::uuid)';
BEGIN
  IF to_regclass('public.wireline_users') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "tenant_isolation" ON wireline_users';
    EXECUTE format(
      'CREATE POLICY "tenant_isolation" ON wireline_users FOR ALL '
      || 'USING (id = %s) WITH CHECK (id = %s)',
      guc_expr, guc_expr
    );
  END IF;

  FOREACH tbl IN ARRAY user_id_tables LOOP
    IF to_regclass('public.' || quote_ident(tbl)) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation" ON %I', tbl);
    EXECUTE format(
      'CREATE POLICY "tenant_isolation" ON %I FOR ALL '
      || 'USING (user_id = %s) WITH CHECK (user_id = %s)',
      tbl, guc_expr, guc_expr
    );
  END LOOP;
END $$;
