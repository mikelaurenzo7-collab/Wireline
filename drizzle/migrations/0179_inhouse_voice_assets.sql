-- 0179: tenant-owned encrypted references for private in-house voice previews.
-- Source only until controlled schema promotion; approval does not enable PSTN.
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public."wireline_voice_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL CONSTRAINT "wireline_voice_assets_user_id_wireline_users_id_fk" REFERENCES public.wireline_users(id) ON DELETE CASCADE,
	"name" text NOT NULL,
	"engine_id" text DEFAULT 'chatterbox-nano' NOT NULL,
	"model_revision" text DEFAULT '71ccd1d0081b430592cea481f4307e764e07bc64' NOT NULL,
	"source_revision" text DEFAULT '5de7a54aa4e5e2baadb0182dde554908b48b85c2' NOT NULL,
	"intended_use" text DEFAULT 'private_preview' NOT NULL,
	"secret_encrypted" text,
	"source_sha256" text NOT NULL,
	"source_mime_type" text DEFAULT 'audio/wav' NOT NULL,
	"source_size_bytes" integer NOT NULL,
	"source_sample_rate_hz" integer NOT NULL,
	"source_sample_count" integer NOT NULL,
	"source_duration_seconds" double precision NOT NULL,
	"consent_version" text NOT NULL,
	"consent_accepted_at" timestamp with time zone NOT NULL,
	"consent_accepted_by" uuid NOT NULL,
	"status" text DEFAULT 'pending_review' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"reviewed_source_sha256" text,
	"quality_check_version" text,
	"revoked_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wireline_voice_assets_name_check" CHECK (char_length(btrim("wireline_voice_assets"."name")) BETWEEN 1 AND 80),
	CONSTRAINT "wireline_voice_assets_engine_check" CHECK ("wireline_voice_assets"."engine_id" = 'chatterbox-nano' AND "wireline_voice_assets"."model_revision" = '71ccd1d0081b430592cea481f4307e764e07bc64' AND "wireline_voice_assets"."source_revision" = '5de7a54aa4e5e2baadb0182dde554908b48b85c2'),
	CONSTRAINT "wireline_voice_assets_purpose_check" CHECK ("wireline_voice_assets"."intended_use" = 'private_preview'),
	CONSTRAINT "wireline_voice_assets_status_check" CHECK ("wireline_voice_assets"."status" IN ('pending_review', 'approved', 'revoked', 'deleted') AND "wireline_voice_assets"."version" >= 1),
	CONSTRAINT "wireline_voice_assets_source_check" CHECK ("wireline_voice_assets"."source_sha256" ~ '^[0-9a-f]{64}$' AND "wireline_voice_assets"."source_mime_type" = 'audio/wav' AND "wireline_voice_assets"."source_size_bytes" BETWEEN 44 AND 2000000 AND "wireline_voice_assets"."source_sample_rate_hz" IN (16000, 22050, 24000, 44100, 48000) AND "wireline_voice_assets"."source_sample_count" BETWEEN "wireline_voice_assets"."source_sample_rate_hz" * 6 AND "wireline_voice_assets"."source_sample_rate_hz" * 20 AND "wireline_voice_assets"."source_size_bytes" >= 44 + "wireline_voice_assets"."source_sample_count" * 2 AND "wireline_voice_assets"."source_duration_seconds" BETWEEN 6 AND 20 AND abs("wireline_voice_assets"."source_duration_seconds" - "wireline_voice_assets"."source_sample_count"::double precision / "wireline_voice_assets"."source_sample_rate_hz") < 0.000001),
	CONSTRAINT "wireline_voice_assets_consent_check" CHECK ("wireline_voice_assets"."consent_version" = 'voice-reference-self-speaker-v1-2026-10-17' AND "wireline_voice_assets"."consent_accepted_by" = "wireline_voice_assets"."user_id"),
	CONSTRAINT "wireline_voice_assets_approval_check" CHECK ("wireline_voice_assets"."status" <> 'approved' OR ("wireline_voice_assets"."reviewed_at" IS NOT NULL AND "wireline_voice_assets"."reviewed_by" IS NOT NULL AND "wireline_voice_assets"."reviewed_source_sha256" IS NOT NULL AND "wireline_voice_assets"."quality_check_version" IS NOT NULL AND "wireline_voice_assets"."reviewed_source_sha256" = "wireline_voice_assets"."source_sha256" AND "wireline_voice_assets"."quality_check_version" = 'voice-reference-quality-v1-2026-10-17')),
	CONSTRAINT "wireline_voice_assets_lifecycle_check" CHECK (("wireline_voice_assets"."status" = 'deleted' AND "wireline_voice_assets"."secret_encrypted" IS NULL AND "wireline_voice_assets"."revoked_at" IS NOT NULL AND "wireline_voice_assets"."deleted_at" IS NOT NULL) OR ("wireline_voice_assets"."status" <> 'deleted' AND "wireline_voice_assets"."secret_encrypted" IS NOT NULL AND char_length("wireline_voice_assets"."secret_encrypted") BETWEEN 100 AND 2666731 AND "wireline_voice_assets"."secret_encrypted" ~ '^vref1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{22}[.][A-Za-z0-9_-]+$' AND "wireline_voice_assets"."deleted_at" IS NULL AND (("wireline_voice_assets"."status" = 'revoked' AND "wireline_voice_assets"."revoked_at" IS NOT NULL) OR ("wireline_voice_assets"."status" IN ('pending_review', 'approved') AND "wireline_voice_assets"."revoked_at" IS NULL))))
);
--> statement-breakpoint
ALTER TABLE public."wireline_voice_assets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_voice_assets_user_status_created" ON public."wireline_voice_assets" USING btree ("user_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_voice_assets_active_source" ON public."wireline_voice_assets" USING btree ("user_id","source_sha256") WHERE "wireline_voice_assets"."status" IN ('pending_review', 'approved');
--> statement-breakpoint
REVOKE ALL ON TABLE public.wireline_voice_assets FROM PUBLIC;
REVOKE ALL ON TABLE public.wireline_voice_assets FROM anon, authenticated, service_role;
DROP POLICY IF EXISTS tenant_isolation ON public.wireline_voice_assets;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wireline_server') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.wireline_voice_assets TO wireline_server;
    CREATE POLICY tenant_isolation ON public.wireline_voice_assets
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
      OR NEW.revoked_at IS NOT NULL OR NEW.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'A voice reference must begin in pending review without approval metadata'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF ROW(NEW.id, NEW.user_id, NEW.engine_id, NEW.model_revision, NEW.source_revision,
    NEW.intended_use, NEW.source_sha256, NEW.source_mime_type, NEW.source_size_bytes,
    NEW.source_sample_rate_hz, NEW.source_sample_count, NEW.source_duration_seconds,
    NEW.consent_version, NEW.consent_accepted_at, NEW.consent_accepted_by, NEW.created_at)
    IS DISTINCT FROM
    ROW(OLD.id, OLD.user_id, OLD.engine_id, OLD.model_revision, OLD.source_revision,
    OLD.intended_use, OLD.source_sha256, OLD.source_mime_type, OLD.source_size_bytes,
    OLD.source_sample_rate_hz, OLD.source_sample_count, OLD.source_duration_seconds,
    OLD.consent_version, OLD.consent_accepted_at, OLD.consent_accepted_by, OLD.created_at) THEN
    RAISE EXCEPTION 'Voice ownership, source, model and consent evidence are immutable; create a new reference'
      USING ERRCODE = '23514';
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
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.wireline_guard_voice_asset_state() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wireline_guard_voice_asset_state() FROM anon, authenticated, service_role;
DROP TRIGGER IF EXISTS wireline_voice_asset_state_guard ON public.wireline_voice_assets;
CREATE TRIGGER wireline_voice_asset_state_guard
  BEFORE INSERT OR UPDATE ON public.wireline_voice_assets
  FOR EACH ROW EXECUTE FUNCTION public.wireline_guard_voice_asset_state();

COMMENT ON TABLE public.wireline_voice_assets IS
  'Tenant-owned encrypted PCM reference audio and self-speaker consent for private in-house previews only. Approval never enables live calls. Revocation is terminal; deletion clears ciphertext.';
RESET lock_timeout;
