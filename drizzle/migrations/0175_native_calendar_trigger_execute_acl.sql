-- Supabase's default privileges granted service_role direct EXECUTE when 0174
-- created this trigger function. PUBLIC was already revoked by that migration.
-- Keep the applied function and its invoker semantics unchanged; PostgreSQL
-- invokes an installed trigger without granting callers direct function access.
REVOKE EXECUTE ON FUNCTION public.guard_native_calendar_appointment() FROM service_role;
