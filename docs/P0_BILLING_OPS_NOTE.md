# P0 Billing Ops Note — 2026-07-10

Status: **Founder Early Access catalog reconciled in live Stripe; code hardening is in review.**

This note is the current launch source for billing operations. Historical billing decisions remain in their original documents for audit context, but the active catalog is defined by:

- `src/lib/plan-catalog.ts` — product-facing entitlements and prices
- `scripts/lib/stripe-founder-catalog.mjs` — canonical Stripe product/price manifest
- `scripts/setup-stripe-catalog.mjs` — idempotent live reconciler
- `scripts/audit-stripe-catalog-live.mjs` — live dependency and parity audit

## Founder catalog lock

| Plan | Monthly | Annual | Billing model |
| --- | ---: | ---: | --- |
| Free Builder | $0 | — | No Stripe product |
| Starter | $9 | $90 | Fixed subscription |
| Starter Plus | $19 | $190 | Fixed subscription |
| Pro | $59 | $590 | Fixed subscription |
| Business | $149 | $1,490 | Fixed subscription |
| Scale & Enterprise | Custom | Custom | Sales-assisted |

Add-ons:

- Extra Agent + 50 Minutes: $15/month
- Live Video: $19/month
- Conversation Balance: prepaid $5, $10, $25, or $50

Voice usage is not postpaid or metered in this launch catalog. Included Runtime Allowance and prepaid Conversation Balance are the supported model.

## Live Stripe reconciliation — verified 2026-07-10

Account: Wireline (`acct_1TXb0SJohDtfy3Ik`).

- 8 active products match the Founder manifest.
- 14 canonical active prices match the expected amounts, intervals, products, and lookup keys.
- 1 additional active $9 price remains attached to an archived duplicate Starter product because Stripe requires an active default price on that archived product. It is not sellable through an active product and is treated as an audit warning, not a parity failure.
- The duplicate Starter product was archived.
- 8 superseded Team/Business/overage/add-on prices were deactivated.
- No active, trialing, past-due, or incomplete subscriptions were found.
- No active Payment Links were found.
- Checkout-session enumeration is unavailable to the connected Stripe key; recheck open sessions in Stripe Dashboard before any future destructive catalog cleanup.

Do not delete Stripe products or prices. Archive products and deactivate prices only after dependency checks.

## Required prelaunch proof

Run from a clean checkout with the live Vercel environment:

```bash
npm run stripe:catalog:check
npm run stripe:verify-vercel-parity
node scripts/run-stripe-audit-from-vercel.mjs
```

Then verify in a non-production test workspace:

1. Free signup creates no Stripe subscription.
2. Starter checkout shows $9/month and returns to the authenticated billing surface.
3. The webhook persists the subscription and entitlement state once when replayed.
4. Customer Portal cancellation appears in `GET /api/billing/status`.
5. A $5 Conversation Balance checkout credits the ledger once when the event is replayed.
6. Included Runtime Allowance is consumed before prepaid Conversation Balance.
7. Extra Agent and Live Video use the canonical recurring prices.

## Environment hygiene

- Keep all canonical `STRIPE_*_PRICE_ID` values identical across Vercel Production, Preview, and Development.
- Keep webhook signing secrets environment-specific.
- Never expose `STRIPE_SECRET_KEY` or webhook secrets to client bundles.
- Redeploy after changing price IDs or webhook configuration.
- Run the live audit before and after any catalog mutation.

## Current deployment evidence

- Production baseline: **READY** `dpl_BbPxQuFVNKEqWBdkupcEqgYkwTHZ` on `main` (`ae6eeb71f8376f46f4ec263ab59bf998011ff8fc`).
- Launch hardening preview: branch `agent/web-launch-funnel-hardening`; require a final READY build and browser proof before merge.

_Refresh this note after every live catalog change or end-to-end billing proof._
