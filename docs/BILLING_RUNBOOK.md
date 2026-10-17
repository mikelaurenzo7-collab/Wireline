# Billing Runbook

Status: **Active canonical runbook**. This is the operator proof path for Stripe checkout, server-owned entitlements, Runtime Balance, webhook idempotency, cancellation, usage reconciliation, and retired-SKU compatibility.

## Source of truth

- **Catalog:** `src/lib/plan-catalog.ts` owns canonical plan ids, public checkout eligibility, capacity limits, included phone numbers, included voice minutes, Runtime Allowance, and overflow rates.
- **Stripe product manifest:** `scripts/lib/stripe-founder-catalog.mjs` owns active managed Stripe product/price metadata. Retired Live Video SKUs are intentionally excluded.
- **Runtime Balance:** `src/lib/conversation-balance.ts` owns customer-facing top-up limits and preset amounts (module path retained; customer term is Runtime Balance).
- **Stripe integration:** `src/lib/stripe-helpers.ts` owns Stripe client configuration and subscription-to-entitlement sync.
- **HTTP routes:** `src/routes/launch-billing-checkout-routes.ts` owns `POST /api/billing/checkout`. `src/routes/billing-portal-readiness-routes.ts` owns `POST /api/billing/portal`. `src/routes/billing-routes.ts` owns the remaining `/api/billing/*` surface and `/api/stripe-webhook`; the legacy Live Video checkout path returns 410. `src/routes/conversation-balance-routes.ts` owns `/api/conversation-balance/*`.
- **Wallet ledger:** `src/lib/credit-wallet.ts` is the append-only USD ledger for top-ups, burns, refunds, disputes, and grants.
- **Voice usage:** `src/lib/voice-usage.ts` consumes included voice capacity first and Runtime Balance only for explicit funded overflow.
- **Live Video:** talking-head is retired. Leftover Stripe add-on price IDs remain so webhooks do not brick billing. Checkout and session mint stay closed.

## Commercial contract

- Free Builder creates, trains, and privately simulates one draft.
- Paid tiers include voice minutes, number capacity, and recurring Runtime Allowance as defined in `src/lib/plan-catalog.ts`.
- Runtime Balance is prepaid overflow. BotBound does not silently create a postpaid voice overage invoice.
- Extra-agent add-ons include additional capacity and minutes as defined by the catalog.
- **Live Video talking-head is retired.** Leftover Stripe add-on price IDs remain so webhooks do not brick billing. Checkout and session mint stay closed. Video files and clip-script substitutes are not generated.
- Ops lock: [P0_BILLING_OPS_NOTE.md](./P0_BILLING_OPS_NOTE.md).

## Required environment

Minimum self-serve billing variables:

- `APP_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- recurring price ids for public plans in `src/lib/plan-catalog.ts`

Live talking-head checkout is retired. Do not set LiveAvatar/HeyGen keys to re-enable it. Keep `STRIPE_LIVE_VIDEO_ADDON_PRICE_ID` only so leftover subscriptions reconcile.

Do not run catalog writes against production casually. Run the static contract and complete read-only live audit first:

```bash
npm run stripe:catalog:check
npm run stripe:audit-live
```

Run the live audit in the Render production shell with `STRIPE_SECRET_KEY` already injected by its secret store. The command performs the existing account-identity, product-copy, and catalog checks without provider writes. It fails before any audit if the key is absent or is not a live secret/restricted key; it does not fetch credentials from another host. Keep production secrets out of local development. The explicit `npm run stripe:audit-legacy-vercel` command retains the old Vercel credential flow only for an authorized legacy-host investigation.

## Proof checklist

### 1. New user can reach base-plan checkout

1. Sign up a new account.
2. Open `/settings/billing`.
3. Confirm public plans load from `GET /api/billing/plans`.
4. Click a configured paid plan.
5. Confirm `POST /api/billing/checkout` returns a Stripe Checkout URL.
6. Confirm Free Builder has no recurring checkout; live provider work requires a paid plan.

Expected failure modes must remain explicit JSON: `FREE_PLAN_NO_CHECKOUT`, `SERVICE_UNAVAILABLE`, `LEGACY_PLAN_RETIRED`, and `ALREADY_SUBSCRIBED`. Scale/custom sales intents are not plan aliases and never resolve to ordinary checkout.

### 2. Successful checkout updates server-owned entitlement state

1. Complete subscription checkout in Stripe test mode.
2. Deliver `checkout.session.completed` and subsequent `customer.subscription.*` webhook events.
3. Confirm `wireline_subscriptions` has customer id, subscription id, canonical plan id, Stripe status, current period end, and cancellation state.
4. Confirm `wireline_settings.subscription_status` and `max_agents` mirror server-owned entitlement state.
5. Confirm `GET /api/billing/status` reports the same plan/capacity/customer state.

The client must never compute paid entitlements from a returned Checkout success URL. Entitlements change only after Stripe webhook synchronization.

### 3. Webhook events are idempotent and complete

Webhook processing must claim `wireline_stripe_events.event_id` before side effects. Duplicate event ids must not re-credit wallets, re-run entitlement sync, or duplicate usage mutations.

The production endpoint's `enabled_events` must exactly match the handled event set derived from source:

- `npm run stripe:webhook:check` — read-only drift report.
- `npm run stripe:webhook:align` — aligns enabled events; endpoint URL/signing secret remain untouched.

If a claimed event fails after side effects begin, the handler releases the claim for Stripe retry. Wallet mutations remain separately idempotent through their stable reference/idempotency keys.

### 4. Stripe-hosted identity and product copy remain canonical

Run `npm run stripe:audit-live` in the authorized production environment and require:

1. **Account identity:** customer-facing public name/domain/descriptors are BotBound-aligned. The canonical website is `https://botbound.app`; a historical dashboard label is not the customer-facing identity gate.
2. **Product copy:** active canonical products match `scripts/lib/stripe-founder-catalog.mjs`, including catalog metadata.
3. **Catalog topology:** active products/prices, amounts, intervals, product ownership, subscriptions, payment links, and open Checkout sessions use canonical objects.

Do not change legal-entity, representative, bank, tax, address, or verification data merely to fix public branding.

### 5. Cancellation or downgrade is reflected in the app

1. Use Stripe Customer Portal to cancel at period end or switch tiers.
2. Deliver the appropriate `customer.subscription.updated` / `deleted` event.
3. Confirm billing status reports cancellation and current-period state accurately.
4. Confirm capacity gates read server settings/subscriptions, not stale client state.
5. Confirm a historical Live Video record never grants access or mints a session; legacy cancellation and reconciliation remain safe and support-visible.

### 6. Runtime Balance top-up works

1. Activate a paid plan, choose a Runtime Balance preset, and create one-time Checkout.
2. Confirm Checkout/PaymentIntent metadata carries the BotBound account owner and credit amount.
3. Complete payment and deliver the webhook.
4. Confirm exactly one `top_up` ledger row and an updated balance.
5. Redeliver the event and confirm no duplicate credit.

Standalone top-up refunds and disputes resolve the wallet owner and credit limit
from the original posted Checkout ledger receipt, then verify its PaymentIntent,
charge, customer, USD currency and live/test mode through the configured Stripe
account. Mutable PaymentIntent metadata cannot select a different wallet or
increase the credited principal. Missing or conflicting receipts require
reconciliation before retry; do not mark the webhook complete or invent a grant.

Refund reconciliation reads the complete charge refund inventory before changing
the wallet. Signed terminal refund events and charge refund aggregates must be
visible with matching identity and settlement evidence before their webhook claim
completes; stale API lists retry instead of acknowledging a no-op. A failed or
canceled refund restores only its exact previously posted
debit after Stripe supplies returned-funds evidence. A return observed before the
success callback leaves an idempotent zero-dollar receipt so a stale success
snapshot cannot debit later. Restoration never resets usage or subscription
allowances. Tax-inclusive partial refunds round the wallet share down per refund;
split refunds can leave a customer-favor cent, but cannot debit more than the
original wallet credit. Validate duplicate, reordered, failed and returned events
in a dedicated Stripe test account before the first public paid pilot.

Before entering a top-up owner's tenant, reconciliation also checks prior matching
refund/dispute references across the ledger. Conflicting historical ownership or
provenance requires operator review; a retry must not debit a second wallet or
silently rewrite the original movement.

### 7. Insufficient balance blocks new paid work with a recovery path

Paid plans consume included voice minutes first. Once included capacity is depleted, insufficient Runtime Balance blocks the next new paid action with actionable `402`; an active call is allowed to finish and any completion debt is recorded. There is no hidden postpaid overage.

### 8. Voice usage reconciles against account state

For each completed voice call, `trackVoiceMinutes` must:

1. round duration up to whole minutes;
2. upsert the monthly voice usage counter;
3. resolve paid-plan + extra-agent included capacity;
4. consume included capacity first;
5. finalize only incremental overflow against Runtime Balance;
6. record bounded completion debt when a completed call exceeds funded coverage;
7. never emit a Stripe meter event or create an automatic overage invoice; and
8. use the provider call id as the stable idempotency key.

### Customer usage visibility

Settings > Billing shows included voice usage and Runtime Balance. Its collapsed
Recent activity section shows up to 20 balance changes, with signed amounts,
customer-facing reasons, timestamps, and the balance after each entry. Failed
refreshes retain the last confirmed values and offer retry; missing activity is
not reported as an empty history.

Activity > Revenue > AI Spend shows recorded model and tool costs for the chosen
window, plus the current monthly allowance or safety limit. These audit costs
are separate from the Runtime Balance ledger and are not a complete customer
invoice. Full-window totals are aggregated in PostgreSQL rather than sampled
from the most recent events. Calls > Analytics reports elapsed duration; billed
voice minutes round each completed provider attempt up, so the two measures can
differ. Monthly included usage resets separately from subscription renewal.

### 9. Live Video remains retired

Talking-head checkout and session mint stay closed. Identity badges remain. Imagine photos and video files are not generated.

1. Confirm `POST /api/billing/live-video-checkout` returns catalog-unavailable / closed.
2. Confirm `POST /api/agents/:id/video-presenter/session` returns 410.
3. Confirm leftover Stripe Live Video price IDs still reconcile webhooks without authorizing a provider session.
4. Confirm `/studio/live-video` redirects to Studio and exposes no setup or talking-head stage.

## Verification commands

After billing or Live Video changes:

```bash
npm run test:run -- src/lib/plan-catalog.test.ts src/lib/conversation-balance.test.ts src/lib/video-presenter/live-video-policy.test.ts tests/live-video-economics-contract.test.ts tests/video-presenter-contract.test.ts tests/voice-wallet-guard.test.ts tests/voice-pricing-display.test.ts tests/billing-proof-contract.test.ts tests/vendor-readiness-contract.test.ts
npm run stripe:catalog:check
npm run lint:eslint
```

Before a billing release:

```bash
npm run stripe:audit-live
```

Before a release candidate:

```bash
npm run verify:full
```

## Incident notes

- Stripe Dashboard deletes or test/live mismatches can make stored customer ids stale. The billing status/portal surfaces must expose a recoverable customer-missing state rather than pretending the portal exists.
- Do not manually edit entitlement state unless Stripe is unavailable and the account owner has approved emergency intervention. Record and later reconcile any manual correction.
- Refunds and disputes for Runtime Balance top-ups must reach the wallet ledger through the handled webhook events.
- Leftover Live Video Stripe SKUs must still reconcile webhooks without minting a talking-head session. Checkout stays closed.
