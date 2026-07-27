-- The role-specific wireline_server_access policy added in 0114 is permissive.
-- Because wireline_server inherits from PUBLIC, the older permissive false policy
-- is redundant and causes Supabase's multiple-permissive-policy advisor warning.
-- anon and authenticated have no grants on this table, and RLS remains enabled
-- with default-deny behavior for every role without an explicit allow policy.

DROP POLICY IF EXISTS deny_direct_api_access ON public.wireline_recap_artifacts;
