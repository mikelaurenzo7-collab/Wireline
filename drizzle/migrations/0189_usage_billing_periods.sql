-- 0189: preserve admitted periods and freeze requests before external billing.
SET lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wireline_usage_billing_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL CONSTRAINT "wireline_usage_billing_periods_user_id_wireline_users_id_fk" REFERENCES public.wireline_users(id) ON DELETE CASCADE,
	"period_key" text NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"stripe_subscription_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"monthly_cap_usd" numeric(10, 2) NOT NULL,
	"number_addons" integer NOT NULL,
	"email_address_addons" integer NOT NULL,
	"blocked_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wireline_usage_billing_periods_period_check" CHECK (ends_at > starts_at),
	CONSTRAINT "wireline_usage_billing_periods_cap_check" CHECK (monthly_cap_usd > 0 AND monthly_cap_usd <= 25000),
	CONSTRAINT "wireline_usage_billing_periods_addons_check" CHECK (number_addons BETWEEN 0 AND 500 AND email_address_addons BETWEEN 0 AND 500)
);
--> statement-breakpoint
ALTER TABLE "wireline_usage_meter_events" DROP CONSTRAINT IF EXISTS "wireline_usage_meter_events_status_check";--> statement-breakpoint
ALTER TABLE "wireline_usage_meter_events" ADD COLUMN IF NOT EXISTS "report_attempt" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_usage_billing_periods_user_period" ON "wireline_usage_billing_periods" USING btree ("user_id","period_key");--> statement-breakpoint
ALTER TABLE "wireline_usage_meter_events" ADD CONSTRAINT "wireline_usage_meter_events_status_check" CHECK (status IN ('admitted', 'pending', 'reported', 'skipped', 'reconciliation_required'));
--> statement-breakpoint
ALTER TABLE public.wireline_usage_billing_periods ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.wireline_usage_billing_periods FROM PUBLIC, anon, authenticated, service_role;
DROP POLICY IF EXISTS tenant_isolation ON public.wireline_usage_billing_periods;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wireline_server') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.wireline_usage_billing_periods TO wireline_server;
    CREATE POLICY tenant_isolation ON public.wireline_usage_billing_periods
      FOR ALL TO wireline_server
      USING (user_id = (SELECT public.wireline_current_user_id()))
      WITH CHECK (user_id = (SELECT public.wireline_current_user_id()));
  END IF;
END
$$;
RESET lock_timeout;
