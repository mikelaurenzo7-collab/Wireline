-- Migration: Round-2 query performance indexes
-- Date: 2026-05-07
-- Purpose: Add indexes for queries surfaced during the pagination / DoS audit.
--
-- Each index here matches a filter+sort combination used by an authenticated
-- list endpoint. Without these, pagination on large user accounts forces a
-- sequential scan + sort, causing slow response times under load.

-- /api/emails/threads — orders by last_message_at, filtered by user_id
CREATE INDEX IF NOT EXISTS wireline_email_threads_user_last_message_idx
    ON wireline_email_threads(user_id, last_message_at DESC NULLS LAST);

-- /api/email/threads/:id — looked up by external thread_id (Gmail thread, MS Graph conversation)
CREATE INDEX IF NOT EXISTS wireline_email_threads_thread_id_idx
    ON wireline_email_threads(thread_id);

-- /api/campaigns/:id/leads — filter by campaign_id + user_id, sort by created_at
CREATE INDEX IF NOT EXISTS wireline_outbound_leads_campaign_user_idx
    ON wireline_outbound_leads(campaign_id, user_id, created_at DESC);

-- /api/appointments — list by user, sorted recent first
CREATE INDEX IF NOT EXISTS wireline_appointments_user_id_idx
    ON wireline_appointments(user_id, created_at DESC);

-- /api/appointments — date-range queries (calendar view)
CREATE INDEX IF NOT EXISTS wireline_appointments_user_date_idx
    ON wireline_appointments(user_id, date);

-- /api/fleet/tasks — supports the status+priority filters
CREATE INDEX IF NOT EXISTS wireline_fleet_tasks_user_status_priority_idx
    ON wireline_fleet_tasks(user_id, status, priority, created_at DESC);

-- /api/email/accounts — list connected accounts for a user
CREATE INDEX IF NOT EXISTS wireline_email_accounts_user_id_idx
    ON wireline_email_accounts(user_id, created_at DESC);

-- /api/contacts/:number — phone-number lookup across call logs
CREATE INDEX IF NOT EXISTS wireline_call_logs_user_customer_number_idx
    ON wireline_call_logs(user_id, customer_number);

-- /api/onboarding/progress — per-user step status lookup
CREATE INDEX IF NOT EXISTS wireline_onboarding_progress_user_id_idx
    ON wireline_onboarding_progress(user_id);

-- Composite unique constraint on onboarding_progress so an upsert on
-- (user_id, step_id) deduplicates correctly even under concurrent writes.
CREATE UNIQUE INDEX IF NOT EXISTS wireline_onboarding_progress_user_step_uniq
    ON wireline_onboarding_progress(user_id, step_id);

-- /api/knowledge — list by user for the knowledge manager grid
CREATE INDEX IF NOT EXISTS wireline_knowledge_user_id_idx
    ON wireline_knowledge(user_id, created_at DESC);

-- /api/personality — agent_id is the conflict target on upsert
CREATE UNIQUE INDEX IF NOT EXISTS wireline_personality_agent_id_uniq
    ON wireline_personality(agent_id);
