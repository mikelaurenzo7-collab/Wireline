-- Migration: operator-editable system prompt override for agents.
--
-- Adds a nullable `system_prompt_override` column to wireline_agents.
-- When set and non-empty, the Vapi assistant factory uses this text as
-- the base identity prompt in place of the auto-composed prompt (or the
-- Wireline persona overlay), then still appends the call-specific
-- dynamic context blocks AND runs the result through the runtime
-- guardrail layer (compliance / escalation / do-not-discuss / voice
-- consistency). NULL → fall back to the auto-composed prompt, so every
-- existing agent keeps its current behaviour.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS.

ALTER TABLE wireline_agents
  ADD COLUMN IF NOT EXISTS system_prompt_override text;
