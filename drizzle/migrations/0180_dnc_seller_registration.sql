-- 0180 — per-seller National Do Not Call Registry subscription.
--
-- The FTC requires every seller placing marketing calls to hold its own
-- registry subscription account number (SAN) for each area code it calls.
-- The owner records the SAN, seller name, covered area codes and expiry here;
-- a platform admin links it to the screening vendor project configured with
-- that SAN. The row already belongs to one tenant and is erased with it.
ALTER TABLE "wireline_settings" ADD COLUMN IF NOT EXISTS "dnc_seller_registration" jsonb;
