# Wireline launch polish audit — 2026-07-27

Status: verified follow-up pass after the floating-surface hierarchy cleanup.

## Changes made

- Restored the shared Dialog and Sheet close controls to Wireline's 44px touch-target floor.
- Reserved title space next to the larger close controls so long modal and sheet titles cannot collide with dismissal affordances.
- Extended the floating-surface contract test to prevent both regressions.
- Aligned the active product showcase document with the customer-facing `Runtime Balance` name.
- Reconciled live Stripe product metadata drift so all active launch products report Founder Early Access catalog v6.

## Verification

- Vercel preview build passed the production bundle and no-database server import smoke.
- Founder Stripe catalog contract reports 8 products, 14 active prices, and 8 plan environment targets.
- Live Stripe account currently has no subscriptions, so no active subscription dependency was changed by the metadata repair.
- Supabase project is healthy; Stripe event backlog and open orphan-carrier-resource counts are zero.
- Vercel runtime error aggregation returned no production runtime error clusters for the previous seven days.
- Custom password breach screening remains enforced in production by the server-side k-anonymity checker even though Supabase Auth's optional leaked-password toggle is not the active password path.

## Intentionally unchanged

- No plan amounts, included capacity, margin assumptions, billing semantics, provider routing, database schema, RLS policy, or runtime side-effect policy changed in this pass.
- Historical/internal `conversation-balance` identifiers remain unchanged where they are implementation identifiers; only active customer-facing product language is standardized to `Runtime Balance`.
- Unused-index advisor findings were not mass-removed because the current evidence does not justify destructive index cleanup.
- Federal DNC remains a deliberate production gate for marketing outbound until the external registration/vendor credential is ready.

## External launch checks still requiring a real-world action

1. Complete one real Starter checkout ($19) through webhook entitlement, portal access, cancellation, and refund verification.
2. Update the Stripe account's public business identity from the legacy Cadence AI account branding to Wireline in Stripe Dashboard.
3. Run the fresh browser screenshot/user-flow matrix when the Opera Browser Connector is connected; do not substitute inferred screenshots.
4. Query the Sentry issue inventory only from an environment with a configured Sentry auth token; do not paste that token into chat.
