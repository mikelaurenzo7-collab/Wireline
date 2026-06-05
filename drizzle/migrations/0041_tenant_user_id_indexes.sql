-- Tier 3: btree indexes on user_id for tenant-scoped lookups (RLS + list queries).
CREATE INDEX IF NOT EXISTS idx_personality_user_id ON wireline_personality USING btree (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_calendar_accounts_user_id ON wireline_calendar_accounts USING btree (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_intake_keys_user_id ON wireline_intake_keys USING btree (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_webhooks_user_id ON wireline_webhooks USING btree (user_id);
