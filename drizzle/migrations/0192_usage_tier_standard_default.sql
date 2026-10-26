-- New usage periods default to Starter (`standard`). Stored retired rows keep their tier.
-- Saved BotBound plan facts that still quote the retired offer are replaced.
-- Short rows only, and only when the text is a BotBound plan fact, so a
-- customer's own price is left alone. Replay is safe: the default is idempotent
-- and replaced rows no longer match the filter.
SET lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE public.wireline_usage_billing_periods
  ALTER COLUMN tier SET DEFAULT 'standard';
--> statement-breakpoint
ALTER TABLE public.wireline_usage_spend_controls
  ALTER COLUMN tier SET DEFAULT 'standard';
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.wireline_knowledge') IS NOT NULL THEN
    UPDATE public.wireline_knowledge
    SET content = $facts$Lite is $12/month with $4 of included work, 1 phone number, and 1 email address. Starter is $24/month with $14 of included work, 1 phone number, and 1 email address. Plus is $49/month with $36 of included work, 2 phone numbers, and 2 email addresses. SMS is $0.04 per sent segment. Calls are $0.25 per minute, email replies are $0.02, and Computer is $0.20 per minute. Calls, SMS, email, and Computer share one monthly allowance. Extra numbers are $3/month. Extra email addresses are $4/month. Every plan includes unlimited Bots. Usage charges apply across all of them. Quote only these prices. If asked for a discount or a retired offer, give these prices and escalate instead of inventing an offer.$facts$
    WHERE char_length(content) < 2000
      AND (
        content ILIKE '%botbound%'
        OR content ILIKE '%channel package%'
        OR content ILIKE '%runtime balance%'
        OR content ILIKE '%included work%'
        OR content ILIKE '%voice minutes%'
      )
      AND (
        content ILIKE '%$19/month%'
        OR content ILIKE '%$19 per month%'
        OR content ILIKE '%$190/year%'
        OR content ILIKE '%$12 shared%'
        OR content ILIKE '%channel packages include one bot%'
        OR content ILIKE '%prepaid runtime balance%'
        OR content ILIKE '%original plan%'
      );
  END IF;
  IF to_regclass('public.wireline_personality') IS NOT NULL THEN
    UPDATE public.wireline_personality
    SET content = regexp_replace(content, '[$]19/month', '$24/month', 'gi')
    WHERE content ILIKE '%botbound%'
      AND content ILIKE '%$19/month%';
  END IF;
END $$;
--> statement-breakpoint
RESET lock_timeout;
