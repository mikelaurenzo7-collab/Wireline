-- Remove the retired create_fleet_task token without disturbing the remaining
-- per-agent active tool order. The runtime authorization layer independently
-- filters future stale values; this migration makes existing environments
-- deterministic and prevents model-context expansion from the legacy token.
UPDATE wireline_agents AS agent
SET enabled_tools = COALESCE(
  (
    SELECT jsonb_agg(entry.value ORDER BY entry.ordinality)
    FROM jsonb_array_elements(agent.enabled_tools) WITH ORDINALITY AS entry(value, ordinality)
    WHERE entry.value #>> '{}' <> 'create_fleet_task'
  ),
  '[]'::jsonb
)
WHERE jsonb_typeof(agent.enabled_tools) = 'array'
  AND agent.enabled_tools ? 'create_fleet_task';
