-- Add reasoning column to conversation message tables.
-- Stores Claude's adaptive thinking text so it can be displayed on page reload.

ALTER TABLE wireline_agent_conversation_messages
  ADD COLUMN IF NOT EXISTS reasoning TEXT;

ALTER TABLE wireline_director_conversation_messages
  ADD COLUMN IF NOT EXISTS reasoning TEXT;
