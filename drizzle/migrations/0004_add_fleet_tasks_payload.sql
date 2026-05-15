-- Migration: add `payload` JSONB column to wireline_fleet_tasks. The AI
-- Action Engine in `src/lib/action-engine.ts` writes proposed action
-- bodies (draft email, contract envelope, prospect search args, etc.)
-- into a `payload` field on every fleet-task insert. The column was
-- never declared on the Drizzle schema and never existed in Postgres,
-- so Drizzle silently dropped the field on every insert.
--
-- Symptom in the UI: the "Intelligence Hub" / ActionFeed panel showed
-- empty rows ("to: —" / "No content drafted.") for every draft action,
-- regardless of what the agent extracted from the call.

ALTER TABLE wireline_fleet_tasks
  ADD COLUMN IF NOT EXISTS payload JSONB;

-- For legacy rows where the action engine repurposed `customer_info`
-- as a payload store (the approve handler used to read from there),
-- backfill the new column so the operator review queue isn't empty.
UPDATE wireline_fleet_tasks
   SET payload = customer_info
 WHERE payload IS NULL
   AND customer_info IS NOT NULL
   AND customer_info::text <> 'null';
