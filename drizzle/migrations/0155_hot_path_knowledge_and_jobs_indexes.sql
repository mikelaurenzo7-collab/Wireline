-- 0155: install schema-declared hot-path indexes that never reached live Postgres.
--
-- `0018_add_more_performance_indexes.sql` authored these names, but that file
-- sits in the unjournalled historical backlog, so `drizzle-kit migrate` never
-- ran it. Live `pg_stat_statements` on the shared production database showed:
--   SELECT from wireline_knowledge WHERE user_id ORDER BY created_at DESC
--     (~9.7k calls; only idx_knowledge_agent_id existed)
--   SELECT from wireline_knowledge WHERE agent_id AND user_id
--     (~2.3k calls; no composite (agent_id, user_id) index)
--   DELETE from wireline_jobs WHERE user_id AND status AND created_at
--     (~39ms mean, thousands of rows removed per retention sweep)
--
-- created_at is included on idx_jobs_user_status so the retention delete can
-- range-scan without a separate index; (user_id, status) remains a valid
-- left-prefix. Do not drop advisor-flagged unused indexes in this change.
--
-- The two trigger functions below were created after the default-privileges
-- lockdown and still inherited PUBLIC EXECUTE. They are invoker trigger
-- helpers, not SECURITY DEFINER. Revoking PUBLIC does not stop the owning
-- table trigger from firing.

CREATE INDEX IF NOT EXISTS idx_knowledge_agent_user
  ON public.wireline_knowledge USING btree (agent_id, user_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_user_created
  ON public.wireline_knowledge USING btree (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_jobs_user_status
  ON public.wireline_jobs USING btree (user_id, status, created_at);

ANALYZE public.wireline_knowledge;
ANALYZE public.wireline_jobs;

REVOKE ALL ON FUNCTION public.wireline_reclaim_abandoned_stripe_event_claim() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.wireline_reclaim_abandoned_stripe_event_claim()
  FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.wireline_set_subscription_entitlement_source() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.wireline_set_subscription_entitlement_source()
  FROM anon, authenticated;
