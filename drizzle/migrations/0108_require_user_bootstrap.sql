-- 0108: A committed Wireline user must have entitlement settings and a
-- persisted provider-spend guard.
--
-- Password and OAuth signup already create both rows inside the user-creation
-- transaction. Historical helpers swallowed individual bootstrap failures,
-- however, allowing a partially initialized user to commit. Backfill any legacy
-- settings gap conservatively, then enforce the invariant at transaction end.

INSERT INTO public.wireline_settings (
  id,
  user_id,
  subscription_status,
  trial_ends_at,
  trial_outbound_count,
  updated_at
)
SELECT
  users.id::text,
  users.id,
  CASE lower(COALESCE(subscription.status, ''))
    WHEN 'active' THEN 'active'
    WHEN 'trialing' THEN 'trialing'
    WHEN 'trial_expired' THEN 'trial_expired'
    WHEN 'past_due' THEN 'past_due'
    WHEN 'canceled' THEN 'canceled'
    ELSE 'pending_activation'
  END,
  NULL,
  0,
  now()
FROM public.wireline_users AS users
LEFT JOIN public.wireline_subscriptions AS subscription
  ON subscription.user_id = users.id
LEFT JOIN public.wireline_settings AS settings
  ON settings.user_id = users.id
WHERE settings.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.wireline_assert_user_bootstrap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.wireline_settings
    WHERE user_id = NEW.id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Wireline user bootstrap is missing entitlement settings.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.wireline_spend_budgets
    WHERE user_id = NEW.id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Wireline user bootstrap is missing a spend guard.';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.wireline_assert_user_bootstrap() FROM PUBLIC;

DROP TRIGGER IF EXISTS wireline_users_require_bootstrap
  ON public.wireline_users;

CREATE CONSTRAINT TRIGGER wireline_users_require_bootstrap
AFTER INSERT ON public.wireline_users
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.wireline_assert_user_bootstrap();
