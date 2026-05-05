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

