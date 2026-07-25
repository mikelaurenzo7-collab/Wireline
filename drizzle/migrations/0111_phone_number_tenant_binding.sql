-- 0111 — Phone-line tenant binding integrity.
--
-- Inbound Vapi webhooks resolve the owning tenant with
--   SELECT ... FROM wireline_phone_numbers WHERE vapi_number_id = $1 LIMIT 1
-- (src/lib/vapi-webhook-agent.ts). vapi_number_id carried no uniqueness
-- constraint, so two tenants could hold rows for the same Vapi line and the
-- LIMIT 1 would pick one arbitrarily — routing a call, its transcript, and its
-- usage attribution to whichever row won. A UNIQUE index makes a second claim
-- on an already-bound line impossible at the storage layer, independent of
-- whatever the API allows.
--
-- The same index also serves the equality lookup itself. schema.ts has declared
-- idx_phone_numbers_user_id and idx_phone_numbers_vapi_number_id for a while,
-- but neither was ever applied to the live database, so the per-call tenant
-- resolution was running a sequential scan.
--
-- Idempotent: safe to re-run (see AGENTS.md — migrations may be applied
-- out-of-band and re-run).

CREATE UNIQUE INDEX IF NOT EXISTS idx_phone_numbers_vapi_number_id_unique
  ON wireline_phone_numbers (vapi_number_id)
  WHERE vapi_number_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_phone_numbers_user_id
  ON wireline_phone_numbers USING btree (user_id);
