-- New usage periods default to Starter (`standard`). Stored rows keep their tier.
-- Defaults only. This does not rewrite knowledge, personality, or saved tier values.
-- The runtime stale-pricing filter covers Bot plan facts.
SET lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE public.wireline_usage_billing_periods
  ALTER COLUMN tier SET DEFAULT 'standard';
--> statement-breakpoint
ALTER TABLE public.wireline_usage_spend_controls
  ALTER COLUMN tier SET DEFAULT 'standard';
--> statement-breakpoint
RESET lock_timeout;
