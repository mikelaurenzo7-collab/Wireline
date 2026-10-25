-- Preserve the selected offer on each billing period; historical periods keep the original $19 offer.
SET lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE public.wireline_usage_billing_periods ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'starter';
--> statement-breakpoint
ALTER TABLE public.wireline_usage_spend_controls ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'starter';
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wireline_usage_billing_periods_tier_check' AND conrelid = 'public.wireline_usage_billing_periods'::regclass) THEN
    ALTER TABLE public.wireline_usage_billing_periods ADD CONSTRAINT wireline_usage_billing_periods_tier_check CHECK (tier IN ('starter', 'lite', 'standard', 'plus'));
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wireline_usage_spend_controls_tier_check' AND conrelid = 'public.wireline_usage_spend_controls'::regclass) THEN
    ALTER TABLE public.wireline_usage_spend_controls ADD CONSTRAINT wireline_usage_spend_controls_tier_check CHECK (tier IN ('starter', 'lite', 'standard', 'plus'));
  END IF;
END $$;
--> statement-breakpoint
RESET lock_timeout;
