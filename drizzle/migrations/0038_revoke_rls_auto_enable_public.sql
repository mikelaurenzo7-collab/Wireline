-- 0038: Lock down rls_auto_enable() — 0030 revoked anon/authenticated but PUBLIC
-- still had EXECUTE, which Supabase's security advisor flags as callable via RPC.

REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated;
