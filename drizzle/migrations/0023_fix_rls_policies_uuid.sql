-- Fix RLS policies from 0020: the original migration cast user IDs to bigint,
-- but the schema uses UUID for all user_id columns. It also targeted tables
-- that no longer exist and missed tables added since. This migration drops
-- the broken policies and re-creates them with correct UUID casts against
-- the actual current schema.

-- Step 1: Drop all broken policies from 0020 (IF EXISTS — safe if 0020 was
-- never applied or tables were dropped).
DO $$ BEGIN
  -- Tables that 0020 targeted (some may not exist)
  EXECUTE 'DROP POLICY IF EXISTS "tenant_isolation" ON "wireline_users"';
  EXECUTE 'DROP POLICY IF EXISTS "tenant_isolation" ON "wireline_workspaces"';
  EXECUTE 'DROP POLICY IF EXISTS "tenant_isolation" ON "wireline_workspace_memberships"';
  EXECUTE 'DROP POLICY IF EXISTS "tenant_isolation" ON "wireline_agents"';
  EXECUTE 'DROP POLICY IF EXISTS "tenant_isolation" ON "wireline_contacts"';
  EXECUTE 'DROP POLICY IF EXISTS "tenant_isolation" ON "wireline_calls"';
  EXECUTE 'DROP POLICY IF EXISTS "tenant_isolation" ON "wireline_campaigns"';
  EXECUTE 'DROP POLICY IF EXISTS "tenant_isolation" ON "wireline_call_events"';
  EXECUTE 'DROP POLICY IF EXISTS "tenant_isolation" ON "wireline_enrollments"';
  EXECUTE 'DROP POLICY IF EXISTS "tenant_isolation" ON "wireline_usage_snapshots"';
  EXECUTE 'DROP POLICY IF EXISTS "tenant_isolation" ON "wireline_audit_logs"';
  EXECUTE 'DROP POLICY IF EXISTS "tenant_isolation" ON "wireline_subscriptions"';
  EXECUTE 'DROP POLICY IF EXISTS "tenant_isolation" ON "wireline_api_keys"';
  EXECUTE 'DROP POLICY IF EXISTS "tenant_isolation" ON "wireline_knowledge_base_documents"';
  EXECUTE 'DROP POLICY IF EXISTS "tenant_isolation" ON "wireline_conversations"';
  EXECUTE 'DROP POLICY IF EXISTS "tenant_isolation" ON "wireline_messages"';
  EXECUTE 'DROP POLICY IF EXISTS "tenant_isolation" ON "wireline_integrations"';
  EXECUTE 'DROP POLICY IF EXISTS "tenant_isolation" ON "wireline_call_summaries"';
  EXECUTE 'DROP POLICY IF EXISTS "tenant_isolation" ON "wireline_webhook_events"';
  EXECUTE 'DROP POLICY IF EXISTS "tenant_isolation" ON "wireline_user_sessions"';
  EXECUTE 'DROP POLICY IF EXISTS "tenant_isolation" ON "wireline_user_invitations"';
  EXECUTE 'DROP POLICY IF EXISTS "tenant_isolation" ON "wireline_lead_lists"';
  EXECUTE 'DROP POLICY IF EXISTS "tenant_isolation" ON "wireline_lead_list_items"';
  EXECUTE 'DROP POLICY IF EXISTS "tenant_isolation" ON "wireline_prompt_templates"';
  EXECUTE 'DROP POLICY IF EXISTS "tenant_isolation" ON "wireline_activity_feed"';
  EXECUTE 'DROP POLICY IF EXISTS "tenant_isolation" ON "wireline_support_tickets"';
END $$;

-- Step 2: Enable RLS + create correct UUID-based policies on all current
-- tenant-scoped tables. The app MUST run:
--   SET app.current_user_id = '<uuid>';
-- on every connection before executing tenant-scoped queries.

-- wireline_users (id is the user's own UUID)
ALTER TABLE "wireline_users" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_users"
  FOR ALL
  USING (id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (id = current_setting('app.current_user_id')::uuid);

-- wireline_settings
ALTER TABLE "wireline_settings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_settings"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_user_preferences
ALTER TABLE "wireline_user_preferences" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_user_preferences"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_spend_budgets
ALTER TABLE "wireline_spend_budgets" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_spend_budgets"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_spend_alerts
ALTER TABLE "wireline_spend_alerts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_spend_alerts"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_deletion_queue
ALTER TABLE "wireline_deletion_queue" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_deletion_queue"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_agents
ALTER TABLE "wireline_agents" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_agents"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_directives
ALTER TABLE "wireline_directives" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_directives"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_knowledge
ALTER TABLE "wireline_knowledge" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_knowledge"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_personality
ALTER TABLE "wireline_personality" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_personality"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_agent_lessons
ALTER TABLE "wireline_agent_lessons" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_agent_lessons"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_cloned_voices
ALTER TABLE "wireline_cloned_voices" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_cloned_voices"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_pronunciation_dictionaries
ALTER TABLE "wireline_pronunciation_dictionaries" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_pronunciation_dictionaries"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_agent_conversation_messages
ALTER TABLE "wireline_agent_conversation_messages" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_agent_conversation_messages"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_director_conversation_messages
ALTER TABLE "wireline_director_conversation_messages" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_director_conversation_messages"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_appointments
ALTER TABLE "wireline_appointments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_appointments"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_call_logs
ALTER TABLE "wireline_call_logs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_call_logs"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_email_accounts
ALTER TABLE "wireline_email_accounts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_email_accounts"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_calendar_accounts
ALTER TABLE "wireline_calendar_accounts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_calendar_accounts"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_calendar_events
ALTER TABLE "wireline_calendar_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_calendar_events"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_email_threads
ALTER TABLE "wireline_email_threads" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_email_threads"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_email_messages
ALTER TABLE "wireline_email_messages" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_email_messages"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_sms_threads
ALTER TABLE "wireline_sms_threads" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_sms_threads"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_sms_messages
ALTER TABLE "wireline_sms_messages" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_sms_messages"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_agent_teams
ALTER TABLE "wireline_agent_teams" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_agent_teams"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_call_queues
ALTER TABLE "wireline_call_queues" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_call_queues"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_cadences
ALTER TABLE "wireline_cadences" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_cadences"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_cadence_runs
ALTER TABLE "wireline_cadence_runs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_cadence_runs"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_supervisor_subscriptions
ALTER TABLE "wireline_supervisor_subscriptions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_supervisor_subscriptions"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_fleet_tasks
ALTER TABLE "wireline_fleet_tasks" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_fleet_tasks"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_phone_numbers
ALTER TABLE "wireline_phone_numbers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_phone_numbers"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_outbound_campaigns
ALTER TABLE "wireline_outbound_campaigns" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_outbound_campaigns"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_outbound_leads
ALTER TABLE "wireline_outbound_leads" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_outbound_leads"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_signal_presence
ALTER TABLE "wireline_signal_presence" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_signal_presence"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_intake_keys
ALTER TABLE "wireline_intake_keys" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_intake_keys"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_audit_log
ALTER TABLE "wireline_audit_log" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_audit_log"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_webhooks
ALTER TABLE "wireline_webhooks" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_webhooks"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_webhook_deliveries
ALTER TABLE "wireline_webhook_deliveries" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_webhook_deliveries"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_dnc_list
ALTER TABLE "wireline_dnc_list" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_dnc_list"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_consent_log
ALTER TABLE "wireline_consent_log" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_consent_log"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_onboarding_progress
ALTER TABLE "wireline_onboarding_progress" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_onboarding_progress"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_subscriptions
ALTER TABLE "wireline_subscriptions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_subscriptions"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_team_members
ALTER TABLE "wireline_team_members" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_team_members"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_quota_limits
ALTER TABLE "wireline_quota_limits" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_quota_limits"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_quota_usage
ALTER TABLE "wireline_quota_usage" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_quota_usage"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_crm_connections
ALTER TABLE "wireline_crm_connections" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_crm_connections"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_jobs
ALTER TABLE "wireline_jobs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_jobs"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_lead_dossiers
ALTER TABLE "wireline_lead_dossiers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_lead_dossiers"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- wireline_goals
ALTER TABLE "wireline_goals" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wireline_goals"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- Tables WITHOUT user_id (not tenant-scoped by design):
--   wireline_email_suppressions   — global opt-out list
--   wireline_stripe_events        — idempotency tracking, no user scope
--   wireline_password_reset_tokens — looked up by token hash, not user
--   wireline_email_verification_tokens — same pattern
--   wireline_agent_team_members   — scoped via team_id FK, not direct user_id
