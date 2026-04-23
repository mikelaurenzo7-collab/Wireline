-- WIRELINE CORE SUPABASE SCHEMA
-- ELITE OMNICHANNEL FLEET MANAGEMENT PLATFORM

-- 1. SETTINGS & BILLING
CREATE TABLE IF NOT EXISTS wireline_settings (
    id TEXT PRIMARY KEY,
    subscription_status TEXT DEFAULT 'active',
    max_agents INTEGER DEFAULT 3,
    vapi_private_key TEXT,
    vapi_phone_number_id TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO wireline_settings (id, subscription_status, max_agents) 
VALUES ('global', 'active', 10)
ON CONFLICT (id) DO NOTHING;

-- 2. FLEET INVENTORY (AGENTS)
CREATE TABLE IF NOT EXISTS wireline_agents (
    id TEXT PRIMARY KEY,
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
    agent_id TEXT REFERENCES wireline_agents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    priority INTEGER DEFAULT 5
);

CREATE TABLE IF NOT EXISTS wireline_knowledge (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    agent_id TEXT REFERENCES wireline_agents(id) ON DELETE CASCADE,
    content TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wireline_personality (
    agent_id TEXT PRIMARY KEY REFERENCES wireline_agents(id) ON DELETE CASCADE,
    content TEXT NOT NULL
);

-- 4. COMMITMENTS & LOGISTICS
CREATE TABLE IF NOT EXISTS wireline_appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    email TEXT UNIQUE NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    expires_at BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wireline_email_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    thread_id UUID REFERENCES wireline_email_threads(id) ON DELETE CASCADE,
    google_message_id TEXT,
    role TEXT, -- 'user' or 'ai'
    content TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. FLEET HANDOFF (TASKS)
CREATE TABLE IF NOT EXISTS wireline_fleet_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type TEXT, -- e.g. 'phone_call'
    source_id TEXT,
    target_channel TEXT, -- e.g. 'email'
    agent_id TEXT REFERENCES wireline_agents(id),
    customer_info JSONB,
    task_type TEXT,
    description TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. NETWORK LINKS (PHONE NUMBERS)
CREATE TABLE IF NOT EXISTS wireline_phone_numbers (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    phone_number TEXT UNIQUE NOT NULL,
    vapi_number_id TEXT,
    agent_id TEXT REFERENCES wireline_agents(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. OUTBOUND SIGNAL (LEADS)
CREATE TABLE IF NOT EXISTS wireline_outbound_leads (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    agent_id TEXT REFERENCES wireline_agents(id),
    phone_number TEXT,
    customer_name TEXT,
    status TEXT DEFAULT 'Pending',
    call_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ENABLE ROW LEVEL SECURITY (OPTIONAL BUT RECOMMENDED)
-- For this blueprint, we assume the server-side logic handles security via Service Role.
