-- Migration 0015: Add foreign-key constraints for tenant isolation
-- ---------------------------------------------------------------------------
-- Idempotent: skips ADD CONSTRAINT when the FK already exists (safe re-run).
-- ---------------------------------------------------------------------------

-- 1. wireline_spend_alerts
DELETE FROM wireline_spend_alerts
WHERE user_id IS NOT NULL
  AND user_id NOT IN (SELECT id FROM wireline_users);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_spend_alerts_user_id') THEN
    ALTER TABLE wireline_spend_alerts
      ADD CONSTRAINT fk_spend_alerts_user_id
      FOREIGN KEY (user_id) REFERENCES wireline_users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 2. wireline_deletion_queue
DELETE FROM wireline_deletion_queue
WHERE user_id IS NOT NULL
  AND user_id NOT IN (SELECT id FROM wireline_users);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_deletion_queue_user_id') THEN
    ALTER TABLE wireline_deletion_queue
      ADD CONSTRAINT fk_deletion_queue_user_id
      FOREIGN KEY (user_id) REFERENCES wireline_users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 3. wireline_agents
DELETE FROM wireline_agents
WHERE user_id IS NOT NULL
  AND user_id NOT IN (SELECT id FROM wireline_users);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_agents_user_id') THEN
    ALTER TABLE wireline_agents
      ADD CONSTRAINT fk_agents_user_id
      FOREIGN KEY (user_id) REFERENCES wireline_users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 4. wireline_call_logs
DELETE FROM wireline_call_logs
WHERE user_id IS NOT NULL
  AND user_id NOT IN (SELECT id FROM wireline_users);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_call_logs_user_id') THEN
    ALTER TABLE wireline_call_logs
      ADD CONSTRAINT fk_call_logs_user_id
      FOREIGN KEY (user_id) REFERENCES wireline_users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 5. wireline_email_accounts
DELETE FROM wireline_email_accounts
WHERE user_id IS NOT NULL
  AND user_id NOT IN (SELECT id FROM wireline_users);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_email_accounts_user_id') THEN
    ALTER TABLE wireline_email_accounts
      ADD CONSTRAINT fk_email_accounts_user_id
      FOREIGN KEY (user_id) REFERENCES wireline_users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 6. wireline_phone_numbers
DELETE FROM wireline_phone_numbers
WHERE user_id IS NOT NULL
  AND user_id NOT IN (SELECT id FROM wireline_users);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_phone_numbers_user_id') THEN
    ALTER TABLE wireline_phone_numbers
      ADD CONSTRAINT fk_phone_numbers_user_id
      FOREIGN KEY (user_id) REFERENCES wireline_users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 7. wireline_outbound_campaigns
DELETE FROM wireline_outbound_campaigns
WHERE user_id IS NOT NULL
  AND user_id NOT IN (SELECT id FROM wireline_users);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_outbound_campaigns_user_id') THEN
    ALTER TABLE wireline_outbound_campaigns
      ADD CONSTRAINT fk_outbound_campaigns_user_id
      FOREIGN KEY (user_id) REFERENCES wireline_users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 8. wireline_outbound_leads
DELETE FROM wireline_outbound_leads
WHERE user_id IS NOT NULL
  AND user_id NOT IN (SELECT id FROM wireline_users);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_outbound_leads_user_id') THEN
    ALTER TABLE wireline_outbound_leads
      ADD CONSTRAINT fk_outbound_leads_user_id
      FOREIGN KEY (user_id) REFERENCES wireline_users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 9. wireline_intake_keys
DELETE FROM wireline_intake_keys
WHERE user_id IS NOT NULL
  AND user_id NOT IN (SELECT id FROM wireline_users);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_intake_keys_user_id') THEN
    ALTER TABLE wireline_intake_keys
      ADD CONSTRAINT fk_intake_keys_user_id
      FOREIGN KEY (user_id) REFERENCES wireline_users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 10. wireline_webhooks
DELETE FROM wireline_webhooks
WHERE user_id IS NOT NULL
  AND user_id NOT IN (SELECT id FROM wireline_users);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_webhooks_user_id') THEN
    ALTER TABLE wireline_webhooks
      ADD CONSTRAINT fk_webhooks_user_id
      FOREIGN KEY (user_id) REFERENCES wireline_users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 11. wireline_team_members.user_id
DELETE FROM wireline_team_members
WHERE user_id IS NOT NULL
  AND user_id NOT IN (SELECT id FROM wireline_users);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_team_members_user_id') THEN
    ALTER TABLE wireline_team_members
      ADD CONSTRAINT fk_team_members_user_id
      FOREIGN KEY (user_id) REFERENCES wireline_users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 12. wireline_team_members.tenant_id
DELETE FROM wireline_team_members
WHERE tenant_id IS NOT NULL
  AND tenant_id NOT IN (SELECT id FROM wireline_users);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_team_members_tenant_id') THEN
    ALTER TABLE wireline_team_members
      ADD CONSTRAINT fk_team_members_tenant_id
      FOREIGN KEY (tenant_id) REFERENCES wireline_users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 13. wireline_audit_log
DELETE FROM wireline_audit_log
WHERE user_id IS NOT NULL
  AND user_id NOT IN (SELECT id FROM wireline_users);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_audit_log_user_id') THEN
    ALTER TABLE wireline_audit_log
      ADD CONSTRAINT fk_audit_log_user_id
      FOREIGN KEY (user_id) REFERENCES wireline_users(id)
      ON DELETE SET NULL;
  END IF;
END $$;
