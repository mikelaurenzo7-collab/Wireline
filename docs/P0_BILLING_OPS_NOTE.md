# P0 Billing Ops Note — 2026-07-27

Status: **Active** — founder early-access catalog v6 is the live commercial source of truth.

This note is the current launch source for billing operations. Historical billing decisions remain in their original documents for audit context, but the active catalog is defined by:

- `src/lib/plan-catalog.ts` — product-facing entitlements and prices (`FOUNDER_CATALOG_VERSION = founder_early_access_2026_07_v6`)
- `scripts/lib/stripe-founder-catalog.mjs` — canonical Stripe product/price manifest
- `scripts/setup-stripe-catalog.mjs` — idempotent live reconciler
- `scripts/audit-stripe-catalog-live.mjs` — live dependency and parity audit

## Founder catalog lock (v6)

| Plan | Monthly | Annual | Billing model |
| --- | ---: | ---: | --- |
| Free Builder | $0 | — | No Stripe product |
| Starter | $19 | $190 | Fixed subscription |
| Starter Plus | $39 | $390 | Fixed subscription |
| Pro | $79 | $790 | Fixed subscription |
| Business | $159 | $1,590 | Fixed subscription |
| Scale & Enterprise | Custom | Custom | Sales-assisted |

Add-ons:

- Extra Agent + 50 Minutes: $15/month
- Live Video: $19/month
- Runtime Balance (Conversation Balance API/module path retained): prepaid $10, $25, $50, or $100 ($10 minimum; dynamic Stripe checkout amounts from `src/lib/conversation-balance.ts`)

Voice usage is not postpaid or metered in this launch catalog. Included Runtime Allowance and prepaid Runtime Balance are the supported model. Free Builder and pending-activation tenants cannot spend Runtime Balance on live SMS or voice.

## Live Stripe reconciliation

Account: **Cadence AI** (`acct_1TkyXL8e6If87QKm`) — the live Wireline billing account after the
2026-07 Stripe project reconnect. Older notes that cite `acct_1TXb0SJohDtfy3Ik` are historical.

- Active founder products + canonical prices must match `scripts/lib/stripe-founder-catalog.mjs`.
- Vercel Production price-ID env vars must stay in parity with the live catalog.
- Preview must **not** receive production Stripe secrets (see `scripts/check-deployment-boundaries.mjs`).
- Webhook `https://trywireline.com/api/stripe-webhook` enabled_events must match
  `src/routes/billing-routes.ts` (including `charge.refunded` / `charge.dispute.created`).

Do not delete Stripe products or prices. Archive products and deactivate prices only after dependency checks.

## Required prelaunch proof

Run from a clean checkout with the live Vercel environment:

```bash
npm run stripe:catalog:check
npm run stripe:verify-vercel-parity
node scripts/run-stripe-audit-from-vercel.mjs
```

Then verify in a non-production test workspace:

1. Free signup creates no Stripe subscription and cannot send paid SMS or start live voice.
2. Starter checkout shows **$19/month** and returns to the authenticated billing surface.
3. The webhook persists the subscription and entitlement state once when replayed.
4. Customer Portal cancellation appears in `GET /api/billing/status`.
5. A $10 Runtime Balance checkout credits the ledger once when the event is replayed.
6. Included Runtime Allowance is consumed before prepaid Runtime Balance.
7. Extra Agent and Live Video use the canonical recurring prices.
8. Annual CTAs only appear when `/api/billing/plans` reports `annual_configured: true`.

## Environment hygiene

- Keep canonical `STRIPE_*_PRICE_ID` values correct on Production.
- Keep webhook signing secrets environment-specific.
- Never expose `STRIPE_SECRET_KEY` or webhook secrets to client bundles.
- Never copy production Postgres / live Stripe keys into Preview.
- Redeploy after changing price IDs or webhook configuration.
- Run the live audit before and after any catalog mutation.

## Current deployment evidence

- Production baseline: READY on `main` → `https://trywireline.com` (re-verify with `npm run smoke:server` / health after each deploy).
- Residual ops (not code-blockable): federal DNC vendor `loginId`, one live $19 checkout proof, GitHub Actions spending restore, rotate any Vercel token pasted into chat.

_Refresh this note after every live catalog change or end-to-end billing proof._
