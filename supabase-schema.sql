-- Run this in your Supabase SQL Editor to set up the architecture

CREATE TABLE wireline_agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  phone_number TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE wireline_directives (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id TEXT NOT NULL, -- Simplified for example to string ID
  content TEXT NOT NULL,
  priority INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE wireline_knowledge (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE wireline_personality (
  agent_id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE wireline_calls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id TEXT NOT NULL,
  call_id TEXT NOT NULL,
  recording_url TEXT,
  transcript TEXT,
  summary TEXT,
  duration TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE wireline_appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id TEXT NOT NULL,
  call_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  service_type TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  status TEXT DEFAULT 'Scheduled',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE wireline_agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  channel TEXT DEFAULT 'voice', -- 'voice', 'email', 'omnichannel'
  voice_id TEXT DEFAULT 'bIHbv24MWmeRgasZH58o',
  voice_provider TEXT DEFAULT '11labs',
  first_message TEXT DEFAULT 'Hello! Thank you for calling. How can I help you today?',
  archetype TEXT DEFAULT 'Receptionist',
  ambient_noise TEXT DEFAULT 'off',
  website_url TEXT,
  transfer_phone TEXT,
  email_auto_respond BOOLEAN DEFAULT FALSE,
  email_agent_tone TEXT DEFAULT 'Professional',
  email_signature TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE wireline_settings (
  id TEXT PRIMARY KEY DEFAULT 'global',
  vapi_private_key TEXT,
  vapi_phone_number_id TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE wireline_outbound_leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id TEXT NOT NULL,
  customer_name TEXT,
  customer_number TEXT NOT NULL,
  context TEXT,
  status TEXT DEFAULT 'Pending',
  call_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE wireline_call_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vapi_call_id TEXT,
  agent_id TEXT,
  direction TEXT,
  customer_number TEXT,
  duration_seconds INTEGER DEFAULT 0,
  cost DECIMAL(10,4) DEFAULT 0.0,
  summary TEXT,
  transcript TEXT,
  recording_url TEXT,
  lead_score INTEGER DEFAULT 0, -- 0-100
  intent_label TEXT, -- 'high', 'medium', 'low', 'none'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE wireline_email_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email_address TEXT NOT NULL,
  provider TEXT DEFAULT 'google',
  access_token TEXT,
  refresh_token TEXT,
  expires_at BIGINT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE wireline_email_threads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID REFERENCES wireline_email_accounts(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL, -- Google Thread ID
  customer_email TEXT NOT NULL,
  subject TEXT,
  last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT DEFAULT 'open', -- open, closed, pending_ai
  summary TEXT,
  lead_score INTEGER DEFAULT 0,
  intent_label TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE wireline_email_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id UUID REFERENCES wireline_email_threads(id) ON DELETE CASCADE,
  google_message_id TEXT,
  role TEXT NOT NULL, -- 'ai', 'customer', 'system'
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- FLUENT FLEET TASK BRIDGE
-- Manages handoffs between Phone Agents and Email Agents
CREATE TABLE wireline_fleet_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_type TEXT NOT NULL, -- 'phone_call', 'email_thread'
  source_id TEXT NOT NULL,   -- call_id or thread_id
  target_channel TEXT NOT NULL, -- 'email', 'phone'
  agent_id TEXT REFERENCES wireline_agents(id),
  customer_info JSONB,        -- { name, contact (phone or email) }
  task_type TEXT NOT NULL,    -- 'follow_up', 'callback_required', 'reminder'
  description TEXT,
  status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Note: In a production app you'd enforce RLS (Row Level Security)
-- and proper FOREIGN KEY constraints tying everything to auth.users()
