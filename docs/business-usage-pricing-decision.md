# Sustainable Business Usage Migration

## Decision

Wireline business plans should give customers more usable live-work capacity, but the product must not turn a low-priced platform subscription into an open-ended voice-cost subsidy.

The current catalog contains historical internal allowances of 500 minutes for Front Desk and 1,200 minutes for Sales & Reception. The catalog's own blended reserve is `$0.128/minute`. At that reserve, the legacy allowances imply approximately `$64` and `$153.60` of voice cost against `$29` and `$59` monthly plans, before telephony, messaging, storage, support, payment fees, or profit.

**Do not increase raw minute allowances on the current $29 / $59 prices.** That would worsen an already unsound unit-economics position.

## Product model going forward

Business plans sell the operating layer:

- shared assistants, roles, routing, inbox, phone lines, connections, governance, reporting, and support;
- live conversation work remains usage-funded through Conversation Balance;
- business plans should include a deliberate recurring **Conversation Balance grant** only once the grant is backed by an idempotent invoice-success workflow and a revised price floor.

This is better than public minute bundles because it works across voice, SMS, email, and future channels without pretending every minute has the same cost.

## Recommended commercial migration

### Preserve current plans for existing subscribers

- Do not silently reprice or remove existing subscriptions.
- Keep the current Stripe prices as legacy prices.
- Preserve their existing entitlement and support behavior.
- Do not add a recurring grant to legacy plans until the grant accounting and margin policy have passed acceptance tests.

### New acquisition plans

| Plan | Proposed platform price | Included recurring Conversation Balance | Intended job |
| --- | ---: | ---: | --- |
| Front Desk | $79/month | $20/month | One shared reception workflow, inbound coverage, appointment and lead handoff |
| Sales & Reception | $199/month | $75/month | Multi-assistant coverage, routing, campaigns, shared operations |
| Custom Enterprise | Contract | Contract | Multi-location operations, governed rollout, custom commercial terms |

The balance grant is not a cash withdrawal. It is a platform usage allowance recorded in Wireline's append-only credit ledger only after the related subscription invoice succeeds.

At the existing blended reserve, the initial grants equate to roughly 156 and 586 voice-equivalent minutes before channel-specific variation. That creates materially more useful capacity while retaining room for platform, telephony, support, payment, and margin costs.

## Required implementation before new prices go live

1. Add `included_conversation_credit_usd` to the plan catalog and public plan payload.
2. On `invoice.payment_succeeded`, resolve the active Wireline plan from the synced subscription and grant the plan's recurring balance with a reference key tied to `invoice.id`.
3. Use the existing unique ledger reference constraint for idempotency; duplicate webhooks must never duplicate a grant.
4. Do not grant on failed, void, uncollectible, or non-subscription invoices.
5. Add refund/dispute policy for subscriptions separately from one-time top-up reversal. A recurring entitlement grant should normally stop future grants on non-payment; it should not automatically claw back already-spent service without an explicit policy.
6. Create *new* Stripe recurring prices for new acquisition; existing subscribers remain on legacy Stripe prices unless they opt in.
7. Update environment references only after Stripe price creation succeeds and checkout/portal migration is exercised in test mode.
8. Update pricing UI only after the backend grant workflow is live. The UI must name the grant as Conversation Balance, not a generic number of minutes.

## Acceptance tests

- First subscription checkout grants the included balance once after a paid invoice.
- Renewal grants exactly once despite duplicate Stripe webhook delivery.
- Invoice retry / payment failure grants nothing.
- Subscription cancellation prevents the next cycle grant.
- A customer changing plans gets only the grant associated with the paid invoice and final active plan; no double grant from proration events.
- Mobile clients can display balance but cannot sell or grant it; web remains the billing surface.
- Stripe dashboard, Wireline billing status, credit ledger, and usage snapshot reconcile to the same customer and invoice identifiers.

## Adjustment rule

Do not ship the proposed $79/$199 price changes until a test-mode lifecycle proves checkout, invoice renewal, grant idempotency, portal changes, cancellation, payment failure, and support visibility. If actual blended usage costs differ materially from the current reserve, revise grant sizes before touching acquisition prices—not after.
