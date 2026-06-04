ALTER TABLE wireline_director_conversation_messages
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
