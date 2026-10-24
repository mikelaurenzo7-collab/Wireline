-- Live cloned voices: a consented customer reference is uploaded once to the
-- clone engine chosen by eligibility (xai or elevenlabs); only the provider voice id and consent evidence are
-- kept. No raw reference audio is stored for this lane. Tenant access is RLS
-- scoped to the owner; account deletion erases rows (see account-deletion.ts).
CREATE TABLE IF NOT EXISTS public."wireline_live_voices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"provider" text DEFAULT 'xai' NOT NULL,
	"provider_voice_id" text,
	"status" text DEFAULT 'ready' NOT NULL,
	"consent_version" text NOT NULL,
	"consent_scope" text NOT NULL,
	"consent_accepted_at" timestamp with time zone NOT NULL,
	"consent_accepted_by" uuid NOT NULL,
	"source_sha256" text NOT NULL,
	"source_duration_seconds" double precision NOT NULL,
	"quality_score" integer,
	"voice_gender" text,
	"last_used_at" timestamp with time zone,
	"speaker_jurisdiction" text NOT NULL,
	"biometric_release_version" text,
	"biometric_release_signed_name" text,
	"biometric_release_accepted_at" timestamp with time zone,
	"retention_policy_version" text,
	"expires_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"deleted_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wireline_live_voices_name_check" CHECK (char_length(btrim("wireline_live_voices"."name")) BETWEEN 1 AND 80),
	CONSTRAINT "wireline_live_voices_provider_check" CHECK ("wireline_live_voices"."provider" IN ('xai', 'elevenlabs')),
	CONSTRAINT "wireline_live_voices_voice_id_check" CHECK ("wireline_live_voices"."provider_voice_id" IS NULL OR "wireline_live_voices"."provider_voice_id" ~ '^[A-Za-z0-9_-]{4,128}$'),
	CONSTRAINT "wireline_live_voices_status_check" CHECK (("wireline_live_voices"."status" = 'ready' AND "wireline_live_voices"."provider_voice_id" IS NOT NULL AND "wireline_live_voices"."deleted_at" IS NULL AND "wireline_live_voices"."deleted_reason" IS NULL) OR ("wireline_live_voices"."status" = 'deleted' AND "wireline_live_voices"."deleted_at" IS NOT NULL AND "wireline_live_voices"."deleted_reason" IN ('user_deleted', 'provider_missing', 'retention_expired'))),
	CONSTRAINT "wireline_live_voices_consent_check" CHECK ("wireline_live_voices"."consent_version" = 'live-voice-clone-consent-v1-2026-10-24' AND "wireline_live_voices"."consent_scope" IN ('self', 'authorized_speaker') AND "wireline_live_voices"."consent_accepted_by" = "wireline_live_voices"."user_id"),
	CONSTRAINT "wireline_live_voices_source_check" CHECK ("wireline_live_voices"."source_sha256" ~ '^[0-9a-f]{64}$' AND "wireline_live_voices"."source_duration_seconds" BETWEEN 10 AND 120),
	CONSTRAINT "wireline_live_voices_quality_check" CHECK ("wireline_live_voices"."quality_score" IS NULL OR "wireline_live_voices"."quality_score" BETWEEN 0 AND 100),
	CONSTRAINT "wireline_live_voices_jurisdiction_check" CHECK ("wireline_live_voices"."speaker_jurisdiction" = 'INTL' OR "wireline_live_voices"."speaker_jurisdiction" ~ '^US-[A-Z]{2}$'),
	CONSTRAINT "wireline_live_voices_biometric_release_check" CHECK ("wireline_live_voices"."speaker_jurisdiction" <> 'US-IL' OR ("wireline_live_voices"."biometric_release_version" = 'biometric-release-v1-2026-10-24' AND char_length("wireline_live_voices"."biometric_release_signed_name") BETWEEN 3 AND 120 AND "wireline_live_voices"."biometric_release_accepted_at" IS NOT NULL AND "wireline_live_voices"."retention_policy_version" = 'biometric-retention-v1-2026-10-24' AND "wireline_live_voices"."expires_at" IS NOT NULL)),
	CONSTRAINT "wireline_live_voices_retention_check" CHECK (("wireline_live_voices"."retention_policy_version" IS NULL AND "wireline_live_voices"."expires_at" IS NULL) OR ("wireline_live_voices"."retention_policy_version" = 'biometric-retention-v1-2026-10-24' AND "wireline_live_voices"."expires_at" IS NOT NULL AND "wireline_live_voices"."expires_at" > "wireline_live_voices"."created_at")),
	CONSTRAINT "wireline_live_voices_gender_check" CHECK ("wireline_live_voices"."voice_gender" IS NULL OR "wireline_live_voices"."voice_gender" IN ('female', 'male'))
);
--> statement-breakpoint
ALTER TABLE public."wireline_live_voices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE public."wireline_live_voices" ADD CONSTRAINT "wireline_live_voices_user_id_wireline_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."wireline_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_live_voices_user_status_created" ON public."wireline_live_voices" USING btree ("user_id","status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_live_voices_expiry_due" ON public."wireline_live_voices" USING btree ("expires_at") WHERE "wireline_live_voices"."status" = 'ready' AND "wireline_live_voices"."expires_at" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_live_voices_provider_voice" ON public."wireline_live_voices" USING btree ("provider","provider_voice_id") WHERE "wireline_live_voices"."provider_voice_id" IS NOT NULL;
--> statement-breakpoint
REVOKE ALL ON TABLE public.wireline_live_voices FROM PUBLIC;
REVOKE ALL ON TABLE public.wireline_live_voices FROM anon, authenticated, service_role;
DROP POLICY IF EXISTS tenant_isolation ON public.wireline_live_voices;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wireline_server') THEN
    GRANT SELECT, INSERT, UPDATE ON public.wireline_live_voices TO wireline_server;
    CREATE POLICY tenant_isolation ON public.wireline_live_voices
      FOR ALL TO wireline_server
      USING (user_id = (SELECT public.wireline_current_user_id()))
      WITH CHECK (user_id = (SELECT public.wireline_current_user_id()));
  END IF;
END
$$;
