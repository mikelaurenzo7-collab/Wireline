-- Separate Director (fleet) and Painter (design studio) conversation threads.

ALTER TABLE wireline_director_conversation_messages
  ADD COLUMN IF NOT EXISTS thread_key TEXT NOT NULL DEFAULT 'director';

CREATE INDEX IF NOT EXISTS idx_director_conv_user_thread_created
  ON wireline_director_conversation_messages (user_id, thread_key, created_at DESC);
