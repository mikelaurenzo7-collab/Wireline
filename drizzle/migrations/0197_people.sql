-- 0197 — People: the tenant-owned customer record.
-- One person, any number of normalized identifiers (E.164 phone or lowercased
-- email, unique per tenant) and an event history. The timeline is a read-time
-- union over the existing channel tables, so channel receipts are untouched.
-- Merging is a reversible pointer; nothing is copied or moved. Composite keys
-- keep identifiers, events and merge pointers inside one tenant.
-- Tenant access is RLS scoped to the owner. Events have no UPDATE grant.
-- Account deletion erases all three tables (see src/lib/account-deletion.ts).
-- The 365-day purge uses an explicit table list, so People stays exempt.
-- Apply via the Supabase migration process right before merge.
SET lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."wireline_people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"display_name" text,
	"company" text,
	"status" text DEFAULT 'active' NOT NULL,
	"summary" text,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"merged_into_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wireline_people_id_user_key" UNIQUE("id","user_id"),
	CONSTRAINT "wireline_people_status_check" CHECK ("wireline_people"."status" IN ('active', 'archived')),
	CONSTRAINT "wireline_people_display_name_check" CHECK ("wireline_people"."display_name" IS NULL OR char_length("wireline_people"."display_name") BETWEEN 1 AND 120),
	CONSTRAINT "wireline_people_company_check" CHECK ("wireline_people"."company" IS NULL OR char_length("wireline_people"."company") BETWEEN 1 AND 120),
	CONSTRAINT "wireline_people_summary_check" CHECK ("wireline_people"."summary" IS NULL OR char_length("wireline_people"."summary") <= 2000),
	CONSTRAINT "wireline_people_custom_fields_check" CHECK (jsonb_typeof("wireline_people"."custom_fields") = 'object'),
	CONSTRAINT "wireline_people_merge_self_check" CHECK ("wireline_people"."merged_into_id" IS NULL OR "wireline_people"."merged_into_id" <> "wireline_people"."id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."wireline_person_identifiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"value" text NOT NULL,
	"source" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wireline_person_identifiers_kind_check" CHECK ("wireline_person_identifiers"."kind" IN ('phone', 'email')),
	CONSTRAINT "wireline_person_identifiers_source_check" CHECK ("wireline_person_identifiers"."source" IN ('owner', 'call', 'sms', 'email', 'appointment', 'bot')),
	CONSTRAINT "wireline_person_identifiers_value_check" CHECK (("wireline_person_identifiers"."kind" = 'phone' AND "wireline_person_identifiers"."value" ~ '^\+[1-9][0-9]{6,14}$') OR ("wireline_person_identifiers"."kind" = 'email' AND "wireline_person_identifiers"."value" = lower("wireline_person_identifiers"."value") AND char_length("wireline_person_identifiers"."value") <= 254 AND "wireline_person_identifiers"."value" ~ '^[^@[:space:]]+@[^@[:space:]]+$'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."wireline_person_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"actor" text NOT NULL,
	"agent_id" text,
	"body" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wireline_person_events_kind_check" CHECK ("wireline_person_events"."kind" IN ('created', 'note', 'interaction', 'field_change', 'identifier_added', 'identifier_removed', 'merged', 'unmerged')),
	CONSTRAINT "wireline_person_events_actor_check" CHECK ("wireline_person_events"."actor" IN ('owner', 'bot', 'system')),
	CONSTRAINT "wireline_person_events_body_check" CHECK ("wireline_person_events"."body" IS NULL OR char_length("wireline_person_events"."body") <= 4000),
	CONSTRAINT "wireline_person_events_data_check" CHECK (jsonb_typeof("wireline_person_events"."data") = 'object')
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE public."wireline_people" ADD CONSTRAINT "wireline_people_user_id_wireline_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."wireline_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE public."wireline_people" ADD CONSTRAINT "wireline_people_merged_into_fk" FOREIGN KEY ("merged_into_id","user_id") REFERENCES "public"."wireline_people"("id","user_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE public."wireline_person_identifiers" ADD CONSTRAINT "wireline_person_identifiers_user_id_wireline_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."wireline_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE public."wireline_person_identifiers" ADD CONSTRAINT "wireline_person_identifiers_person_fk" FOREIGN KEY ("person_id","user_id") REFERENCES "public"."wireline_people"("id","user_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE public."wireline_person_events" ADD CONSTRAINT "wireline_person_events_user_id_wireline_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."wireline_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE public."wireline_person_events" ADD CONSTRAINT "wireline_person_events_person_fk" FOREIGN KEY ("person_id","user_id") REFERENCES "public"."wireline_people"("id","user_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_people_user_updated" ON public."wireline_people" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_people_merged_into" ON public."wireline_people" USING btree ("merged_into_id") WHERE "wireline_people"."merged_into_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_person_identifiers_user_kind_value" ON public."wireline_person_identifiers" USING btree ("user_id","kind","value");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_person_identifiers_person" ON public."wireline_person_identifiers" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_person_events_person_created" ON public."wireline_person_events" USING btree ("person_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_person_events_user_created" ON public."wireline_person_events" USING btree ("user_id","created_at");
--> statement-breakpoint
ALTER TABLE public.wireline_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wireline_person_identifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wireline_person_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.wireline_people FROM PUBLIC;
REVOKE ALL ON TABLE public.wireline_person_identifiers FROM PUBLIC;
REVOKE ALL ON TABLE public.wireline_person_events FROM PUBLIC;
REVOKE ALL ON TABLE public.wireline_people FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE public.wireline_person_identifiers FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE public.wireline_person_events FROM anon, authenticated, service_role;
DROP POLICY IF EXISTS tenant_isolation ON public.wireline_people;
DROP POLICY IF EXISTS tenant_isolation ON public.wireline_person_identifiers;
DROP POLICY IF EXISTS tenant_isolation ON public.wireline_person_events;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wireline_server') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.wireline_people TO wireline_server;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.wireline_person_identifiers TO wireline_server;
    -- Events are history: they may be added or removed with their person, never edited.
    GRANT SELECT, INSERT, DELETE ON public.wireline_person_events TO wireline_server;
    CREATE POLICY tenant_isolation ON public.wireline_people
      FOR ALL TO wireline_server
      USING (user_id = (SELECT public.wireline_current_user_id()))
      WITH CHECK (user_id = (SELECT public.wireline_current_user_id()));
    CREATE POLICY tenant_isolation ON public.wireline_person_identifiers
      FOR ALL TO wireline_server
      USING (user_id = (SELECT public.wireline_current_user_id()))
      WITH CHECK (user_id = (SELECT public.wireline_current_user_id()));
    CREATE POLICY tenant_isolation ON public.wireline_person_events
      FOR ALL TO wireline_server
      USING (user_id = (SELECT public.wireline_current_user_id()))
      WITH CHECK (user_id = (SELECT public.wireline_current_user_id()));
  END IF;
END
$$;
--> statement-breakpoint
COMMENT ON TABLE public.wireline_people IS
  'People: one tenant-owned record per customer. merged_into_id is a reversible merge pointer. Exempt from the 365-day purge; erased by account deletion.';
COMMENT ON TABLE public.wireline_person_identifiers IS
  'Normalized phone (E.164) and email identifiers, unique per tenant. A value already on another person is an explicit conflict, never an automatic merge.';
COMMENT ON TABLE public.wireline_person_events IS
  'Person history: notes, interactions, field changes, identifier changes and merges, with the actor. No UPDATE grant.';
--> statement-breakpoint
-- Schema reconciliation found while generating this snapshot: the source
-- schema (src/db/live-voice-schema.ts) and the clone engine registry allow the
-- 'inhouse' engine, but no migration widened the check, so production still
-- accepts only 'xai' and 'elevenlabs' and an in-house clone insert would fail
-- after the clone was made. Widening a check rejects no existing row.
ALTER TABLE public."wireline_live_voices" DROP CONSTRAINT IF EXISTS "wireline_live_voices_provider_check";--> statement-breakpoint
ALTER TABLE public."wireline_live_voices" ADD CONSTRAINT "wireline_live_voices_provider_check" CHECK ("wireline_live_voices"."provider" IN ('xai', 'elevenlabs', 'inhouse'));
--> statement-breakpoint
RESET lock_timeout;
