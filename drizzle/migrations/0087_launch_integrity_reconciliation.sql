-- 0087: Reconcile launch-critical invariants that were previously applied
-- through mixed migration paths. Every statement is safe to re-run so a
-- manual production repair and the canonical Drizzle migration can converge.

-- Twilio retries must never create duplicate inbox messages.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_messages_user_twilio_sid
  ON public.wireline_sms_messages (user_id, twilio_sid)
  WHERE twilio_sid IS NOT NULL;

-- Align retry scheduling with the live lead status enum.
DROP INDEX IF EXISTS public.idx_leads_status_next_attempt;
CREATE INDEX IF NOT EXISTS idx_leads_status_next_attempt
  ON public.wireline_outbound_leads USING btree (status, callback_scheduled_at)
  WHERE status IN ('Pending', 'Retrying');

-- The historical training snapshot contains customer-owned records that must
-- be included in account exports. Keep browser roles denied, grant the server
-- read-only access, and scope every server read to the request tenant.
DO $$
BEGIN
  IF to_regclass('public.wireline_training_backup_20260609') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES
      ON TABLE public.wireline_training_backup_20260609
      FROM PUBLIC, anon, authenticated;

    GRANT SELECT
      ON TABLE public.wireline_training_backup_20260609
      TO wireline_server;

    DROP POLICY IF EXISTS deny_browser_access
      ON public.wireline_training_backup_20260609;
    CREATE POLICY deny_browser_access
      ON public.wireline_training_backup_20260609
      FOR ALL
      TO authenticated
      USING (false)
      WITH CHECK (false);

    DROP POLICY IF EXISTS tenant_export_select
      ON public.wireline_training_backup_20260609;
    CREATE POLICY tenant_export_select
      ON public.wireline_training_backup_20260609
      FOR SELECT
      TO wireline_server
      USING (user_id = (SELECT public.wireline_current_user_id()));
  END IF;
END
$$;

-- PostgreSQL grants EXECUTE to PUBLIC on new functions by default. These
-- helpers are implementation details, not public RPCs.
REVOKE EXECUTE ON FUNCTION public.notify_presence_change()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.wireline_current_user_id()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.wireline_purge_old_data(uuid, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.wireline_set_updated_at()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.notify_presence_change()
  TO wireline_server, service_role;
GRANT EXECUTE ON FUNCTION public.wireline_current_user_id()
  TO wireline_server, service_role;
GRANT EXECUTE ON FUNCTION public.wireline_purge_old_data(uuid, integer)
  TO wireline_server, service_role;
GRANT EXECUTE ON FUNCTION public.wireline_set_updated_at()
  TO wireline_server, service_role;
