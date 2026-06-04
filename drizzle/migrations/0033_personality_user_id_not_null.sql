-- Backfill personality.user_id from owning agent, then enforce NOT NULL.
UPDATE wireline_personality AS p
SET user_id = a.user_id
FROM wireline_agents AS a
WHERE p.agent_id = a.id
  AND p.user_id IS NULL
  AND a.user_id IS NOT NULL;

DELETE FROM wireline_personality
WHERE user_id IS NULL;

ALTER TABLE wireline_personality
  ALTER COLUMN user_id SET NOT NULL;
