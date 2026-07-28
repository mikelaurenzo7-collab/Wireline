-- Platform-owned X Ads, DocuSign, and Meta destinations are not tenant-bound.
-- Remove them from persisted live-agent selections until each resource is
-- explicitly associated with user_id. Preserve every other selection and its
-- order. The runtime connection filter independently blocks future drift.
UPDATE wireline_agents AS agent
SET enabled_tools = COALESCE(
  (
    SELECT jsonb_agg(entry.value ORDER BY entry.ordinality)
    FROM jsonb_array_elements(agent.enabled_tools) WITH ORDINALITY AS entry(value, ordinality)
    WHERE entry.value #>> '{}' NOT IN (
      'list_x_ad_campaigns',
      'get_x_ad_campaign_stats',
      'send_contract',
      'meta_submit_lead'
    )
  ),
  '[]'::jsonb
)
WHERE jsonb_typeof(agent.enabled_tools) = 'array'
  AND agent.enabled_tools ?| ARRAY[
    'list_x_ad_campaigns',
    'get_x_ad_campaign_stats',
    'send_contract',
    'meta_submit_lead'
  ];
