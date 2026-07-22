-- Rename conversation role check constraints from legacy "operator"
-- to product term "Account Holder". Application code and schema comments
-- already write/read "Account Holder"; the CHECK constraints were never
-- updated, so Studio workroom inserts fail with 23514.

-- Agent workspace threads: operator|agent → Account Holder|agent
ALTER TABLE wireline_agent_conversation_messages
  DROP CONSTRAINT IF EXISTS wireline_agent_conversation_messages_role_check;

UPDATE wireline_agent_conversation_messages
  SET role = 'Account Holder'
  WHERE role = 'operator';

ALTER TABLE wireline_agent_conversation_messages
  ADD CONSTRAINT wireline_agent_conversation_messages_role_check
  CHECK (role IN ('Account Holder', 'agent'));

-- Director threads: operator|director → Account Holder|director
ALTER TABLE wireline_director_conversation_messages
  DROP CONSTRAINT IF EXISTS wireline_director_conversation_messages_role_check;

UPDATE wireline_director_conversation_messages
  SET role = 'Account Holder'
  WHERE role = 'operator';

ALTER TABLE wireline_director_conversation_messages
  ADD CONSTRAINT wireline_director_conversation_messages_role_check
  CHECK (role IN ('Account Holder', 'director'));
