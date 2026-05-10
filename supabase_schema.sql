-- WIRELINE CORE SUPABASE SCHEMA
-- ELITE OMNICHANNEL FLEET MANAGEMENT PLATFORM

-- 1. SETTINGS & BILLING
CREATE TABLE IF NOT EXISTS wireline_settings (
    id TEXT PRIMARY KEY,
    user_id UUID DEFAULT auth.uid(),
    subscription_status TEXT DEFAULT 'active',
    max_agents INTEGER DEFAULT 3,
    vapi_private_key TEXT,
    vapi_phone_number_id TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- 2. FLEET INVENTORY (AGENTS)
CREATE TABLE IF NOT EXISTS wireline_agents (
    id TEXT PRIMARY KEY,
    user_id UUID DEFAULT auth.uid(),
    name TEXT NOT NULL,
    voice_id TEXT,
    voice_id_inbound TEXT,
    voice_id_outbound TEXT,
    voice_provider TEXT DEFAULT '11labs',
    first_message TEXT,
    archetype TEXT DEFAULT 'Receptionist',
    ambient_noise TEXT DEFAULT 'off',
    website_url TEXT,
    transfer_phone TEXT,
    email_auto_respond BOOLEAN DEFAULT TRUE,
    email_agent_tone TEXT DEFAULT 'Professional',
    email_signature TEXT,
    channel TEXT DEFAULT 'voice',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. COGNITIVE ENGINE (TRAINING DATA)
CREATE TABLE IF NOT EXISTS wireline_directives (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID DEFAULT auth.uid(),
    agent_id TEXT REFERENCES wireline_agents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    priority INTEGER DEFAULT 5
);

CREATE TABLE IF NOT EXISTS wireline_knowledge (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID DEFAULT auth.uid(),
    agent_id TEXT REFERENCES wireline_agents(id) ON DELETE CASCADE,
    content TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wireline_personality (
    agent_id TEXT PRIMARY KEY REFERENCES wireline_agents(id) ON DELETE CASCADE,
    user_id UUID DEFAULT auth.uid(),
    content TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wireline_agent_lessons (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID DEFAULT auth.uid(),
    agent_id TEXT REFERENCES wireline_agents(id) ON DELETE CASCADE,
    lesson TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. COMMITMENTS & LOGISTICS
CREATE TABLE IF NOT EXISTS wireline_appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID DEFAULT auth.uid(),
    agent_id TEXT REFERENCES wireline_agents(id),
    call_id TEXT,
    date TEXT,
    time TEXT,
    customer_name TEXT,
    service_type TEXT,
    status TEXT DEFAULT 'Scheduled',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. SIGNAL ARCHIVES (CALL LOGS)
CREATE TABLE IF NOT EXISTS wireline_call_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID DEFAULT auth.uid(),
    vapi_call_id TEXT UNIQUE,
    agent_id TEXT REFERENCES wireline_agents(id),
    direction TEXT,
    customer_number TEXT,
    duration_seconds INTEGER,
    cost DECIMAL(10, 4),
    summary TEXT,
    transcript TEXT,
    recording_url TEXT,
    lead_score INTEGER DEFAULT 0,
    intent_label TEXT DEFAULT 'none',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. OMNICHANNEL RELAY (EMAIL)
CREATE TABLE IF NOT EXISTS wireline_email_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID DEFAULT auth.uid(),
    email_address TEXT UNIQUE NOT NULL,
    provider TEXT DEFAULT 'google',
    access_token TEXT,
    refresh_token TEXT,
    expires_at BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wireline_email_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID DEFAULT auth.uid(),
    account_id UUID REFERENCES wireline_email_accounts(id) ON DELETE CASCADE,
    thread_id TEXT UNIQUE,
    customer_email TEXT,
    subject TEXT,
    status TEXT DEFAULT 'open',
    summary TEXT,
    lead_score INTEGER DEFAULT 0,
    intent_label TEXT DEFAULT 'none',
    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wireline_email_messages (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID DEFAULT auth.uid(),
    thread_id UUID REFERENCES wireline_email_threads(id) ON DELETE CASCADE,
    google_message_id TEXT,
    role TEXT, -- 'user' or 'ai'
    content TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. FLEET HANDOFF (TASKS)
CREATE TABLE IF NOT EXISTS wireline_fleet_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID DEFAULT auth.uid(),
    source_type TEXT, -- e.g. 'phone_call'
    source_id TEXT,
    target_channel TEXT, -- e.g. 'email'
    agent_id TEXT REFERENCES wireline_agents(id),
    customer_info JSONB,
    task_type TEXT,
    description TEXT,
    status TEXT DEFAULT 'pending',
    priority TEXT DEFAULT 'medium',
    due_date TIMESTAMPTZ,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. NETWORK LINKS (PHONE NUMBERS)
CREATE TABLE IF NOT EXISTS wireline_phone_numbers (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID DEFAULT auth.uid(),
    phone_number TEXT UNIQUE NOT NULL,
    vapi_number_id TEXT,
    agent_id TEXT REFERENCES wireline_agents(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. OUTBOUND SIGNAL (LEADS)
CREATE TABLE IF NOT EXISTS wireline_outbound_leads (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID DEFAULT auth.uid(),
    agent_id TEXT REFERENCES wireline_agents(id),
    phone_number TEXT,
    customer_number TEXT,
    customer_name TEXT,
    context TEXT,
    status TEXT DEFAULT 'Pending',
    call_id TEXT,
    last_called_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. REAL-TIME SIGNAL PRESENCE
CREATE TABLE IF NOT EXISTS wireline_signal_presence (
    id TEXT PRIMARY KEY, -- call_id
    user_id UUID DEFAULT auth.uid(),
    agent_id TEXT REFERENCES wireline_agents(id),
    customer_number TEXT,
    status TEXT,
    label TEXT,
    type TEXT DEFAULT 'voice',
    started_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. AUTH & RLS POLICIES
-- Enable RLS on all tables
ALTER TABLE wireline_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE wireline_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE wireline_directives ENABLE ROW LEVEL SECURITY;
ALTER TABLE wireline_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE wireline_personality ENABLE ROW LEVEL SECURITY;
ALTER TABLE wireline_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE wireline_call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE wireline_email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE wireline_email_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE wireline_email_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE wireline_fleet_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE wireline_phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE wireline_outbound_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE wireline_signal_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE wireline_agent_lessons ENABLE ROW LEVEL SECURITY;

-- Create policies (Owner only)
-- Example for wireline_agents
CREATE POLICY "Users can manage their own agents" ON wireline_agents
    FOR ALL USING (auth.uid() = user_id);

-- Apply similar policies to other tables
CREATE POLICY "Users can manage their own settings" ON wireline_settings FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own directives" ON wireline_directives FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own knowledge" ON wireline_knowledge FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own personality" ON wireline_personality FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own appointments" ON wireline_appointments FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own call logs" ON wireline_call_logs FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own email accounts" ON wireline_email_accounts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own email threads" ON wireline_email_threads FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own email messages" ON wireline_email_messages FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own fleet tasks" ON wireline_fleet_tasks FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own phone numbers" ON wireline_phone_numbers FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own leads" ON wireline_outbound_leads FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own presence signals" ON wireline_signal_presence FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own agent lessons" ON wireline_agent_lessons FOR ALL USING (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────────────
-- 11. IDEMPOTENT MIGRATIONS — safe to re-run on existing installs.
-- ────────────────────────────────────────────────────────────────────

-- Outbound leads: add customer_number, context, last_called_at if missing.
ALTER TABLE wireline_outbound_leads ADD COLUMN IF NOT EXISTS customer_number TEXT;
ALTER TABLE wireline_outbound_leads ADD COLUMN IF NOT EXISTS context TEXT;
ALTER TABLE wireline_outbound_leads ADD COLUMN IF NOT EXISTS last_called_at TIMESTAMPTZ;

-- Email accounts: rename email → email_address (idempotent) and add provider.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'wireline_email_accounts' AND column_name = 'email'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'wireline_email_accounts' AND column_name = 'email_address'
    ) THEN
        ALTER TABLE wireline_email_accounts RENAME COLUMN email TO email_address;
    END IF;
END $$;
ALTER TABLE wireline_email_accounts ADD COLUMN IF NOT EXISTS email_address TEXT;
ALTER TABLE wireline_email_accounts ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'google';
-- agent_id links an email account to a specific agent for routing.
ALTER TABLE wireline_email_accounts ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES wireline_agents(id) ON DELETE SET NULL;

-- Voice LLM picker — operators can route the actual Vapi voice agent through
-- Anthropic instead of Gemini. Persisted on the per-user settings row.
ALTER TABLE wireline_settings ADD COLUMN IF NOT EXISTS voice_llm_provider TEXT DEFAULT 'google';
ALTER TABLE wireline_settings ADD COLUMN IF NOT EXISTS voice_llm_model TEXT DEFAULT 'gemini-1.5-flash';

-- Audit log — every Claude (and optionally Gemini) call is recorded with
-- tokens, cost, latency, model, and free-form metadata. Powers the
-- AI-Spend dashboard and the compliance/debug trail.
CREATE TABLE IF NOT EXISTS wireline_audit_log (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID DEFAULT auth.uid(),
    action TEXT NOT NULL,
    provider TEXT,
    model TEXT,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cache_read_tokens INTEGER DEFAULT 0,
    cache_create_tokens INTEGER DEFAULT 0,
    cost_usd DECIMAL(12, 6) DEFAULT 0,
    latency_ms INTEGER,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS wireline_audit_log_user_created_idx
    ON wireline_audit_log(user_id, created_at DESC);
ALTER TABLE wireline_audit_log ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'wireline_audit_log' AND policyname = 'Users can view their own audit log'
    ) THEN
        EXECUTE 'CREATE POLICY "Users can view their own audit log" ON wireline_audit_log FOR ALL USING (auth.uid() = user_id)';
    END IF;
END $$;

-- Enhanced audit log columns for comprehensive activity monitoring
-- (auth events, agent ops, settings, billing, security, data operations)
-- These additions are idempotent — safe to re-run on existing installs.
ALTER TABLE wireline_audit_log ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'ai.api_call';
ALTER TABLE wireline_audit_log ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'info';
ALTER TABLE wireline_audit_log ADD COLUMN IF NOT EXISTS actor_email TEXT;
ALTER TABLE wireline_audit_log ADD COLUMN IF NOT EXISTS resource_type TEXT;
ALTER TABLE wireline_audit_log ADD COLUMN IF NOT EXISTS resource_id TEXT;
ALTER TABLE wireline_audit_log ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE wireline_audit_log ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- Indexes for efficient audit log filtering and compliance queries
CREATE INDEX IF NOT EXISTS wireline_audit_log_event_type_created_idx
    ON wireline_audit_log(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS wireline_audit_log_severity_created_idx
    ON wireline_audit_log(severity, created_at DESC);
CREATE INDEX IF NOT EXISTS wireline_audit_log_resource_idx
    ON wireline_audit_log(resource_type, resource_id, created_at DESC);

-- Outbound webhooks — per-user destinations that get notified when
-- specific events fire (call.completed, lead.hot, email.received, etc.).
CREATE TABLE IF NOT EXISTS wireline_webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID DEFAULT auth.uid(),
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    events TEXT[] NOT NULL DEFAULT '{}',
    secret TEXT,
    active BOOLEAN DEFAULT TRUE,
    last_triggered_at TIMESTAMPTZ,
    last_status INTEGER,
    last_error TEXT,
    delivery_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE wireline_webhooks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'wireline_webhooks' AND policyname = 'Users can manage their own webhooks'
    ) THEN
        EXECUTE 'CREATE POLICY "Users can manage their own webhooks" ON wireline_webhooks FOR ALL USING (auth.uid() = user_id)';
    END IF;
END $$;

-- Spend budgets — per-user monthly Claude budget with optional hard cap.
-- One row per user. Powers spend.warning / spend.exceeded webhooks and the
-- 402 short-circuit on /api/claude/* when hard_cap is on and exceeded.
CREATE TABLE IF NOT EXISTS wireline_spend_budgets (
    user_id UUID PRIMARY KEY DEFAULT auth.uid(),
    monthly_limit_usd DECIMAL(12, 2) NOT NULL DEFAULT 0,
    hard_cap BOOLEAN NOT NULL DEFAULT FALSE,
    warn_threshold_pct INTEGER NOT NULL DEFAULT 80,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE wireline_spend_budgets ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'wireline_spend_budgets' AND policyname = 'Users can manage their own budget'
    ) THEN
        EXECUTE 'CREATE POLICY "Users can manage their own budget" ON wireline_spend_budgets FOR ALL USING (auth.uid() = user_id)';
    END IF;
END $$;

-- Spend alerts ledger — debounces webhook firing so we send each
-- threshold (e.g. 80%, 100%) at most once per period (YYYY-MM, UTC).
CREATE TABLE IF NOT EXISTS wireline_spend_alerts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID NOT NULL,
    period TEXT NOT NULL,           -- 'YYYY-MM' (UTC)
    threshold_pct INTEGER NOT NULL, -- 80, 100, etc.
    fired_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, period, threshold_pct)
);
CREATE INDEX IF NOT EXISTS wireline_spend_alerts_user_period_idx
    ON wireline_spend_alerts(user_id, period);
ALTER TABLE wireline_spend_alerts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'wireline_spend_alerts' AND policyname = 'Users can view their own spend alerts'
    ) THEN
        EXECUTE 'CREATE POLICY "Users can view their own spend alerts" ON wireline_spend_alerts FOR ALL USING (auth.uid() = user_id)';
    END IF;
END $$;

-- Inbound lead intake — additive columns on wireline_outbound_leads so
-- inbound and outbound flow through the same dialer / triage surfaces.
ALTER TABLE wireline_outbound_leads ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
ALTER TABLE wireline_outbound_leads ADD COLUMN IF NOT EXISTS metadata JSONB;
ALTER TABLE wireline_outbound_leads ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS wireline_outbound_leads_user_source_idx
    ON wireline_outbound_leads(user_id, source);

-- Per-user API keys for the public lead-intake endpoint. Plaintext is
-- shown only at create time; we store SHA-256 of the key plus a
-- 12-char prefix so operators can recognize their keys in the UI.
CREATE TABLE IF NOT EXISTS wireline_intake_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID DEFAULT auth.uid(),
    name TEXT NOT NULL,
    key_prefix TEXT NOT NULL,      -- 'wlk_xxxxxxxx' (first 12 chars)
    key_hash TEXT NOT NULL,        -- sha256 hex of full key
    default_agent_id TEXT REFERENCES wireline_agents(id) ON DELETE SET NULL,
    active BOOLEAN DEFAULT TRUE,
    last_used_at TIMESTAMPTZ,
    use_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS wireline_intake_keys_hash_idx
    ON wireline_intake_keys(key_hash);
ALTER TABLE wireline_intake_keys ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'wireline_intake_keys' AND policyname = 'Users can manage their own intake keys'
    ) THEN
        EXECUTE 'CREATE POLICY "Users can manage their own intake keys" ON wireline_intake_keys FOR ALL USING (auth.uid() = user_id)';
    END IF;
END $$;

-- Webhook delivery queue — every dispatch persists a row so failures
-- can retry with exponential backoff (30s · 2m · 10m · 1h between
-- attempts, 5 attempts max → 'dead'). Powers the per-hook delivery
-- history view in Admin and the manual-retry button.
CREATE TABLE IF NOT EXISTS wireline_webhook_deliveries (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID NOT NULL,
    webhook_id UUID NOT NULL REFERENCES wireline_webhooks(id) ON DELETE CASCADE,
    event TEXT NOT NULL,
    payload JSONB NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'success' | 'dead'
    last_status_code INTEGER,
    last_error TEXT,
    next_attempt_at TIMESTAMPTZ DEFAULT NOW(),
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Partial index makes the scheduler's "due now" scan O(due rows).
CREATE INDEX IF NOT EXISTS wireline_webhook_deliveries_due_idx
    ON wireline_webhook_deliveries(next_attempt_at)
    WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS wireline_webhook_deliveries_hook_created_idx
    ON wireline_webhook_deliveries(webhook_id, created_at DESC);
ALTER TABLE wireline_webhook_deliveries ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'wireline_webhook_deliveries' AND policyname = 'Users can view their own webhook deliveries'
    ) THEN
        EXECUTE 'CREATE POLICY "Users can view their own webhook deliveries" ON wireline_webhook_deliveries FOR ALL USING (auth.uid() = user_id)';
    END IF;
END $$;

-- Scheduled Daily Brief email — Claude's morning brief gets emailed
-- to a configurable recipient at a configurable UTC time. The
-- background scheduler in server.ts polls every 15 minutes and sends
-- via the operator's connected Gmail account.
ALTER TABLE wireline_settings ADD COLUMN IF NOT EXISTS daily_brief_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE wireline_settings ADD COLUMN IF NOT EXISTS daily_brief_send_at TEXT NOT NULL DEFAULT '13:00';   -- HH:MM, UTC
ALTER TABLE wireline_settings ADD COLUMN IF NOT EXISTS daily_brief_recipient TEXT;
ALTER TABLE wireline_settings ADD COLUMN IF NOT EXISTS daily_brief_last_sent_at TIMESTAMPTZ;
ALTER TABLE wireline_settings ADD COLUMN IF NOT EXISTS daily_brief_last_error TEXT;

-- Auto-dial on inbound intake — when on, leads pushed via this key
-- automatically trigger an outbound call from the default agent.
ALTER TABLE wireline_intake_keys ADD COLUMN IF NOT EXISTS auto_dial BOOLEAN NOT NULL DEFAULT FALSE;

-- Idempotency on inbound intake — operators (or middleware like Zapier)
-- can pass an Idempotency-Key header so retries don't create duplicate
-- leads. Partial unique index allows existing rows to coexist with
-- legacy NULL values.
ALTER TABLE wireline_outbound_leads ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS wireline_outbound_leads_user_idem_idx
    ON wireline_outbound_leads(user_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- Knowledge timestamp — Knowledge Atlas sorts/displays by this column
-- and the dedupe pass uses it to break ties. Idempotent so existing
-- installs backfill on re-run.
ALTER TABLE wireline_knowledge ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Agent role — the business function this agent performs.
-- Distinct from archetype (communication style). Roles drive default
-- personality templates and surface role-specific UI affordances.
-- Values: sales | customer_service | scheduler | collections |
--         technical_support | lead_qualifier | receptionist | marketing
ALTER TABLE wireline_agents ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'customer_service';

-- Post-call Claude enrichment columns — sentiment + coaching note stored alongside
-- lead_score and intent_label. Added as migrations so existing installs upgrade safely.
ALTER TABLE wireline_call_logs ADD COLUMN IF NOT EXISTS sentiment TEXT DEFAULT 'neutral';
ALTER TABLE wireline_call_logs ADD COLUMN IF NOT EXISTS coaching_note TEXT;

-- Stripe billing — one row per user, mirrored from Stripe via webhook.
-- The Stripe subscription is the source of truth; this table is a cache
-- so the app can render plan / status without round-tripping Stripe on
-- every request. wireline_settings.subscription_status is also kept
-- in sync so the existing gates (outbound dial, vapi webhook) continue
-- to work without touching their guard logic.
CREATE TABLE IF NOT EXISTS wireline_subscriptions (
    user_id UUID PRIMARY KEY DEFAULT auth.uid(),
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    plan TEXT,                        -- 'starter' | 'pro' | 'enterprise'
    status TEXT,                      -- Stripe subscription status verbatim
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS wireline_subscriptions_customer_idx
    ON wireline_subscriptions(stripe_customer_id);
ALTER TABLE wireline_subscriptions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'wireline_subscriptions' AND policyname = 'Users can view their own subscription'
    ) THEN
        EXECUTE 'CREATE POLICY "Users can view their own subscription" ON wireline_subscriptions FOR ALL USING (auth.uid() = user_id)';
    END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────
-- STRIPE WEBHOOK IDEMPOTENCY
-- Stripe retries failed deliveries (and sometimes succeeds twice). We
-- record every event id we've fully processed; the webhook handler
-- short-circuits on duplicate ids. Service-role only — never read by
-- the frontend.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wireline_stripe_events (
    event_id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    processed_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE wireline_stripe_events ENABLE ROW LEVEL SECURITY;
-- No RLS policies — service role bypasses RLS, and there's no user_id
-- to scope by. Frontends should never query this directly.

-- ────────────────────────────────────────────────────────────────────
-- PERFORMANCE INDEXES — idempotent, safe to re-run on existing installs.
--
-- The tables below are queried almost exclusively by (user_id) or
-- (user_id, agent_id) but lacked indexes. Without them Supabase/Postgres
-- falls back to sequential scans which become very slow as row counts
-- grow. All indexes are CONCURRENT-safe and IF NOT EXISTS so this block
-- can be run on live databases without downtime.
-- ────────────────────────────────────────────────────────────────────

-- wireline_agents — most-read table; every API call that resolves an
-- agent starts here.
CREATE INDEX IF NOT EXISTS wireline_agents_user_idx
    ON wireline_agents(user_id);

-- wireline_directives — fetched on every voice/email call to build the
-- agent's instruction set.
CREATE INDEX IF NOT EXISTS wireline_directives_user_agent_idx
    ON wireline_directives(user_id, agent_id);

-- wireline_knowledge — same query pattern as directives.
CREATE INDEX IF NOT EXISTS wireline_knowledge_user_agent_idx
    ON wireline_knowledge(user_id, agent_id);

-- wireline_call_logs — dashboard stats, insights, triage, activity feed,
-- and call-log list all query this table ordered by created_at DESC.
CREATE INDEX IF NOT EXISTS wireline_call_logs_user_created_idx
    ON wireline_call_logs(user_id, created_at DESC);

-- wireline_appointments — calendar availability checks run on every email
-- that mentions a date.
CREATE INDEX IF NOT EXISTS wireline_appointments_user_idx
    ON wireline_appointments(user_id);

-- wireline_fleet_tasks — polled every 30 s from the dashboard and read
-- by the task bridge; also written by the email sync on every run.
CREATE INDEX IF NOT EXISTS wireline_fleet_tasks_user_created_idx
    ON wireline_fleet_tasks(user_id, created_at DESC);

-- wireline_fleet_tasks dedup — each (source, task_type) pair should
-- create at most one pending task. The partial index (status = 'pending')
-- keeps it lightweight and only blocks actual duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS wireline_fleet_tasks_source_type_pending_idx
    ON wireline_fleet_tasks(user_id, source_id, task_type)
    WHERE status = 'pending' AND source_id IS NOT NULL;

-- wireline_email_accounts — looked up by user_id on every email sync.
CREATE INDEX IF NOT EXISTS wireline_email_accounts_user_idx
    ON wireline_email_accounts(user_id);

-- wireline_email_threads — the sync inner loop checks for an existing
-- thread by thread_id (already UNIQUE) but the activity feed and triage
-- surface filter/order by user_id + created_at.
CREATE INDEX IF NOT EXISTS wireline_email_threads_user_created_idx
    ON wireline_email_threads(user_id, created_at DESC);

-- wireline_email_messages — every sync pass checks whether a Gmail
-- message is already stored. Without an index this is a full-table scan.
CREATE INDEX IF NOT EXISTS wireline_email_messages_google_id_idx
    ON wireline_email_messages(google_message_id);

-- Enforce uniqueness so concurrent sync runs can't insert the same
-- Gmail message twice even under a race condition. Uses DO/EXECUTE
-- so it's idempotent if the constraint already exists.
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'wireline_email_messages_google_message_id_key'
    ) THEN
        ALTER TABLE wireline_email_messages
            ADD CONSTRAINT wireline_email_messages_google_message_id_key
            UNIQUE (google_message_id);
    END IF;
END $$;

-- wireline_email_messages — thread_id FK is the join key used by the
-- thread detail view and email reply endpoint.
CREATE INDEX IF NOT EXISTS wireline_email_messages_thread_idx
    ON wireline_email_messages(thread_id);

-- wireline_signal_presence — polled frequently from the dashboard live
-- view; no index meant a full scan on every poll.
CREATE INDEX IF NOT EXISTS wireline_signal_presence_user_idx
    ON wireline_signal_presence(user_id);

-- wireline_agent_lessons — activity feed reads the 5 most recent lessons.
CREATE INDEX IF NOT EXISTS wireline_agent_lessons_user_created_idx
    ON wireline_agent_lessons(user_id, created_at DESC);

-- ────────────────────────────────────────────────────────────────────
-- OUTBOUND CAMPAIGNS — named batches with schedule + retry config.
-- Each campaign owns N leads from wireline_outbound_leads via campaign_id.
-- Status lifecycle: draft → active → paused → completed.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wireline_outbound_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID DEFAULT auth.uid(),
    name TEXT NOT NULL,
    goal TEXT,
    agent_id TEXT REFERENCES wireline_agents(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'draft',          -- draft | active | paused | completed
    call_window_start TEXT DEFAULT '09:00',  -- HH:MM (operator local)
    call_window_end   TEXT DEFAULT '17:00',
    max_attempts INTEGER DEFAULT 3,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS wireline_outbound_campaigns_user_idx
    ON wireline_outbound_campaigns(user_id);
ALTER TABLE wireline_outbound_campaigns ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'wireline_outbound_campaigns'
          AND policyname = 'Users can manage their own campaigns'
    ) THEN
        EXECUTE 'CREATE POLICY "Users can manage their own campaigns" ON wireline_outbound_campaigns FOR ALL USING (auth.uid() = user_id)';
    END IF;
END $$;

-- Attach outbound leads to campaigns (nullable — pre-existing leads unaffected).
ALTER TABLE wireline_outbound_leads ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES wireline_outbound_campaigns(id) ON DELETE SET NULL;
ALTER TABLE wireline_outbound_leads ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS wireline_outbound_leads_campaign_idx
    ON wireline_outbound_leads(campaign_id);

-- Appointment enrichment — manual notes + caller phone number.
ALTER TABLE wireline_appointments ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE wireline_appointments ADD COLUMN IF NOT EXISTS phone_number TEXT;


-- ────────────────────────────────────────────────────────────────────
-- DO NOT CALL (DNC) LIST — compliance-critical for outbound operations.
-- Every outbound dial and campaign launch checks this list and skips
-- any number that appears here, protecting operators from TCPA/DNC violations.
-- Numbers are stored normalized (digits only, E.164-compatible) so that
-- "+1 (555) 123-4567" and "5551234567" both resolve to the same entry.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wireline_dnc_list (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL DEFAULT auth.uid(),
    phone       TEXT NOT NULL,              -- normalized: digits only
    phone_raw   TEXT,                       -- original string for display
    reason      TEXT,                       -- optional: 'opt-out' | 'legal' | 'custom'
    source      TEXT DEFAULT 'manual',      -- 'manual' | 'csv' | 'opt-out'
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS wireline_dnc_list_user_phone_idx
    ON wireline_dnc_list(user_id, phone);

CREATE INDEX IF NOT EXISTS wireline_dnc_list_user_created_idx
    ON wireline_dnc_list(user_id, created_at DESC);

ALTER TABLE wireline_dnc_list ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'wireline_dnc_list'
          AND policyname = 'Users can manage their own DNC list'
    ) THEN
        EXECUTE 'CREATE POLICY "Users can manage their own DNC list" ON wireline_dnc_list FOR ALL USING (auth.uid() = user_id)';
    END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────
-- CALL QA SCORING — Claude evaluates every completed call against a
-- 5-dimension rubric (0–20 pts each, 100 total). Scores are stored
-- alongside the call log so they are available in both the call detail
-- view and the aggregate Insights → Quality tab.
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE wireline_call_logs ADD COLUMN IF NOT EXISTS qa_score INTEGER;
ALTER TABLE wireline_call_logs ADD COLUMN IF NOT EXISTS qa_breakdown JSONB;
-- qa_breakdown shape: { greeting: N, discovery: N, solution: N, objection: N, closing: N, notes: "..." }

CREATE INDEX IF NOT EXISTS wireline_call_logs_qa_score_idx
    ON wireline_call_logs(user_id, qa_score)
    WHERE qa_score IS NOT NULL;

-- User preferences and journey tracking for personalized UX
CREATE TABLE IF NOT EXISTS wireline_user_preferences (
    user_id UUID PRIMARY KEY,
    persona TEXT,
    tour_completed BOOLEAN DEFAULT FALSE,
    onboarding_completed BOOLEAN DEFAULT FALSE,
    help_enabled BOOLEAN DEFAULT TRUE,
    keyboard_shortcuts_enabled BOOLEAN DEFAULT TRUE,
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE wireline_user_preferences ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'wireline_user_preferences' 
        AND policyname = 'Users can manage their own preferences'
    ) THEN
        EXECUTE 'CREATE POLICY "Users can manage their own preferences" ON wireline_user_preferences FOR ALL USING (auth.uid() = user_id)';
    END IF;
END $$;

-- Onboarding progress tracking
CREATE TABLE IF NOT EXISTS wireline_onboarding_progress (
    user_id UUID,
    step_id TEXT,
    completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    metadata JSONB,
    PRIMARY KEY (user_id, step_id)
);

ALTER TABLE wireline_onboarding_progress ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'wireline_onboarding_progress' 
        AND policyname = 'Users can manage their own onboarding progress'
    ) THEN
        EXECUTE 'CREATE POLICY "Users can manage their own onboarding progress" ON wireline_onboarding_progress FOR ALL USING (auth.uid() = user_id)';
    END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Agent Performance Improvements — 2026-05-06
-- ─────────────────────────────────────────────────────────────────────────────

-- Live sentiment label for active calls (populated by conversation-update webhooks).
-- Values: "Live · Active" | "Live · Engaged" | "Live · Tense" | "✓ Positive" | "⚠ Frustrated"
ALTER TABLE wireline_signal_presence ADD COLUMN IF NOT EXISTS label TEXT DEFAULT 'Live · Active';

-- Voicemail-Left is a valid outbound lead status (set by leave_voicemail tool).
-- No schema change needed — wireline_outbound_leads.status is free-text.

-- Index for lesson filtering (knowledge-gap lessons excluded from runtime injection).
-- Existing wireline_agent_lessons table — add index to speed up lesson lookups.
CREATE INDEX IF NOT EXISTS wireline_agent_lessons_agent_created_idx
    ON wireline_agent_lessons(agent_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Scheduled Callbacks — 2026-05-06
-- ─────────────────────────────────────────────────────────────────────────────

-- When an agent uses schedule_callback tool, the lead gets this timestamp.
-- The background scheduler polls for lte(now()) and auto-dials.
ALTER TABLE wireline_outbound_leads ADD COLUMN IF NOT EXISTS callback_scheduled_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS wireline_outbound_leads_callback_idx
    ON wireline_outbound_leads(status, callback_scheduled_at)
    WHERE status = 'Callback-Scheduled';

-- Campaigns: max_attempts and call_window columns are already in the schema.
-- Add Max-Attempts as a recognised terminal status (documentation only).

-- Increment attempts safely without a read-modify-write race.
-- Called by the end-of-call-report handler after every outbound call completion.
CREATE OR REPLACE FUNCTION increment_lead_attempts(p_phone TEXT, p_agent_id TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  -- Strip all non-digit characters except leading '+' so the comparison is
  -- safe and consistent with how customer_number is stored in the table.
  clean_phone TEXT := regexp_replace(p_phone, '[^0-9+]', '', 'g');
  digits_only TEXT;
BEGIN
  -- Compute the digit-only form once to avoid a redundant regexp in the guard.
  digits_only := regexp_replace(clean_phone, '[^0-9]', '', 'g');
  -- Validate input to prevent misuse — phone must contain at least 7 digits.
  IF clean_phone IS NULL OR length(digits_only) < 7 THEN
    RETURN;
  END IF;

  UPDATE wireline_outbound_leads
  SET attempts = COALESCE(attempts, 0) + 1
  WHERE regexp_replace(customer_number, '[^0-9+]', '', 'g') = clean_phone
    AND agent_id = p_agent_id
    AND status NOT IN ('Completed', 'Blocked-DNC', 'Max-Attempts');
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Agent Lesson Deduplication — 2026-05-06
-- ─────────────────────────────────────────────────────────────────────────────
-- Composite unique index prevents the same lesson text from appearing more than
-- once per agent. The post-call pipeline uses this via ON CONFLICT DO NOTHING
-- (ignoreDuplicates:true upsert) which is atomic and race-safe — no
-- check-then-insert window.
CREATE UNIQUE INDEX IF NOT EXISTS wireline_agent_lessons_agent_lesson_uniq
    ON wireline_agent_lessons(agent_id, lesson);

-- ─────────────────────────────────────────────────────────────────────────────
-- Query Performance Indexes — 2026-05-06
-- ─────────────────────────────────────────────────────────────────────────────
-- High-leverage indexes for the most common queries across the system.
-- Each index is carefully scoped to avoid write amplification while maximizing
-- query performance for read-heavy workloads.

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

-- Hot-lead triage: filter email threads by user + lead_score threshold, ordered by recency.
-- Supports: WHERE user_id = ? AND lead_score >= 75 ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS wireline_email_threads_user_score_idx
    ON wireline_email_threads(user_id, lead_score DESC, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Additional Performance Indexes — 2026-05-09
-- ─────────────────────────────────────────────────────────────────────────────

-- Contact-profile lookups: customer history aggregation joins on customer_number
-- Supports: WHERE user_id = ? AND customer_number = ? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS wireline_call_logs_customer_number_idx
    ON wireline_call_logs(user_id, customer_number, created_at DESC);

-- Outbound lead lookup by phone: DNC checks and contact-profile enrichment
CREATE INDEX IF NOT EXISTS wireline_outbound_leads_customer_number_idx
    ON wireline_outbound_leads(user_id, customer_number);

-- Campaign status filter: used by launch/stop/analytics queries
CREATE INDEX IF NOT EXISTS wireline_outbound_campaigns_status_idx
    ON wireline_outbound_campaigns(user_id, status);

-- Fleet task priority queue: pending tasks ordered by priority descending
CREATE INDEX IF NOT EXISTS wireline_fleet_tasks_status_priority_idx
    ON wireline_fleet_tasks(user_id, status, priority DESC)
    WHERE status = 'pending';

-- Daily brief scheduler: pull users with brief enabled, ordered by send_at
-- Supports: WHERE daily_brief_enabled = true AND daily_brief_send_at <= ?
CREATE INDEX IF NOT EXISTS wireline_settings_brief_enabled_idx
    ON wireline_settings(daily_brief_enabled, daily_brief_send_at)
    WHERE daily_brief_enabled = true;

-- Email threads per account: render inbox grouped by account
CREATE INDEX IF NOT EXISTS wireline_email_threads_account_idx
    ON wireline_email_threads(account_id, created_at DESC);

-- Appointments by status: upcoming vs history split
CREATE INDEX IF NOT EXISTS wireline_appointments_user_status_idx
    ON wireline_appointments(user_id, status, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- TCPA / Recording-Consent Ledger  (append-only, never UPDATE rows)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wireline_consent_log (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     UUID NOT NULL,
    call_id     TEXT,
    customer_number TEXT NOT NULL,
    event       TEXT NOT NULL,          -- disclosure_played | consent_granted | consent_revoked | opt_out_requested | recording_started | recording_stopped
    rule_version TEXT NOT NULL,         -- e.g. "2025.1"
    rule        TEXT NOT NULL,          -- one_party | two_party
    state       TEXT,                   -- USPS abbreviation inferred from phone
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: a user may only read their own consent log; inserts happen via service role.
ALTER TABLE wireline_consent_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "wireline_consent_log_select" ON wireline_consent_log
    FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS wireline_consent_log_user_call_idx
    ON wireline_consent_log(user_id, call_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wireline_consent_log_customer_idx
    ON wireline_consent_log(user_id, customer_number, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Per-Tenant Quota Overrides
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wireline_quota_limits (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     UUID NOT NULL,
    dimension   TEXT NOT NULL,          -- claude_tokens_daily | voice_minutes_daily | concurrent_dials | knowledge_rows | intake_rpm
    value       BIGINT NOT NULL,
    enabled     BOOLEAN DEFAULT TRUE,
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, dimension)
);

ALTER TABLE wireline_quota_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "wireline_quota_limits_select" ON wireline_quota_limits
    FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS wireline_quota_limits_user_idx
    ON wireline_quota_limits(user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Per-Tenant Quota Usage Counters
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wireline_quota_usage (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     UUID NOT NULL,
    dimension   TEXT NOT NULL,
    period_key  TEXT NOT NULL,          -- "YYYY-MM-DD" for daily, "YYYY-MM-DDTHH:MM" for minute
    used        BIGINT NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, dimension, period_key)
);

ALTER TABLE wireline_quota_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "wireline_quota_usage_select" ON wireline_quota_usage
    FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS wireline_quota_usage_user_period_idx
    ON wireline_quota_usage(user_id, dimension, period_key DESC);

-- Atomic increment RPC (used by QuotaTracker.checkAndIncrement).
-- Returns: { used: bigint, allowed: boolean }
CREATE OR REPLACE FUNCTION wireline_quota_increment(
    p_user_id    UUID,
    p_dimension  TEXT,
    p_period_key TEXT,
    p_delta      BIGINT,
    p_limit      BIGINT
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_used BIGINT;
BEGIN
    INSERT INTO wireline_quota_usage(user_id, dimension, period_key, used, updated_at)
         VALUES (p_user_id, p_dimension, p_period_key, p_delta, NOW())
    ON CONFLICT (user_id, dimension, period_key)
    DO UPDATE SET used = wireline_quota_usage.used + p_delta, updated_at = NOW()
    RETURNING used INTO v_used;
    RETURN jsonb_build_object('used', v_used, 'allowed', v_used <= p_limit);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Async Job Queue (wireline_jobs)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wireline_jobs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL,
    type         TEXT NOT NULL,         -- post_call_enrichment | webhook_delivery | daily_brief | campaign_dial | consent_check
    payload      JSONB NOT NULL DEFAULT '{}',
    status       TEXT NOT NULL DEFAULT 'pending', -- pending | running | done | failed | dead
    attempts     INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    run_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at   TIMESTAMPTZ,
    finished_at  TIMESTAMPTZ,
    error        TEXT,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE wireline_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "wireline_jobs_select" ON wireline_jobs
    FOR SELECT USING (auth.uid() = user_id);

-- Polling index: claim next pending job ordered by run_at
CREATE INDEX IF NOT EXISTS wireline_jobs_pending_idx
    ON wireline_jobs(status, run_at ASC)
    WHERE status IN ('pending', 'failed');

-- User + status for admin dashboards
CREATE INDEX IF NOT EXISTS wireline_jobs_user_status_idx
    ON wireline_jobs(user_id, status, created_at DESC);

-- Atomic claim RPC (SELECT FOR UPDATE SKIP LOCKED pattern)
CREATE OR REPLACE FUNCTION wireline_claim_job(
    p_types TEXT[] DEFAULT NULL
) RETURNS wireline_jobs
LANGUAGE plpgsql
AS $$
DECLARE
    v_job wireline_jobs;
BEGIN
    SELECT * INTO v_job
    FROM wireline_jobs
    WHERE status = 'pending'
      AND run_at <= NOW()
      AND (p_types IS NULL OR type = ANY(p_types))
    ORDER BY run_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF NOT FOUND THEN RETURN NULL; END IF;

    UPDATE wireline_jobs
       SET status     = 'running',
           started_at = NOW(),
           attempts   = attempts + 1,
           updated_at = NOW()
     WHERE id = v_job.id
    RETURNING * INTO v_job;

    RETURN v_job;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SOC 2 — Team Members (RBAC)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wireline_team_members (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL,       -- maps to wireline_settings.user_id of the account owner
    user_id        UUID NOT NULL,
    email          TEXT NOT NULL,
    role           TEXT NOT NULL DEFAULT 'viewer', -- owner | admin | operator | viewer | auditor
    invited_by     UUID,
    last_active_at TIMESTAMPTZ,
    revoked_at     TIMESTAMPTZ,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, user_id)
);

ALTER TABLE wireline_team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "wireline_team_members_select" ON wireline_team_members
    FOR SELECT USING (
        auth.uid() = user_id OR
        auth.uid() = tenant_id
    );

CREATE INDEX IF NOT EXISTS wireline_team_members_tenant_idx
    ON wireline_team_members(tenant_id, role, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- SOC 2 — Change Log (CC8.1 change management)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wireline_change_log (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id       UUID NOT NULL,
    actor_user_id   UUID NOT NULL,
    actor_email     TEXT NOT NULL,
    change_type     TEXT NOT NULL,      -- access_grant | access_revoke | role_change | config_change | agent_deploy | schema_migration | secret_rotation
    target_user_id  UUID,
    target_email    TEXT,
    previous_value  TEXT,
    new_value       TEXT,
    justification   TEXT,
    approved_by     UUID,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE wireline_change_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "wireline_change_log_select" ON wireline_change_log
    FOR SELECT USING (auth.uid() = tenant_id OR auth.uid() = actor_user_id);

CREATE INDEX IF NOT EXISTS wireline_change_log_tenant_idx
    ON wireline_change_log(tenant_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- SOC 2 — Incident Records (CC7.3 / A1.2)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wireline_incidents (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            UUID,           -- NULL = platform-wide incident
    severity             TEXT NOT NULL,  -- P1 | P2 | P3 | P4
    title                TEXT NOT NULL,
    description          TEXT,
    detected_at          TIMESTAMPTZ NOT NULL,
    resolved_at          TIMESTAMPTZ,
    root_cause           TEXT,
    remediation          TEXT,
    reporter_email       TEXT NOT NULL,
    affected_systems     TEXT[] NOT NULL DEFAULT '{}',
    customer_notified    BOOLEAN DEFAULT FALSE,
    notification_sent_at TIMESTAMPTZ,
    notification_deadline TIMESTAMPTZ,
    created_at           TIMESTAMPTZ DEFAULT NOW(),
    updated_at           TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE wireline_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "wireline_incidents_select" ON wireline_incidents
    FOR SELECT USING (auth.uid() = tenant_id OR tenant_id IS NULL);

CREATE INDEX IF NOT EXISTS wireline_incidents_tenant_severity_idx
    ON wireline_incidents(tenant_id, severity, detected_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Agent Business Profile columns — 2026-05-10
-- These fields are read from wireline_agents.* in the assistant-request
-- webhook handler to inject business context into every agent system prompt.
-- Without these columns the SELECT * query returns NULL for all of them,
-- silently degrading every call regardless of what the operator configured
-- in AgentBusinessProfile.
-- ─────────────────────────────────────────────────────────────────────────────

-- IANA timezone string (e.g. "America/New_York"). Used to localise
-- business-hours comparisons and the out-of-hours greeting.
ALTER TABLE wireline_agents ADD COLUMN IF NOT EXISTS timezone TEXT;

-- JSON object: { mon: {open:"09:00",close:"17:00"}, … }
-- Populated by AgentBusinessProfile. Injected into the system prompt so the
-- agent knows when to offer "we're closed" messaging vs live assistance.
ALTER TABLE wireline_agents ADD COLUMN IF NOT EXISTS business_hours JSONB;

-- One of: "revenue" | "appointments" | "retention" | "support_deflection" | "lead_qual" | "collections"
-- Drives role-specific coaching in the post-call enrichment pipeline and
-- contextualises the agent's KPI coaching notes.
ALTER TABLE wireline_agents ADD COLUMN IF NOT EXISTS kpi_focus TEXT;

-- "strict" | "standard" | "relaxed"
-- Controls how aggressively the agent enforces disallowed_topics and
-- whether it ends calls on policy violations.
ALTER TABLE wireline_agents ADD COLUMN IF NOT EXISTS compliance_mode TEXT DEFAULT 'standard';

-- JSON array of strings: topics the agent must refuse to discuss.
-- e.g. ["competitor pricing", "pending litigation"]
ALTER TABLE wireline_agents ADD COLUMN IF NOT EXISTS disallowed_topics JSONB;

-- JSON array of strings: words/phrases that trigger an immediate escalation
-- (e.g. ["lawyer", "lawsuit", "fraud"]).
ALTER TABLE wireline_agents ADD COLUMN IF NOT EXISTS escalation_keywords JSONB;

-- JSON object of custom key→value pairs interpolated into the system prompt.
-- e.g. { "business_name": "Acme HVAC", "support_email": "help@acme.com" }
ALTER TABLE wireline_agents ADD COLUMN IF NOT EXISTS business_variables JSONB;

-- Message spoken / written when a caller contacts the agent outside
-- business hours. If null the agent improvises from context.
ALTER TABLE wireline_agents ADD COLUMN IF NOT EXISTS out_of_hours_message TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- wireline_settings.business_name — 2026-05-10
-- Used by the TCPA consent-check endpoint (/api/tcpa/consent-check) to embed
-- the operator's business name in the disclosure script. Without this column
-- the query returns a Postgres "column does not exist" error.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE wireline_settings ADD COLUMN IF NOT EXISTS business_name TEXT;
