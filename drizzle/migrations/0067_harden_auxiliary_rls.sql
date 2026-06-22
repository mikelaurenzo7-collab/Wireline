-- 0067: Harden auxiliary telemetry and internal-only stores.
--
-- Wireline uses a custom server-side tenant context:
--   SET LOCAL ROLE authenticated;
--   set_config('app.current_user_id', <uuid>, true);
--
-- These tables were created after the original RLS rollout and therefore had
-- RLS enabled but no policies. Per-user reliability and webhook telemetry need
-- the standard tenant policy. Demo funnel, dated backup, and orphan KV records
-- are server-only/internal and must fail closed to browser roles.

-- Per-user operational telemetry.
ALTER TABLE wireline_call_reliability_staging ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON wireline_call_reliability_staging;
CREATE POLICY tenant_isolation ON wireline_call_reliability_staging
  FOR ALL TO authenticated
  USING (user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid))
  WITH CHECK (user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid));

ALTER TABLE wireline_webhook_health ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON wireline_webhook_health;
CREATE POLICY tenant_isolation ON wireline_webhook_health
  FOR ALL TO authenticated
  USING (user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid))
  WITH CHECK (user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid));

-- Internal-only data. The postgres owner bypasses RLS for server jobs/webhooks;
-- browser-facing Supabase roles receive no table privileges and an explicit
-- deny policy documents the intended fail-closed posture.
ALTER TABLE wireline_demo_call_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON wireline_demo_call_events FROM anon, authenticated;
DROP POLICY IF EXISTS deny_browser_access ON wireline_demo_call_events;
CREATE POLICY deny_browser_access ON wireline_demo_call_events
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

ALTER TABLE wireline_training_backup_20260609 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON wireline_training_backup_20260609 FROM anon, authenticated;
DROP POLICY IF EXISTS deny_browser_access ON wireline_training_backup_20260609;
CREATE POLICY deny_browser_access ON wireline_training_backup_20260609
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

ALTER TABLE kv_store_64639c03 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON kv_store_64639c03 FROM anon, authenticated;
DROP POLICY IF EXISTS deny_browser_access ON kv_store_64639c03;
CREATE POLICY deny_browser_access ON kv_store_64639c03
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);
