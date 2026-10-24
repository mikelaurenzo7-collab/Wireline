-- 0185: gated customer preview lane for private in-house voice references.
--
-- This is an additive extension of migration 0179. It adds a bounded-retention,
-- canary-gated customer surface and an append-only ledger of lane state changes.
-- It never assigns a voice to a live call, never stores plaintext audio, and
-- does not change the platform-admin pilot's access rules.
--
-- Customer rows are only ever eligible for `private_preview` (0179's purpose
-- check), carry `customer_visible = true`, and always have a retention policy
-- version plus an expiry. The expiry sweep clears ciphertext in place, so an
-- expired reference is terminally deleted exactly like an owner deletion.
SET lock_timeout = '5s';

ALTER TABLE public."wireline_voice_assets"
	ADD COLUMN IF NOT EXISTS "retention_policy_version" text,
	ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone,
	ADD COLUMN IF NOT EXISTS "last_preview_at" timestamp with time zone,
	ADD COLUMN IF NOT EXISTS "deleted_reason" text,
	ADD COLUMN IF NOT EXISTS "customer_visible" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE public."wireline_voice_assets"
	ADD CONSTRAINT "wireline_voice_assets_retention_check" CHECK (("retention_policy_version" IS NULL AND "expires_at" IS NULL) OR ("retention_policy_version" = 'voice-clone-retention-v1-2026-10-24' AND "expires_at" IS NOT NULL AND "expires_at" > "created_at")),
	ADD CONSTRAINT "wireline_voice_assets_deleted_reason_check" CHECK ("deleted_reason" IS NULL OR ("deleted_reason" IN ('user_deleted', 'retention_expired') AND "status" = 'deleted')),
	ADD CONSTRAINT "wireline_voice_assets_customer_visible_check" CHECK ("customer_visible" = false OR ("retention_policy_version" IS NOT NULL AND "expires_at" IS NOT NULL)),
	ADD CONSTRAINT "wireline_voice_assets_last_preview_check" CHECK ("last_preview_at" IS NULL OR "last_preview_at" >= "created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."wireline_voice_clone_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL CONSTRAINT "wireline_voice_clone_events_user_id_wireline_users_id_fk" REFERENCES public.wireline_users(id) ON DELETE CASCADE,
	"asset_id" uuid,
	"kind" text NOT NULL,
	"source_sha256" text NOT NULL,
	"reserved_usd_micros" bigint,
	"committed_usd_micros" bigint,
	"engine_id" text DEFAULT 'chatterbox-nano' NOT NULL,
	"model_revision" text DEFAULT '71ccd1d0081b430592cea481f4307e764e07bc64' NOT NULL,
	"source_revision" text DEFAULT '5de7a54aa4e5e2baadb0182dde554908b48b85c2' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wireline_voice_clone_events_kind_check" CHECK ("wireline_voice_clone_events"."kind" IN ('created', 'reviewed', 'preview', 'deleted', 'expired')),
	CONSTRAINT "wireline_voice_clone_events_source_check" CHECK ("wireline_voice_clone_events"."source_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "wireline_voice_clone_events_amounts_check" CHECK (("wireline_voice_clone_events"."reserved_usd_micros" IS NULL OR "wireline_voice_clone_events"."reserved_usd_micros" >= 0) AND ("wireline_voice_clone_events"."committed_usd_micros" IS NULL OR "wireline_voice_clone_events"."committed_usd_micros" >= 0) AND ("wireline_voice_clone_events"."kind" = 'preview' OR ("wireline_voice_clone_events"."reserved_usd_micros" IS NULL AND "wireline_voice_clone_events"."committed_usd_micros" IS NULL)) AND ("wireline_voice_clone_events"."kind" <> 'preview' OR ("wireline_voice_clone_events"."reserved_usd_micros" IS NOT NULL AND "wireline_voice_clone_events"."committed_usd_micros" IS NOT NULL AND "wireline_voice_clone_events"."committed_usd_micros" <= "wireline_voice_clone_events"."reserved_usd_micros"))),
	CONSTRAINT "wireline_voice_clone_events_engine_check" CHECK ("wireline_voice_clone_events"."engine_id" = 'chatterbox-nano' AND "wireline_voice_clone_events"."model_revision" = '71ccd1d0081b430592cea481f4307e764e07bc64' AND "wireline_voice_clone_events"."source_revision" = '5de7a54aa4e5e2baadb0182dde554908b48b85c2')
);
--> statement-breakpoint
ALTER TABLE public."wireline_voice_clone_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_voice_clone_events_user_created" ON public."wireline_voice_clone_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_voice_assets_expiry_due" ON public."wireline_voice_assets" USING btree ("expires_at") WHERE "wireline_voice_assets"."deleted_at" IS NULL;
--> statement-breakpoint
REVOKE ALL ON TABLE public.wireline_voice_clone_events FROM PUBLIC;
REVOKE ALL ON TABLE public.wireline_voice_clone_events FROM anon, authenticated, service_role;
DROP POLICY IF EXISTS tenant_isolation ON public.wireline_voice_clone_events;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wireline_server') THEN
    -- Append-only from tenant access: no UPDATE/DELETE privilege is granted.
    GRANT SELECT, INSERT ON public.wireline_voice_clone_events TO wireline_server;
    CREATE POLICY tenant_isolation ON public.wireline_voice_clone_events
      FOR ALL TO wireline_server
      USING (user_id = (SELECT public.wireline_current_user_id()))
      WITH CHECK (user_id = (SELECT public.wireline_current_user_id()));
  END IF;
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.wireline_guard_voice_asset_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending_review' OR NEW.version <> 1
      OR NEW.reviewed_at IS NOT NULL OR NEW.reviewed_by IS NOT NULL
      OR NEW.reviewed_source_sha256 IS NOT NULL OR NEW.quality_check_version IS NOT NULL
      OR NEW.revoked_at IS NOT NULL OR NEW.deleted_at IS NOT NULL
      OR NEW.last_preview_at IS NOT NULL OR NEW.deleted_reason IS NOT NULL THEN
      RAISE EXCEPTION 'A voice reference must begin in pending review without approval metadata'
        USING ERRCODE = '23514';
    END IF;
    IF (NEW.retention_policy_version IS NULL) <> (NEW.expires_at IS NULL) THEN
      RAISE EXCEPTION 'Voice retention evidence requires both a policy version and an expiry'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.customer_visible
      AND (NEW.retention_policy_version IS NULL OR NEW.expires_at IS NULL) THEN
      RAISE EXCEPTION 'A customer-visible voice reference requires bounded private-preview retention'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF ROW(NEW.id, NEW.user_id, NEW.engine_id, NEW.model_revision, NEW.source_revision,
    NEW.intended_use, NEW.source_sha256, NEW.source_mime_type, NEW.source_size_bytes,
    NEW.source_sample_rate_hz, NEW.source_sample_count, NEW.source_duration_seconds,
    NEW.consent_version, NEW.consent_accepted_at, NEW.consent_accepted_by, NEW.created_at,
    NEW.retention_policy_version, NEW.expires_at, NEW.customer_visible)
    IS DISTINCT FROM
    ROW(OLD.id, OLD.user_id, OLD.engine_id, OLD.model_revision, OLD.source_revision,
    OLD.intended_use, OLD.source_sha256, OLD.source_mime_type, OLD.source_size_bytes,
    OLD.source_sample_rate_hz, OLD.source_sample_count, OLD.source_duration_seconds,
    OLD.consent_version, OLD.consent_accepted_at, OLD.consent_accepted_by, OLD.created_at,
    OLD.retention_policy_version, OLD.expires_at, OLD.customer_visible) THEN
    RAISE EXCEPTION 'Voice ownership, source, model, consent and retention evidence are immutable; create a new reference'
      USING ERRCODE = '23514';
  END IF;

  -- Preview evidence may only stamp last_preview_at; it can never change
  -- lifecycle state or advance the expected version.
  IF NEW.last_preview_at IS DISTINCT FROM OLD.last_preview_at THEN
    IF NEW.version IS DISTINCT FROM OLD.version
      OR OLD.status <> 'approved' OR OLD.deleted_at IS NOT NULL
      OR NEW.last_preview_at IS NULL OR NEW.last_preview_at < OLD.created_at
      OR ROW(NEW.status, NEW.secret_encrypted, NEW.reviewed_at, NEW.reviewed_by,
        NEW.reviewed_source_sha256, NEW.quality_check_version, NEW.revoked_at,
        NEW.deleted_at, NEW.deleted_reason)
        IS DISTINCT FROM
        ROW(OLD.status, OLD.secret_encrypted, OLD.reviewed_at, OLD.reviewed_by,
        OLD.reviewed_source_sha256, OLD.quality_check_version, OLD.revoked_at,
        OLD.deleted_at, OLD.deleted_reason) THEN
      RAISE EXCEPTION 'A voice reference preview observation may only record last_preview_at'
        USING ERRCODE = '23514';
    END IF;
    NEW.updated_at := clock_timestamp();
    RETURN NEW;
  END IF;

  IF OLD.status = 'deleted'
    OR (OLD.status = 'revoked' AND NEW.status NOT IN ('revoked', 'deleted'))
    OR (OLD.status = 'approved' AND NEW.status = 'pending_review') THEN
    RAISE EXCEPTION 'A revoked or deleted voice reference cannot be reactivated'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.version IS DISTINCT FROM OLD.version + 1 THEN
    RAISE EXCEPTION 'Voice reference updates must advance the expected version exactly once'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.secret_encrypted IS DISTINCT FROM OLD.secret_encrypted
    AND NOT (NEW.status = 'deleted' AND NEW.secret_encrypted IS NULL) THEN
    RAISE EXCEPTION 'A voice reference payload can only be cleared during deletion'
      USING ERRCODE = '23514';
  END IF;
  IF ROW(NEW.reviewed_at, NEW.reviewed_by, NEW.reviewed_source_sha256, NEW.quality_check_version)
    IS DISTINCT FROM
    ROW(OLD.reviewed_at, OLD.reviewed_by, OLD.reviewed_source_sha256, OLD.quality_check_version)
    AND NOT (OLD.status = 'pending_review' AND NEW.status = 'approved') THEN
    RAISE EXCEPTION 'Voice review evidence can only be recorded during initial approval'
      USING ERRCODE = '23514';
  END IF;
  IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
    RAISE EXCEPTION 'Voice revocation evidence is immutable'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.deleted_reason IS DISTINCT FROM OLD.deleted_reason
    AND NOT (NEW.status = 'deleted' AND OLD.status <> 'deleted'
      AND NEW.deleted_reason IN ('user_deleted', 'retention_expired')) THEN
    RAISE EXCEPTION 'A voice reference deletion reason can only be recorded during terminal deletion'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'deleted' AND OLD.status <> 'deleted' AND NEW.deleted_reason IS NULL THEN
    RAISE EXCEPTION 'A terminal voice reference deletion requires a deletion reason'
      USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.wireline_guard_voice_asset_state() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wireline_guard_voice_asset_state() FROM anon, authenticated, service_role;
DROP TRIGGER IF EXISTS wireline_voice_asset_state_guard ON public."wireline_voice_assets";
CREATE TRIGGER wireline_voice_asset_state_guard
  BEFORE INSERT OR UPDATE ON public."wireline_voice_assets"
  FOR EACH ROW EXECUTE FUNCTION public.wireline_guard_voice_asset_state();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.wireline_guard_voice_clone_event_ledger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Voice clone preview ledger rows are immutable'
      USING ERRCODE = '23514';
  END IF;
  -- Tenant access is append-only. Only the terminal account purge, which runs
  -- outside tenant context, may erase ledger rows with the rest of the account.
  IF current_user = 'wireline_server'
    OR NULLIF(current_setting('app.current_user_id', true), '') IS NOT NULL THEN
    RAISE EXCEPTION 'Voice clone preview ledger rows can only be erased by terminal account deletion'
      USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END
$$;

REVOKE ALL ON FUNCTION public.wireline_guard_voice_clone_event_ledger() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wireline_guard_voice_clone_event_ledger() FROM anon, authenticated, service_role;
DROP TRIGGER IF EXISTS wireline_voice_clone_event_ledger_guard ON public."wireline_voice_clone_events";
CREATE TRIGGER wireline_voice_clone_event_ledger_guard
  BEFORE UPDATE OR DELETE ON public."wireline_voice_clone_events"
  FOR EACH ROW EXECUTE FUNCTION public.wireline_guard_voice_clone_event_ledger();

COMMENT ON TABLE public.wireline_voice_clone_events IS
  'Append-only customer preview lane ledger: created, reviewed, preview (with reserved/committed USD micros), deleted and expired evidence. Tenant access is SELECT/INSERT only; terminal account deletion erases it.';
COMMENT ON COLUMN public.wireline_voice_assets.customer_visible IS
  'True only for canary-gated customer preview references. Approval never enables a live call or any voice selection outside private_preview.';
COMMENT ON COLUMN public.wireline_voice_assets.expires_at IS
  'Customer lane retention deadline. The jobs sweep clears ciphertext and terminally deletes the row after this time.';
COMMENT ON COLUMN public.wireline_voice_assets.deleted_reason IS
  'Terminal deletion cause: user_deleted or retention_expired.';
RESET lock_timeout;
