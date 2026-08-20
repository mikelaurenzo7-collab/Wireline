-- Production reconciliation on 2026-08-19 found zero active/trialing rows
-- violating the staged provenance guard introduced by migration 0147. Promote
-- that NOT VALID guard to a fully proven invariant without rewriting the table.
ALTER TABLE "wireline_subscriptions"
  VALIDATE CONSTRAINT "wireline_subscriptions_active_provenance_check";
