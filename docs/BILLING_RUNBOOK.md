# Billing Runbook

Status: **Active canonical runbook**. This is the operator proof path for Stripe checkout, server-owned entitlements, Runtime Balance, webhook idempotency, cancellation, Live Video, and usage reconciliation.

## Source of truth

- **Catalog:** `src/lib/plan-catalog.ts` owns canonical plan ids, public checkout eligibility, capacity limits, included phone numbers, included voice minutes, Runtime Allowance, and overflow rates.
- **Stripe product manifest:** `scripts/lib/stripe-founder-catalog.mjs` owns managed Stripe product/price metadata, including the Live Video add-on.
- **Runtime Balance:** `src/lib/conversation-balance.ts` owns customer-facing top-up limits and preset amounts (module path retained; customer term is Runtime Balance).
- **Stripe integration:** `src/lib/stripe-helpers.ts` owns Stripe client configuration and subscription-to-entitlement sync.
- **HTTP routes:** `src/routes/launch-billing-checkout-routes.ts` owns `POST /api/billing/checkout`. `src/routes/billing-portal-readiness-routes.ts` owns `POST /api/billing/portal`. `src/routes/billing-routes.ts` owns the remaining `/api/billing/*` surface, `/api/stripe-webhook`, and Live Video add-on checkout. `src/routes/conversation-balance-routes.ts` owns `/api/conversation-balance/*`.
- **Wallet ledger:** `src/lib/credit-wallet.ts` is the append-only USD ledger for top-ups, burns, refunds, disputes, and grants.
- **Voice usage:** `src/lib/voice-usage.ts` consumes included voice capacity first and Runtime Balance only for explicit funded overflow.
- **Live Video usage:** `src/lib/video-presenter/live-video-usage.ts` atomically reserves monthly Live Video capacity before a provider session token is minted.
- **Live Video policy:** `src/lib/video-presenter/live-video-policy.ts` owns price, allowance, session reservation size, provider cost reserve, and minimum full-use margin.

## Commercial contract

- Free Builder creates, trains, and privately simulates one draft.
- Paid tiers include voice minutes, number capacity, and recurring Runtime Allowance as defined in `src/lib/plan-catalog.ts`.
- Runtime Balance is prepaid overflow. Wireline does not silently create a postpaid voice overage invoice.
- Extra-agent add-ons include additional capacity and minutes as defined by the catalog.
- **Live Video talking-head is retired.** Leftover Stripe add-on price IDs remain so webhooks do not brick billing. Checkout and session mint stay closed. Work companions draft clip scripts; Imagine files are not generated.
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
VERCEL_TOKEN=... npm run stripe:audit-live
```

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

Run `VERCEL_TOKEN=... npm run stripe:audit-live` and require:

1. **Account identity:** customer-facing public name/domain/descriptors are Wireline-aligned. Dashboard display name is an internal label, not the customer-facing identity gate.
2. **Product copy:** active canonical products match `scripts/lib/stripe-founder-catalog.mjs`, including catalog metadata.
3. **Catalog topology:** active products/prices, amounts, intervals, product ownership, subscriptions, payment links, and open Checkout sessions use canonical objects.

Do not change legal-entity, representative, bank, tax, address, or verification data merely to fix public branding.

### 5. Cancellation or downgrade is reflected in the app

1. Use Stripe Customer Portal to cancel at period end or switch tiers.
2. Deliver the appropriate `customer.subscription.updated` / `deleted` event.
3. Confirm billing status reports cancellation and current-period state accurately.
4. Confirm capacity gates read server settings/subscriptions, not stale client state.
5. Confirm a Live Video add-on cannot remain usefully entitled without an active paid base subscription; add-on cancellation/reconciliation must not strand a customer paying for unusable access.

### 6. Runtime Balance top-up works

1. Activate a paid plan, choose a Runtime Balance preset, and create one-time Checkout.
2. Confirm Checkout/PaymentIntent metadata carries the Wireline user and credit amount.
3. Complete payment and deliver the webhook.
4. Confirm exactly one `top_up` ledger row and an updated balance.
5. Redeliver the event and confirm no duplicate credit.

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

### 9. Live Video checkout → entitlement → session lifecycle works

Use a dedicated authorized test customer on an active paid base plan.

1. In a business agent, load `/api/video-presenter/avatars` and select a public presenter. Confirm the choice is persisted to that agent.
2. Start `POST /api/billing/live-video-checkout`; verify Checkout is **$19/month**, carries the Live Video add-on metadata, and uses automatic tax like the rest of the subscription surface.
3. Complete Checkout and deliver the webhook. Confirm server-owned `liveVideoAddonEnabled` becomes true only from reconciled Stripe state.
4. Enable Live Video on the selected business agent. Confirm Free Builder / inactive base plans cannot enable or purchase usable Live Video.
5. Start a presenter session. Before provider token minting, confirm the database atomically reserves **5 minutes** from the **60-minute** UTC-month allowance.
6. Confirm the provider request uses LITE mode and `maxSessionDurationSeconds = 300`.
7. Confirm the client receives `maxSessionSeconds`, establishes the stream, and can drive presenter lip-sync from the agent audio path.
8. Click **End live video** and verify the SDK session is stopped immediately.
9. Repeat until fewer than five reserved minutes remain; the next session must fail closed with `LIVE_VIDEO_MONTHLY_LIMIT_REACHED`.
10. Confirm there is **no automatic Stripe overage** and no usage-meter event for Live Video.
11. Cancel the Live Video subscription and confirm the webhook removes entitlement. Cancel the base plan and confirm Live Video can no longer be used and billing reconciliation does not leave an orphaned unusable add-on.
12. Set `WIRELINE_LIVE_VIDEO_DISABLED=true` in a non-production verification environment and confirm the provider surface/checkout becomes unavailable without changing stored customer entitlements.

## Verification commands

After billing or Live Video changes:

```bash
npm run test:run -- src/lib/plan-catalog.test.ts src/lib/conversation-balance.test.ts src/lib/video-presenter/live-video-policy.test.ts tests/live-video-economics-contract.test.ts tests/video-presenter-contract.test.ts tests/voice-wallet-guard.test.ts tests/voice-pricing-display.test.ts tests/billing-proof-contract.test.ts tests/vendor-readiness-contract.test.ts
npm run stripe:catalog:check
npm run lint:eslint
```

Before a billing release:

```bash
VERCEL_TOKEN=... npm run stripe:audit-live
```

Before a release candidate:

```bash
npm run verify:full
```

## Incident notes

- Stripe Dashboard deletes or test/live mismatches can make stored customer ids stale. The billing status/portal surfaces must expose a recoverable customer-missing state rather than pretending the portal exists.
- Do not manually edit entitlement state unless Stripe is unavailable and the account owner has approved emergency intervention. Record and later reconcile any manual correction.
- Refunds and disputes for Runtime Balance top-ups must reach the wallet ledger through the handled webhook events.
- Live Video provider failure after reservation must release that reservation; failure after a provider session has been minted is not assumed free.
- `WIRELINE_LIVE_VIDEO_DISABLED=true` is the operator emergency kill switch. It is not a substitute for canceling customer billing.
