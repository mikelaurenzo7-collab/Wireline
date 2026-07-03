-- The tenant_isolation policy (user_id = wireline_current_user_id()) applies
-- to writes as well as reads, which silenced the audit log entirely: system
-- security events (failed logins, cron auth rejections) carry a NULL user_id
-- and can never satisfy the check, and the audit writer executes as
-- wireline_server. The audit trail is server-written by design — anon and
-- authenticated hold no grants on it — so give the server role an
-- unconditional INSERT path while reads stay tenant-scoped. Policies are
-- OR'd, so tenant_isolation continues to govern SELECT/UPDATE/DELETE.
DROP POLICY IF EXISTS server_audit_insert ON public.wireline_audit_log;
CREATE POLICY server_audit_insert ON public.wireline_audit_log
  FOR INSERT TO wireline_server
  WITH CHECK (true);
