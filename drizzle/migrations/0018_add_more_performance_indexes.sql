-- 1. Directives Table Indexes
CREATE INDEX IF NOT EXISTS idx_directives_agent_user_priority 
  ON wireline_directives USING btree (agent_id, user_id, priority DESC);

CREATE INDEX IF NOT EXISTS idx_directives_user_id 
  ON wireline_directives USING btree (user_id);

-- 2. Knowledge Table Indexes
CREATE INDEX IF NOT EXISTS idx_knowledge_agent_user 
  ON wireline_knowledge USING btree (agent_id, user_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_user_created 
  ON wireline_knowledge USING btree (user_id, created_at DESC);

-- 3. Email Accounts Table Index
CREATE INDEX IF NOT EXISTS idx_email_accounts_user 
  ON wireline_email_accounts USING btree (user_id);

-- 4. Calendar Events Table Index
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_start 
  ON wireline_calendar_events USING btree (user_id, start_time DESC);

-- 5. Consent Log Table Index
CREATE INDEX IF NOT EXISTS idx_consent_log_user_created 
  ON wireline_consent_log USING btree (user_id, created_at DESC);

-- 6. Jobs Table Indexes
CREATE INDEX IF NOT EXISTS idx_jobs_status_run_at 
  ON wireline_jobs USING btree (status, run_at);

CREATE INDEX IF NOT EXISTS idx_jobs_user_status 
  ON wireline_jobs USING btree (user_id, status);

-- 7. Team Members Table Indexes
CREATE INDEX IF NOT EXISTS idx_team_members_tenant 
  ON wireline_team_members USING btree (tenant_id);

-- 8. Quota Limits Table Index
CREATE INDEX IF NOT EXISTS idx_quota_limits_user 
  ON wireline_quota_limits USING btree (user_id);

-- 9. Spend Alerts Table Index
CREATE INDEX IF NOT EXISTS idx_spend_alerts_user 
  ON wireline_spend_alerts USING btree (user_id);

-- 10. Deletion Queue Table Index
CREATE INDEX IF NOT EXISTS idx_deletion_queue_user 
  ON wireline_deletion_queue USING btree (user_id);
