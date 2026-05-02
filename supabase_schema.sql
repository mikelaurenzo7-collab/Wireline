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

