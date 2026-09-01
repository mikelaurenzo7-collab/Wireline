-- 0170 — bind each SMS thread to the exact Twilio destination line.
--
-- The former (tenant, customer) key merged conversations when one customer
-- texted two Bots owned by the same workspace. Exact destination identity is
-- now part of the thread key and the outbound sender boundary. The original
-- To/From number was never stored, so every historical row remains nullable
-- and read-only rather than guessing from a current phone assignment.

SET lock_timeout = '5s';

ALTER TABLE public.wireline_sms_threads
  ADD COLUMN IF NOT EXISTS destination_number text;

DROP INDEX IF EXISTS public.idx_sms_threads_user_customer;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_threads_user_destination_customer
  ON public.wireline_sms_threads (user_id, destination_number, customer_number)
  WHERE destination_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_threads_legacy_user_customer
  ON public.wireline_sms_threads (user_id, customer_number)
  WHERE destination_number IS NULL;

COMMENT ON COLUMN public.wireline_sms_threads.destination_number IS
  'Exact tenant-owned Twilio destination/sender for this conversation; null legacy rows cannot send until resolved.';

RESET lock_timeout;
