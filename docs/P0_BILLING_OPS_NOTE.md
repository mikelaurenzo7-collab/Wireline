# Billing operations — September 27, 2026

Status: **current source contract; provider/deployment verification required**. This document does not certify that new prices exist in Stripe or that checkout is released. Render is production. The user reports that current accounts are demo/test; preserve all Stripe history and verify live subscription inventory before any destructive operation.

The authoritative files are `src/lib/plan-catalog.ts`, `scripts/lib/stripe-founder-catalog.mjs`, and the strict checkout validator. Catalog version: `channel_plans_2026_09_v2`.

| Channels                  | Light monthly / annual | Regular monthly / annual | High monthly / annual |
| ------------------------- | ---------------------: | -----------------------: | --------------------: |
| Calls                     |             $19 / $199 |               $59 / $690 |         $115 / $1,349 |
| Email                     |               $9 / $90 |               $29 / $290 |            $69 / $690 |
| SMS (unavailable)         |             $12 / $120 |               $29 / $339 |            $79 / $899 |
| Calls + Email             |             $25 / $259 |               $79 / $899 |         $159 / $1,799 |
| Calls + SMS (unavailable) |             $24 / $249 |               $79 / $939 |         $179 / $2,039 |
| Email + SMS (unavailable) |             $18 / $180 |               $49 / $499 |         $129 / $1,399 |
| All three (unavailable)   |             $29 / $309 |             $99 / $1,109 |         $219 / $2,549 |

Light / Regular / High each include one Bot with customizable roles. Higher capacity increases the account's usage allowances, not its Bot count or concurrency. Calls/SMS include one local number and Email includes one mailbox per account. Each connected identity is assigned to the Bot. One unsettled call is permitted per tenant. Extra-Bot add-ons for new channel packages are not available yet.

Light / Regular / High Calls include 50 / 250 / 500 minutes monthly. Standalone managed allowances are Calls $1.50 / $3 / $5; Email $2.50 / $10 / $30; SMS $2.50 / $7 / $15. Combinations add only each channel's incremental allowance above the Calls/base amount, so Email+SMS and all three receive $3.50 / $14 / $40. SMS transport is $2 / $10 / $30, separately funded. Annual prices are explicit, not ten times monthly; savings vary by package and capacity. Daily Calls guardrails are 60 / 250 / 500 minutes, with the same durable wallet admission. Channel-plan call minutes and managed AI allowances reset on the paid monthly subscription anniversary. Annual plans receive monthly slices anchored to the paid annual period, with month-end dates clamped without drift. Billing and Activity display the server-provided next reset date; unused included usage does not roll over. Legacy plans and Free Builder retain UTC calendar-month accounting. Missing verified paid-period evidence pauses new managed work until the subscription is refreshed in Billing; a calendar boundary never grants a second funded allowance.

New carrier acquisitions are limited to the account's included phone-slot count in any rolling 31 days. Releasing or compensating an acquired number does not restore acquisition eligibility; reassigning an existing owned line does not consume it. Accepted purchases remain counted for the full window. Ambiguous attempts retain their reservation; only a confirmed provider rejection voids it. This bounds carrier rental churn without an extra number charge; an exhausted limit returns the next eligible date.

Acquisition accounting begins when this guard is deployed; older allocations have no historical acquisition receipt. Existing owned and pending lines still consume current phone slots. Receipts omit phone numbers and Bot identifiers, record zero AI/provider usage cost, and use the existing minimum 90-day audit retention to cover the 31-day window.

No fixed email-message count or unlimited use is promised. SMS registration and receiving costs remain unverified, so all twelve SMS capacity quotes stay unavailable. See [the pricing decision](PRICING_DECISION_2026-09-27.md).

Free Builder remains private setup/testing, with no Stripe product or live provider access. Runtime Balance top-ups remain $10/$25/$50/$100. A call requires at least one funded minute before admission. Channel packages permit up to 10 additional completion minutes within the call's persisted duration limit; a single unsettled call holds its funds until settlement. Any resulting balance due pauses new calls and prepaid extras until paid. Included Email/AI may continue within their independent allowance. There is no automatic extra card charge or automatic overage invoice. Dashboard and billing access remain available.

Old starter/team/business/enterprise and extra-Bot IDs remain resolvable with historical prices and allowances. They are not new-sale plans. Setup preserves historical objects; no subscriptions are migrated or canceled. New one-Bot channel packages cannot purchase the historical extra-Bot bundle. Retired Live Video stays unavailable.

## Provider reconciliation

Run static checks locally. Live read-only checks use the Render shell's existing injected credentials; do not export secrets:

```bash
npm run stripe:catalog:check
npm run economics:report
npm run stripe:audit-live
npm run stripe:portal:verify
npm run stripe:webhook:check
```

The active Stripe manifest creates only Calls, Email, Calls + Email, contact-sales and Runtime Balance products. Each of the three available channel families has Light, Regular and High products: nine recurring products and eighteen recurring prices, plus contact-sales and Runtime Balance products and four top-up presets. SMS products/prices are deliberately absent. Light env names: `STRIPE_VOICE_PRICE_ID`, `STRIPE_VOICE_ANNUAL_PRICE_ID`, `STRIPE_EMAIL_PRICE_ID`, `STRIPE_EMAIL_ANNUAL_PRICE_ID`, `STRIPE_VOICE_EMAIL_PRICE_ID`, `STRIPE_VOICE_EMAIL_ANNUAL_PRICE_ID`. Regular/High insert `_REGULAR` or `_HIGH` before `_PRICE_ID` or `_ANNUAL_PRICE_ID` (18 interval IDs total). Exact amounts, annual intervals, channel/resource metadata, currency and live active product identity must match before checkout. No old price ID is a fallback for a new package.

The managed Stripe portal remains payment/invoice/contact/cancellation-only. The in-app capacity endpoint supports only a higher usage capacity with identical channels and billing interval, scheduled at the next successful paid renewal (including the next annual renewal for annual customers). Higher account allowances start only after that paid renewal; Bot, phone and mailbox limits do not increase. There is no immediate proration, quota reset, channel switch or cancellation/re-purchase. Runtime top-ups remain the immediate option. The authoritative paid base-plan invoice must match the subscription, customer, target price and effective period before higher capacity is projected. A Stripe phase change alone is insufficient. Failed payments keep the old capacity and ordinary subscription payment gates still apply.

GET/POST/DELETE `/api/billing/capacity-upgrade` provide status, scheduling and removal. The operation is serialized with deletion cleanup; durable provider metadata and stable per-generation Stripe keys recover interrupted attempts. An incomplete attempt is labelled unconfirmed, not scheduled. Removing a change releases only the exact owned schedule and keeps the current subscription. Stripe portal cancellation is unavailable while any schedule is attached, so the UI exposes removal before cancellation; a paid applied phase is detached automatically without reverting its price. Foreign schedules are never overwritten. No automatic usage invoice or extra card charge is introduced.

### Current managed-email capacity hold

The AgentMail console observed September 27 reports **10 of 11 inboxes used, one spare** (`live-account/agentmail-capacity-10-of-11.png` in the external release evidence). That is not capacity for unrestricted Email sales. No upgrade has been approved or purchased. Launch Calls first with only the six Calls capacity/interval price environment IDs configured. Keep all Email and Calls + Email capacity/interval IDs unset until capacity is explicitly funded and verified. For channel packages, an unset interval ID prevents server price resolution before any Stripe lookup, matching the disabled UI. Merely creating a catalog price does not release checkout. Do not sell the single spare inbox as an unbounded public offer or build assumptions on a future subscription upgrade.

## Required proof

1. Free signup creates no subscription and cannot start live customer work.
2. Each available channel selection resolves to its exact monthly/annual Stripe price.
3. All twelve SMS-containing capacity selections reject checkout before customer/session creation, even with configured price IDs.
4. Subscription webhook replay projects channels and exact allowances once; legacy seeded records keep historical limits.
5. Email-only provisions no number; Calls-only provisions no mailbox. Disabled channels cannot send through API, tools or queued work.
6. Managed email/Lookup reservations reject unfunded attempts, serialize competing reservations and retain uncertain provider outcomes.
7. Customer Portal payment and period-end cancellation work after any owned scheduled capacity change is removed; higher usage allowances activate only after the next paid renewal, with no additional Bot, phone or mailbox allocation.
8. Runtime top-up replay grants credit once; monetary refunds reverse the correct original grant.
9. Billing status reports authoritative channels, or unknown on read failure, without fabricating access.
10. Exact Render web/worker revision and readiness agree after release.
11. Call funding holds and provider claims commit together; retries retain their original deadline. Completion refunds unused holds or charges only the remaining amount once. Definitive unanswered/startup failures release holds only after confirmed termination; uncertain calls retain their hold and no second admission is granted.

The economics report enforces floors on new packages and prints historical below-floor exposure separately. SMS arithmetic excludes unresolved regulatory and receiving costs and is not SMS launch proof. Provider list prices are assumptions until actual invoice/traffic reconciliation confirms them.

Never delete prices, subscriptions, mailboxes or numbers as an incidental catalog update. No provider mutation is authorized merely by running this note's read-only checks.

Recovery limit: an interrupted create whose exact Stripe idempotency receipt has expired may need manual provider reconciliation. Never adopt or release an unknown schedule merely from metadata. No Stripe mutation or sandbox/live renewal proof is implied by local unit tests.
