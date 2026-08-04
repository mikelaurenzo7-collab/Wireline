-- 0130: keep pre-launch test/demo traffic out of production analytics.
--
-- The owner confirmed that every account created before this migration is
-- internal test or showcase traffic. Existing tenants are therefore classified
-- once as `test`, except the canonical showcase tenant which is `demo`. New
-- settings rows default to `production`, so launch customers enter the real
-- funnel without requiring application changes.
--
-- Durable product events are tagged in Postgres rather than trusting callers or
-- browser metadata. This covers every current and future emitter and prevents a
-- client from downgrading a production account to test traffic.

ALTER TABLE public.wireline_settings
  ADD COLUMN IF NOT EXISTS account_environment text;

UPDATE public.wireline_settings AS settings
SET account_environment = CASE
  WHEN lower(trim(users.email)) = 'wireline.demo@trywireline.com' THEN 'demo'
  ELSE 'test'
END
FROM public.wireline_users AS users
WHERE settings.user_id = users.id
  AND settings.account_environment IS NULL;

-- The user-bootstrap invariant means normal settings rows have a user_id. Keep
-- the migration total for any historical/manual orphan instead of failing the
-- NOT NULL transition.
UPDATE public.wireline_settings
SET account_environment = 'test'
WHERE account_environment IS NULL;

ALTER TABLE public.wireline_settings
  ALTER COLUMN account_environment SET DEFAULT 'production',
  ALTER COLUMN account_environment SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'wireline_settings_account_environment_check'
      AND conrelid = 'public.wireline_settings'::regclass
  ) THEN
    ALTER TABLE public.wireline_settings
      ADD CONSTRAINT wireline_settings_account_environment_check
      CHECK (account_environment IN ('production', 'test', 'demo'));
  END IF;
END $$;

COMMENT ON COLUMN public.wireline_settings.account_environment IS
  'Server-owned traffic classification: production, test, or demo. New accounts default to production.';

CREATE OR REPLACE FUNCTION public.wireline_tag_product_event_environment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  resolved_environment text;
BEGIN
  IF NEW.event_type IS DISTINCT FROM 'product.event' OR NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT settings.account_environment
  INTO resolved_environment
  FROM public.wireline_settings AS settings
  WHERE settings.user_id = NEW.user_id;

  resolved_environment := COALESCE(resolved_environment, 'production');
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object(
    'account_environment', resolved_environment,
    'demo_account', resolved_environment <> 'production'
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.wireline_tag_product_event_environment() FROM PUBLIC;

DROP TRIGGER IF EXISTS wireline_audit_log_tag_product_event_environment
  ON public.wireline_audit_log;

CREATE TRIGGER wireline_audit_log_tag_product_event_environment
BEFORE INSERT OR UPDATE OF user_id, event_type, metadata
ON public.wireline_audit_log
FOR EACH ROW
EXECUTE FUNCTION public.wireline_tag_product_event_environment();

-- Repair the historical funnel in place so operator queries become truthful as
-- soon as the migration lands. The account classification remains the source
-- of truth; any stale or caller-supplied metadata is overwritten.
UPDATE public.wireline_audit_log AS audit
SET metadata = COALESCE(audit.metadata, '{}'::jsonb) || jsonb_build_object(
  'account_environment', settings.account_environment,
  'demo_account', settings.account_environment <> 'production'
)
FROM public.wireline_settings AS settings
WHERE audit.user_id = settings.user_id
  AND audit.event_type = 'product.event';
