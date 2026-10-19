-- 0183: where each Bot's meaning-based knowledge index lives.
--
-- The Bot's rules and facts are compiled into one document and indexed so a
-- caller who words a question differently still reaches the right answer.
-- This jsonb records the index id, the indexed document, and the content hash
-- it was built from. The row already belongs to one tenant and is erased with it.
ALTER TABLE "wireline_agents" ADD COLUMN IF NOT EXISTS "knowledge_index" jsonb;