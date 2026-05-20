-- Migration: per-tier "extra agents" billing column.
--
-- Lets operators purchase agents beyond their plan's included
-- max_agents as a recurring subscription line-item add-on. The
-- per-agent price is set per tier in plan-catalog.ts; the
-- /api/billing/extra-agents endpoint mutates this column AND adjusts
-- the Stripe subscription item quantity to match.

ALTER TABLE wireline_settings
  ADD COLUMN IF NOT EXISTS extra_agents INTEGER NOT NULL DEFAULT 0;
