# Billing Runbook

Status: **Active canonical runbook**. This is the operator proof path for Stripe checkout, server-owned entitlements, Runtime Balance, webhook idempotency, cancellation, and usage reconciliation.

## Source of truth

- **Catalog:** `src/lib/plan-catalog.ts` owns canonical plan ids, public checkout eligibility, capacity limits, included phone numbers, included voice minutes, Runtime Allowance, and overflow rates.
- **Runtime Balance:** `src/lib/conversation-balance.ts` owns customer-facing top-up limits and preset amounts (module path retained; customer term is Runtime Balance).
- **Stripe integration:** `src/lib/stripe-helpers.ts` owns Stripe client configuration and subscription-to-entitlement sync.
- **HTTP routes:** `src/routes/launch-billing-checkout-routes.ts` is the sole owner of `POST /api/billing/checkout` (founder catalog). `src/routes/billing-portal-readiness-routes.ts` is the sole owner of `POST /api/billing/portal` (managed portal configuration). `src/routes/billing-routes.ts` owns the remaining `/api/billing/*` surface, `/api/stripe-webhook`, and live-video add-on checkout. `src/routes/conversation-balance-routes.ts` owns `/api/conversation-balance/*`.
- **Wallet ledger:** `src/lib/credit-wallet.ts` is the append-only USD ledger for top-ups, burns, refunds, disputes, and grants.
- **Usage reconciliation:** `src/lib/voice-usage.ts` records monthly voice usage, consumes included capacity first, and burns Runtime Balance only for explicit funded overflow.
- **Historical welcome-credit helper:** `src/lib/subscription-welcome-credit.ts` remains for prior ledger compatibility; new subscriptions receive the recurring Runtime Allowance defined by the catalog.
- **SMS billing:** `src/lib/sms-billing.ts` + `src/lib/twilio-service.ts` debit $0.02/segment from Runtime Balance after live-work entitlement (`assertLiveWorkEntitlementForUser`).

## Commercial contract (Jul 2026)

- Free Builder creates, trains, and privately simulates one draft.
- Every paid tier includes voice minutes, number capacity, and a recurring
  Runtime Allowance as defined in `src/lib/plan-catalog.ts`.
- Runtime Balance is prepaid overflow. Wireline does not silently create
  a postpaid overage invoice.
- Extra-agent add-ons include additional capacity and minutes as defined by the
  catalog.
- Ops lock: [P0_BILLING_OPS_NOTE.md](./P0_BILLING_OPS_NOTE.md).

## Required environment

Minimum self-serve billing variables:

- `APP_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- recurring price ids for public plans in `src/lib/plan-catalog.ts`

Optional compatibility/add-on variables:

- historical meter/overage IDs only while reconciling old subscriptions; they
  are not the Founder launch billing path
- `STRIPE_LIVE_VIDEO_ADDON_PRICE_ID` only if the live video add-on is sold

Do not run catalog writes against production casually. Use the read-only catalog audit first.

```bash
npm run stripe:catalog:check
node scripts/audit-stripe-catalog-live.mjs
```

## Proof checklist

### 1. New user can reach checkout

1. Sign up a new account.
2. Open `/settings/billing`.
3. Confirm the plan picker loads public plans from `GET /api/billing/plans`.
4. Click a configured public plan.
5. Confirm `POST /api/billing/checkout` returns a Stripe Checkout URL.
6. Confirm Free Builder has no recurring checkout; live work requires choosing a paid plan.

Expected failure modes must be explicit JSON: `FREE_PLAN_NO_CHECKOUT` for Free Builder, `SERVICE_UNAVAILABLE` for a missing paid-plan price, `LEGACY_PLAN_RETIRED` for retired catalog entries, and `ALREADY_SUBSCRIBED` for an existing live subscription. Scale/custom sales intents are not plan aliases and never resolve to checkout.

### 2. Successful checkout updates server-owned entitlement state

1. Complete subscription checkout in Stripe test mode.
2. Deliver `checkout.session.completed` and the following `customer.subscription.*` webhook events.
3. Confirm `wireline_subscriptions` has the Stripe customer id, subscription id, canonical plan id, Stripe status, current period end, and cancellation flag.
4. Confirm `wireline_settings.subscription_status` and `wireline_settings.max_agents` mirror the server-owned entitlement state.
5. Confirm `GET /api/billing/status` reports the plan, status, capacity, customer state, and cancellation flag.

The client must never compute paid entitlements from returned Checkout success URLs. Entitlements change only after Stripe webhook sync.

### 3. Webhook events are idempotent

Webhook processing must claim `wireline_stripe_events.event_id` before side effects. Duplicate event ids return `{ received: true, duplicate: true }` and do not re-credit wallets, re-run entitlement sync, or re-dispatch usage mutations.

### 3a. Webhook endpoint subscribes to every handled event

The production endpoint's `enabled_events` must exactly match the `case` arms of the webhook switch in `src/routes/billing-routes.ts` — a handled event missing from the endpoint is silently dropped by Stripe (subscription updates never sync), and an enabled-but-unhandled event is delivery noise.

- `npm run stripe:webhook:check` — read-only drift report (exits 1 on drift).
- `npm run stripe:webhook:align` — sets `enabled_events` to exactly the handled set; endpoint URL and signing secret are untouched.

If a claimed event fails after side effects begin, the handler deletes the idempotency claim so Stripe can retry. Wallet mutations remain additionally idempotent through `(user, ref_type, ref_id)` / idempotency-key ledger semantics.

### 4. Cancellation or downgrade is reflected in the app

1. Use Stripe Customer Portal to cancel at period end or switch tiers.
2. Deliver `customer.subscription.updated` or `customer.subscription.deleted`.
3. Confirm `GET /api/billing/status` shows `cancel_at_period_end`, `current_period_end`, plan id, and Stripe status.
4. Confirm `StripeBillingCard` shows active, trialing, past-due, canceled, and cancellation-at-period-end states from server data.
5. Confirm capacity gates read server settings/subscriptions, not stale client state.

### 5. Runtime Balance top-up works

1. Activate a paid plan, then open `/settings/billing` and choose a Runtime Balance preset.
2. Confirm `POST /api/conversation-balance/checkout` creates a one-time Stripe Checkout session with `purpose=credit_topup`, `wireline_user_id`, and `credit_usd` metadata on both the Checkout Session and PaymentIntent.
3. Complete payment.
4. Deliver `checkout.session.completed`.
5. Confirm `wireline_credit_ledger` receives one `top_up` row and repeated webhook delivery does not add another.
6. Confirm `GET /api/conversation-balance` returns the updated balance and recent ledger.

### 6. Insufficient balance blocks live paid work with a recovery path

Before a new paid provider action, verify plan entitlement and funded coverage.
Paid plans consume included voice minutes first. Once included capacity is
depleted, insufficient Runtime Balance blocks the next paid action with an
actionable `402`; an active call is allowed to finish and records any amount due.

### 7. Usage events reconcile against account state

For each completed voice call, `trackVoiceMinutes` must:

1. Round duration up to whole minutes.
2. Upsert the monthly `voice_minutes_monthly` usage counter.
3. Resolve the paid plan and extra-agent included-minute capacity.
4. Consume the included pool first.
5. Finalize only incremental overflow against Runtime Balance.
6. If a completed call exceeded funded coverage, record completion grace and
   block the next paid action until the balance is restored.
7. Never emit a Stripe meter event or create an automatic overage invoice.
8. Use the Vapi call id as the stable idempotency key for wallet mutations.

## Verification commands

Run these after touching billing logic:

```bash
npm run test:run -- src/lib/plan-catalog.test.ts src/lib/conversation-balance.test.ts tests/voice-wallet-guard.test.ts tests/voice-pricing-display.test.ts tests/billing-proof-contract.test.ts
npm run stripe:catalog:check
npm run lint:eslint
```

Run full verification before a release candidate:

```bash
npm run verify:full
```

## Incident notes

- Stripe Dashboard deletes or test/live mode mismatches make stored customer ids stale. `GET /api/billing/status` reports `customer_state`; `POST /api/billing/portal` returns `STRIPE_CUSTOMER_MISSING` so the user can re-run checkout.
- Do not manually edit entitlement state unless Stripe is unavailable and the account owner has approved an emergency intervention. Record any manual correction in audit logs and reconcile with Stripe afterward.
- Refunds and disputes for credit top-ups must deliver `charge.refunded` / `charge.dispute.created` so the wallet ledger receives the reversal.
