-- Idempotent live apply of 0021 email suppressions (was missing on shared Supabase).
-- Global CAN-SPAM / RFC 8058 opt-out list — not tenant-scoped.

CREATE TABLE IF NOT EXISTS public.wireline_email_suppressions (
  email       text PRIMARY KEY,
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_suppressions_created
  ON public.wireline_email_suppressions USING btree (created_at DESC);

ALTER TABLE public.wireline_email_suppressions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  EXECUTE 'CREATE POLICY deny_direct_api_access ON public.wireline_email_suppressions FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  EXECUTE 'CREATE POLICY wireline_server_access ON public.wireline_email_suppressions FOR ALL TO wireline_server USING (true) WITH CHECK (true)';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wireline_email_suppressions TO wireline_server;
