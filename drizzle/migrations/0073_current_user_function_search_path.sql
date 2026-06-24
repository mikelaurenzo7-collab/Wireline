-- 0073: Pin search_path on the RLS helper to satisfy Supabase function linting.

CREATE OR REPLACE FUNCTION public.wireline_current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $function$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid
$function$;
