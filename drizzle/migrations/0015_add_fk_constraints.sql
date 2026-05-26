-- Migration 0015: Add foreign-key constraints for tenant isolation
-- ---------------------------------------------------------------------------
-- Many tables reference wireline_users.id via a user_id uuid column but lack
-- a formal FK constraint. This creates data-integrity risks:
--   1. Orphaned rows when a user is deleted (phantom tenant data).
--   2. No DB-level guarantee that user_id actually exists.
--
-- Strategy:
--   - Clean orphaned rows FIRST (rows pointing to a non-existent user).
--   - Add FK with ON DELETE SET NULL so deleting a user nulls out the
--     reference instead of cascading a destructive DELETE across dozens
--     of tables. This is the safest default — orphaned rows become
--     "unowned" rather than silently vanishing.
--   - Tables where user_id is NOT NULL (settings, user_preferences,
--     spend_budgets) already have FK constraints via Drizzle .references().
--
-- Safe to run on a live database: each statement is DDL or a targeted
-- DELETE that only touches rows with dangling user_ids.
-- ---------------------------------------------------------------------------

-- 1. wireline_spend_alerts
DELETE FROM wireline_spend_alerts
WHERE user_id IS NOT NULL
  AND user_id NOT IN (SELECT id FROM wireline_users);

ALTER TABLE wireline_spend_alerts
  ADD CONSTRAINT fk_spend_alerts_user_id
  FOREIGN KEY (user_id) REFERENCES wireline_users(id)
  ON DELETE SET NULL;

-- 2. wireline_deletion_queue
DELETE FROM wireline_deletion_queue
WHERE user_id IS NOT NULL
  AND user_id NOT IN (SELECT id FROM wireline_users);

ALTER TABLE wireline_deletion_queue
  ADD CONSTRAINT fk_deletion_queue_user_id
  FOREIGN KEY (user_id) REFERENCES wireline_users(id)
  ON DELETE SET NULL;

-- 3. wireline_agents
DELETE FROM wireline_agents
WHERE user_id IS NOT NULL
  AND user_id NOT IN (SELECT id FROM wireline_users);

ALTER TABLE wireline_agents
  ADD CONSTRAINT fk_agents_user_id
  FOREIGN KEY (user_id) REFERENCES wireline_users(id)
  ON DELETE SET NULL;

-- 4. wireline_call_logs
DELETE FROM wireline_call_logs
WHERE user_id IS NOT NULL
  AND user_id NOT IN (SELECT id FROM wireline_users);

ALTER TABLE wireline_call_logs
  ADD CONSTRAINT fk_call_logs_user_id
  FOREIGN KEY (user_id) REFERENCES wireline_users(id)
  ON DELETE SET NULL;

-- 5. wireline_email_accounts
DELETE FROM wireline_email_accounts
WHERE user_id IS NOT NULL
  AND user_id NOT IN (SELECT id FROM wireline_users);

ALTER TABLE wireline_email_accounts
  ADD CONSTRAINT fk_email_accounts_user_id
  FOREIGN KEY (user_id) REFERENCES wireline_users(id)
  ON DELETE SET NULL;

-- 6. wireline_phone_numbers
DELETE FROM wireline_phone_numbers
WHERE user_id IS NOT NULL
  AND user_id NOT IN (SELECT id FROM wireline_users);

ALTER TABLE wireline_phone_numbers
  ADD CONSTRAINT fk_phone_numbers_user_id
  FOREIGN KEY (user_id) REFERENCES wireline_users(id)
  ON DELETE SET NULL;

-- 7. wireline_outbound_campaigns
DELETE FROM wireline_outbound_campaigns
WHERE user_id IS NOT NULL
  AND user_id NOT IN (SELECT id FROM wireline_users);

ALTER TABLE wireline_outbound_campaigns
  ADD CONSTRAINT fk_outbound_campaigns_user_id
  FOREIGN KEY (user_id) REFERENCES wireline_users(id)
  ON DELETE SET NULL;

-- 8. wireline_outbound_leads
DELETE FROM wireline_outbound_leads
WHERE user_id IS NOT NULL
  AND user_id NOT IN (SELECT id FROM wireline_users);

ALTER TABLE wireline_outbound_leads
  ADD CONSTRAINT fk_outbound_leads_user_id
  FOREIGN KEY (user_id) REFERENCES wireline_users(id)
  ON DELETE SET NULL;

-- 9. wireline_intake_keys
DELETE FROM wireline_intake_keys
WHERE user_id IS NOT NULL
  AND user_id NOT IN (SELECT id FROM wireline_users);

ALTER TABLE wireline_intake_keys
  ADD CONSTRAINT fk_intake_keys_user_id
  FOREIGN KEY (user_id) REFERENCES wireline_users(id)
  ON DELETE SET NULL;

-- 10. wireline_webhooks
DELETE FROM wireline_webhooks
WHERE user_id IS NOT NULL
  AND user_id NOT IN (SELECT id FROM wireline_users);

ALTER TABLE wireline_webhooks
  ADD CONSTRAINT fk_webhooks_user_id
  FOREIGN KEY (user_id) REFERENCES wireline_users(id)
  ON DELETE SET NULL;

-- 11. wireline_team_members.user_id
DELETE FROM wireline_team_members
WHERE user_id IS NOT NULL
  AND user_id NOT IN (SELECT id FROM wireline_users);

ALTER TABLE wireline_team_members
  ADD CONSTRAINT fk_team_members_user_id
  FOREIGN KEY (user_id) REFERENCES wireline_users(id)
  ON DELETE SET NULL;

-- 12. wireline_team_members.tenant_id (the "owner" workspace)
DELETE FROM wireline_team_members
WHERE tenant_id IS NOT NULL
  AND tenant_id NOT IN (SELECT id FROM wireline_users);

ALTER TABLE wireline_team_members
  ADD CONSTRAINT fk_team_members_tenant_id
  FOREIGN KEY (tenant_id) REFERENCES wireline_users(id)
  ON DELETE SET NULL;

-- 13. wireline_audit_log
DELETE FROM wireline_audit_log
WHERE user_id IS NOT NULL
  AND user_id NOT IN (SELECT id FROM wireline_users);

ALTER TABLE wireline_audit_log
  ADD CONSTRAINT fk_audit_log_user_id
  FOREIGN KEY (user_id) REFERENCES wireline_users(id)
  ON DELETE SET NULL;
