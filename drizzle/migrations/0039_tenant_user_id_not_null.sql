-- Backfill nullable user_id columns from parent rows, purge orphans, enforce NOT NULL.
-- Idempotent: safe to re-run (DELETE/UPDATE are no-ops once clean).

-- Agent-scoped training rows
UPDATE wireline_directives AS d
SET user_id = a.user_id
FROM wireline_agents AS a
WHERE d.agent_id = a.id
  AND d.user_id IS NULL
  AND a.user_id IS NOT NULL;

UPDATE wireline_knowledge AS k
SET user_id = a.user_id
FROM wireline_agents AS a
WHERE k.agent_id = a.id
  AND k.user_id IS NULL
  AND a.user_id IS NOT NULL;

UPDATE wireline_agent_lessons AS l
SET user_id = a.user_id
FROM wireline_agents AS a
WHERE l.agent_id = a.id
  AND l.user_id IS NULL
  AND a.user_id IS NOT NULL;

-- Operational rows keyed by agent_id
UPDATE wireline_appointments AS ap
SET user_id = a.user_id
FROM wireline_agents AS a
WHERE ap.agent_id = a.id
  AND ap.user_id IS NULL
  AND a.user_id IS NOT NULL;

UPDATE wireline_call_logs AS c
SET user_id = a.user_id
FROM wireline_agents AS a
WHERE c.agent_id = a.id
  AND c.user_id IS NULL
  AND a.user_id IS NOT NULL;

UPDATE wireline_fleet_tasks AS t
SET user_id = a.user_id
FROM wireline_agents AS a
WHERE t.agent_id = a.id
  AND t.user_id IS NULL
  AND a.user_id IS NOT NULL;

UPDATE wireline_phone_numbers AS p
SET user_id = a.user_id
FROM wireline_agents AS a
WHERE p.agent_id = a.id
  AND p.user_id IS NULL
  AND a.user_id IS NOT NULL;

UPDATE wireline_outbound_leads AS ol
SET user_id = a.user_id
FROM wireline_agents AS a
WHERE ol.agent_id = a.id
  AND ol.user_id IS NULL
  AND a.user_id IS NOT NULL;

UPDATE wireline_signal_presence AS sp
SET user_id = a.user_id
FROM wireline_agents AS a
WHERE sp.agent_id = a.id
  AND sp.user_id IS NULL
  AND a.user_id IS NOT NULL;

-- Campaign-scoped leads
UPDATE wireline_outbound_leads AS ol
SET user_id = c.user_id
FROM wireline_outbound_campaigns AS c
WHERE ol.campaign_id = c.id
  AND ol.user_id IS NULL
  AND c.user_id IS NOT NULL;

-- Email graph
UPDATE wireline_email_threads AS t
SET user_id = a.user_id
FROM wireline_email_accounts AS a
WHERE t.account_id = a.id
  AND t.user_id IS NULL
  AND a.user_id IS NOT NULL;

UPDATE wireline_email_messages AS m
SET user_id = t.user_id
FROM wireline_email_threads AS t
WHERE m.thread_id = t.id
  AND m.user_id IS NULL
  AND t.user_id IS NOT NULL;

-- Purge rows that cannot be attributed to a tenant
DELETE FROM wireline_spend_alerts WHERE user_id IS NULL;
DELETE FROM wireline_deletion_queue WHERE user_id IS NULL;
DELETE FROM wireline_agents WHERE user_id IS NULL;
DELETE FROM wireline_directives WHERE user_id IS NULL;
DELETE FROM wireline_knowledge WHERE user_id IS NULL;
DELETE FROM wireline_agent_lessons WHERE user_id IS NULL;
DELETE FROM wireline_appointments WHERE user_id IS NULL;
DELETE FROM wireline_call_logs WHERE user_id IS NULL;
DELETE FROM wireline_email_accounts WHERE user_id IS NULL;
DELETE FROM wireline_calendar_accounts WHERE user_id IS NULL;
DELETE FROM wireline_email_threads WHERE user_id IS NULL;
DELETE FROM wireline_email_messages WHERE user_id IS NULL;
DELETE FROM wireline_fleet_tasks WHERE user_id IS NULL;
DELETE FROM wireline_phone_numbers WHERE user_id IS NULL;
DELETE FROM wireline_outbound_campaigns WHERE user_id IS NULL;
DELETE FROM wireline_outbound_leads WHERE user_id IS NULL;
DELETE FROM wireline_signal_presence WHERE user_id IS NULL;
DELETE FROM wireline_intake_keys WHERE user_id IS NULL;
DELETE FROM wireline_audit_log WHERE user_id IS NULL;
DELETE FROM wireline_webhooks WHERE user_id IS NULL;
DELETE FROM wireline_onboarding_progress WHERE user_id IS NULL;

ALTER TABLE wireline_spend_alerts ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE wireline_deletion_queue ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE wireline_agents ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE wireline_directives ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE wireline_knowledge ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE wireline_agent_lessons ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE wireline_appointments ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE wireline_call_logs ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE wireline_email_accounts ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE wireline_calendar_accounts ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE wireline_email_threads ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE wireline_email_messages ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE wireline_fleet_tasks ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE wireline_phone_numbers ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE wireline_outbound_campaigns ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE wireline_outbound_leads ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE wireline_signal_presence ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE wireline_intake_keys ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE wireline_audit_log ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE wireline_webhooks ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE wireline_onboarding_progress ALTER COLUMN user_id SET NOT NULL;
