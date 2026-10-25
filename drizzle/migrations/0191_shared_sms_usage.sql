-- SMS uses the existing weighted work meter and the same period/cap ledger.
-- Additive to existing rows; replay restores this exact constraint.
SET lock_timeout = '5s';
ALTER TABLE public.wireline_usage_meter_events
  DROP CONSTRAINT IF EXISTS wireline_usage_meter_events_meter_check;
--> statement-breakpoint
ALTER TABLE public.wireline_usage_meter_events
  ADD CONSTRAINT wireline_usage_meter_events_meter_check
  CHECK (meter IN ('call_minutes', 'emails_handled', 'computer_minutes', 'sms_segments'));
--> statement-breakpoint
RESET lock_timeout;
