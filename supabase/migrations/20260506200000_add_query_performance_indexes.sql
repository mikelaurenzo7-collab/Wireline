-- Migration: Add Query Performance Indexes
-- Date: 2026-05-06
-- Purpose: Add high-leverage indexes for the most common queries across the system.
-- Impact: Speeds up call logs, email threads, outbound leads, webhooks, audit logs,
--         directives, knowledge, phone numbers, spend tracking, subscriptions, preferences

-- Agent Performance Improvements
-- Lesson filtering index (knowledge-gap lessons excluded from runtime injection)
CREATE INDEX IF NOT EXISTS wireline_agent_lessons_agent_created_idx
    ON wireline_agent_lessons(agent_id, created_at DESC);

-- Scheduled Callbacks index
CREATE INDEX IF NOT EXISTS wireline_outbound_leads_callback_idx
    ON wireline_outbound_leads(status, callback_scheduled_at)
    WHERE status = 'Callback-Scheduled';

-- Agent Lesson Deduplication unique index
CREATE UNIQUE INDEX IF NOT EXISTS wireline_agent_lessons_agent_lesson_uniq
    ON wireline_agent_lessons(agent_id, lesson);

-- ─────────────────────────────────────────────────────────────────────────────
-- Query Performance Indexes
-- ─────────────────────────────────────────────────────────────────────────────

-- Fleet/Agent lookups by user
CREATE INDEX IF NOT EXISTS wireline_agents_user_id_idx
    ON wireline_agents(user_id, created_at DESC);

-- Call log lookups — user listens to calls and filters by date/status
CREATE INDEX IF NOT EXISTS wireline_call_logs_user_id_idx
    ON wireline_call_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wireline_call_logs_agent_id_idx
    ON wireline_call_logs(agent_id, created_at DESC);

-- Email thread/message lookups by user and thread
CREATE INDEX IF NOT EXISTS wireline_email_threads_user_id_idx
    ON wireline_email_threads(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wireline_email_messages_thread_id_idx
    ON wireline_email_messages(thread_id, created_at ASC);

-- Outbound lead lookups by agent and status (dialing, callbacks, DNC)
CREATE INDEX IF NOT EXISTS wireline_outbound_leads_agent_status_idx
    ON wireline_outbound_leads(agent_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS wireline_outbound_leads_user_id_idx
    ON wireline_outbound_leads(user_id, created_at DESC);

-- Webhook delivery status lookups (e.g. pending retries, failed deliveries)
CREATE INDEX IF NOT EXISTS wireline_webhook_deliveries_status_idx
    ON wireline_webhook_deliveries(status, created_at ASC)
    WHERE status IN ('pending', 'failed');

-- Audit log lookups by user and entity
CREATE INDEX IF NOT EXISTS wireline_audit_log_user_id_idx
    ON wireline_audit_log(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS wireline_audit_log_entity_idx
    ON wireline_audit_log(entity_type, entity_id, timestamp DESC);

-- Directive/Knowledge lookups during agent training
CREATE INDEX IF NOT EXISTS wireline_directives_agent_id_idx
    ON wireline_directives(agent_id, priority DESC);
CREATE INDEX IF NOT EXISTS wireline_knowledge_agent_id_idx
    ON wireline_knowledge(agent_id);

-- Phone number lookups during provisioning
CREATE INDEX IF NOT EXISTS wireline_phone_numbers_user_id_idx
    ON wireline_phone_numbers(user_id, created_at DESC);

-- Spend tracking lookups
CREATE INDEX IF NOT EXISTS wireline_spend_budgets_user_id_idx
    ON wireline_spend_budgets(user_id);
CREATE INDEX IF NOT EXISTS wireline_spend_alerts_user_id_idx
    ON wireline_spend_alerts(user_id, created_at DESC);

-- Settings/subscriptions lookups
CREATE INDEX IF NOT EXISTS wireline_subscriptions_user_id_idx
    ON wireline_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS wireline_stripe_events_event_id_idx
    ON wireline_stripe_events(event_id);

-- User preferences lookups
CREATE INDEX IF NOT EXISTS wireline_user_preferences_user_id_idx
    ON wireline_user_preferences(user_id);
