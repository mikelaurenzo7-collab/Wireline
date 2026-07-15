-- Service-owned trigger functions must not be directly executable by client roles.
-- The trigger on wireline_agents continues to invoke this function internally.

REVOKE ALL ON FUNCTION public.wireline_normalize_managed_voice() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.wireline_normalize_managed_voice() FROM anon, authenticated;

COMMENT ON FUNCTION public.wireline_normalize_managed_voice() IS
  'Internal trigger function that enforces the managed Vapi voice runtime. Direct execution is intentionally revoked from client roles.';
