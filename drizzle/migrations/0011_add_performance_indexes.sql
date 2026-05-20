-- Add missing indexes for frequently-queried tables to improve performance
-- and eliminate N+1 query patterns. These indexes target common query patterns
-- identified in /api/calls, dashboard stats, webhook processing, and DNC lookups.

-- Phone numbers: Queried by userId when listing numbers, and by agentId
-- when filtering by agent. No indexes existed before this migration.
CREATE INDEX IF NOT EXISTS idx_phone_numbers_user_id 
  ON wireline_phone_numbers USING btree (user_id);

CREATE INDEX IF NOT EXISTS idx_phone_numbers_agent_id 
  ON wireline_phone_numbers USING btree (agent_id);

-- Webhook deliveries: Queried by status for retry queue processing,
-- by nextAttemptAt for scheduling, and by webhookId for delivery tracking.
-- No indexes existed before this migration.
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_user_id 
  ON wireline_webhook_deliveries USING btree (user_id);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_id 
  ON wireline_webhook_deliveries USING btree (webhook_id);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status 
  ON wireline_webhook_deliveries USING btree (status);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_next_attempt 
  ON wireline_webhook_deliveries USING btree (next_attempt_at) 
  WHERE status = 'pending';

-- DNC list: Queried by phone number for fast lookups during dial operations,
-- and by userId when listing DNC entries. No indexes existed before this migration.
CREATE INDEX IF NOT EXISTS idx_dnc_list_user_id 
  ON wireline_dnc_list USING btree (user_id);

CREATE INDEX IF NOT EXISTS idx_dnc_list_phone 
  ON wireline_dnc_list USING btree (phone);

-- Composite index for user's DNC lookups (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_dnc_list_user_phone 
  ON wireline_dnc_list USING btree (user_id, phone);

-- Outbound leads: Add composite indexes for common filtering patterns
-- (status-based queries, recent leads). Only user_id index existed before.
CREATE INDEX IF NOT EXISTS idx_leads_user_status 
  ON wireline_outbound_leads USING btree (user_id, status);

CREATE INDEX IF NOT EXISTS idx_leads_user_created 
  ON wireline_outbound_leads USING btree (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leads_status_next_attempt 
  ON wireline_outbound_leads USING btree (status, next_attempt_at) 
  WHERE status IN ('pending', 'retry');

-- Outbound campaigns: Add status index for dashboard filtering
CREATE INDEX IF NOT EXISTS idx_campaigns_status 
  ON wireline_outbound_campaigns USING btree (status);

CREATE INDEX IF NOT EXISTS idx_campaigns_agent_id 
  ON wireline_outbound_campaigns USING btree (agent_id);

-- Agent lessons: Add composite index for common query pattern
CREATE INDEX IF NOT EXISTS idx_agent_lessons_agent_created 
  ON wireline_agent_lessons USING btree (agent_id, created_at DESC);

-- Email messages: Add thread_id index for faster thread queries
CREATE INDEX IF NOT EXISTS idx_email_messages_thread_id 
  ON wireline_email_messages USING btree (thread_id);

CREATE INDEX IF NOT EXISTS idx_email_messages_thread_created 
  ON wireline_email_messages USING btree (thread_id, created_at DESC);

-- Call logs: Add composite index for common dashboard query pattern (user + outcome)
CREATE INDEX IF NOT EXISTS idx_call_logs_user_outcome 
  ON wireline_call_logs USING btree (user_id, outcome_tag) 
  WHERE outcome_tag IS NOT NULL;

-- Call logs: Add composite index for campaign analytics
CREATE INDEX IF NOT EXISTS idx_call_logs_user_campaign 
  ON wireline_call_logs USING btree (user_id, campaign_source) 
  WHERE campaign_source IS NOT NULL;

-- Appointments: Add status index for filtering
CREATE INDEX IF NOT EXISTS idx_appointments_status 
  ON wireline_appointments USING btree (status);

CREATE INDEX IF NOT EXISTS idx_appointments_user_status 
  ON wireline_appointments USING btree (user_id, status);
