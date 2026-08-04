-- Read-only Stripe Runtime Allowance reconciliation.
--
-- Purpose:
--   Surface processed Stripe refund/dispute money-movement events that have no
--   provider-event-linked Runtime Balance ledger movement.
--   This is an operator review queue, not an automatic correction.
--   A row can be legitimate when a charge funded no Wireline Runtime
--   Allowance or resolved to no tenant.
--
-- Scope:
--   - recent processed financial events only (90 days by default)
--   - no writes, locks, or entitlement changes
--   - provider provenance added to new reversal rows by the webhook preflight
--
-- Before correcting a candidate, verify the Stripe charge, invoice,
-- subscription, tenant owner, base-plan share, refund/dispute amount, and any
-- older ledger row keyed by ref_type/ref_id.
-- Never insert an ad hoc debit from this report alone.

WITH financial_events AS (
  SELECT
    event_id,
    event_type,
    processed_at
  FROM wireline_stripe_events
  WHERE status = 'processed'
    AND processed_at >= now() - interval '90 days'
    AND event_type IN (
      'charge.refunded',
      'charge.dispute.funds_withdrawn',
      'charge.dispute.funds_reinstated'
    )
),
linked_movements AS (
  SELECT
    provider_event_id,
    count(*) AS movement_count,
    array_agg(DISTINCT ref_type ORDER BY ref_type) AS ref_types,
    min(created_at) AS first_movement_at,
    max(created_at) AS last_movement_at
  FROM wireline_credit_ledger
  WHERE provider = 'stripe'
    AND provider_event_id IS NOT NULL
    AND ref_type IN (
      'stripe_refund',
      'subscription_runtime_allowance_reversal',
      'stripe_dispute',
      'stripe_dispute_restoration',
      'subscription_runtime_allowance_dispute_restoration'
    )
  GROUP BY provider_event_id
)
SELECT
  event.event_id,
  event.event_type,
  event.processed_at,
  coalesce(movement.movement_count, 0) AS linked_movement_count,
  movement.ref_types,
  movement.first_movement_at,
  movement.last_movement_at,
  'review Stripe charge/invoice/subscription ownership before any correction' AS operator_action
FROM financial_events AS event
LEFT JOIN linked_movements AS movement
  ON movement.provider_event_id = event.event_id
WHERE coalesce(movement.movement_count, 0) = 0
ORDER BY event.processed_at DESC, event.event_id;
