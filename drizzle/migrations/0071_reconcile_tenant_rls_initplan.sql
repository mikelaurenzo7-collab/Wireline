-- 0071: Reconcile tenant_isolation policies with the intended InitPlan form.
--
-- Supabase advisor lint 0003 reported that a number of policies had drifted
-- back to bare current_setting('app.current_user_id', true) expressions.
-- A scalar subquery makes the GUC read an InitPlan: Postgres evaluates it once
-- per query rather than once per scanned row, while preserving tenant semantics.
--
-- This migration is deliberately explicit. It touches only tables whose
-- tenant_isolation policy is the simple user_id == current tenant form. It
-- leaves multi-party / special policies (membership, OAuth, Stripe, etc.) alone.

DO $$
DECLARE
  tbl text;
  user_id_tables text[] := ARRAY[
    'wireline_director_artifact_objects',
    'wireline_director_artifacts',
    'wireline_director_profile',
    'wireline_agent_team_members',
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
    'wireline_follow_up_tasks',
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
    'wireline_goals',
    'wireline_design_profiles',
    'wireline_design_integrations',
    'wireline_mobile_devices',
    'wireline_credit_ledger',
    'wireline_accounts',
    'wireline_call_reliability_staging',
    'wireline_webhook_health'
  ];
  guc_expr text := '(SELECT NULLIF(current_setting(''app.current_user_id'', true), '''')::uuid)';
BEGIN
  IF to_regclass('public.wireline_users') IS NOT NULL THEN
    DROP POLICY IF EXISTS tenant_isolation ON wireline_users;
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON wireline_users FOR ALL '
      || 'USING (id = %s) WITH CHECK (id = %s)',
      guc_expr,
      guc_expr
    );
  END IF;

  FOREACH tbl IN ARRAY user_id_tables LOOP
    IF to_regclass('public.' || tbl) IS NULL THEN
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = tbl
        AND column_name = 'user_id'
    ) THEN
      CONTINUE;
    END IF;

    DROP POLICY IF EXISTS tenant_isolation ON public."" || tbl;
  END LOOP;
END $$;
