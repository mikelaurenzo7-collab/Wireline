# Usage billing

Status: **Lite, Starter and Plus shared-work billing is deployed; the authorized return to the selected BotBound merchant is verified.**
Michael selected the older BotBound Stripe account (`acct_1TkyXL8e6If87QKm`).
The October 25 local release of [PR #1386](https://github.com/mikelaurenzo7-collab/Wireline/pull/1386)
verified all four Render services on `d680a8fdddba88429c2f8d2f837df6a57e85f258`.
Final API runtime confirmed the selected merchant with checkout and webhook enabled,
28 current/configured legacy prices active in live USD, the active shared-work meter,
matching credential hashes and the canonical customer portal. The target webhook is
active; the previous LLC account's endpoint is disabled. Founder binding repair retained
the explicit grant and historical invoice receipts. These are dated configuration and
release receipts, not ordinary new-plan payment or settlement acceptance. The account
name does not establish its legal entity or tax classification; provider verification
is a separate check.

Earlier on October 25, the release switched new production billing to BOTBOUND LLC
(`acct_1UQBcs6Ph5cHChCS`), verified its runtime permissions and live catalog, activated
the matching lifecycle webhook, and reconciled migration 0191 and the founder/demo
bindings. See [release PR #1382](https://github.com/mikelaurenzo7-collab/Wireline/pull/1382).
Those are dated receipts for that earlier merchant. The subsequent selected-account
release above was verified separately. Manage Billing opened the original customer's
portal, preserving its paid legacy subscription, scheduled cancellation and separate
founder grant. Review Plan correctly prevented another subscription for that customer;
no new checkout or payment was created. Sandbox renewal invoices and the earlier
LLC-hosted checkout handoff remain valid within their scope. A new Shared Work checkout
on the selected merchant, ordinary paid activation and production recurring settlement
remain separate acceptance work. SMS execution still requires
carrier approval, consent and the existing runtime gates. DNCScrub purchase is deferred
by the founder; marketing calls requiring federal screening remain blocked until
vendor access and the seller's registration are configured and verified.
Keep existing immutable prices and historical periods intact during this rollout.
Michael authorized selecting sustainable pricing, completing billing and cloning, merging to main,
deploying to Render and enabling the proven features. No further generic approval is required.
The required release evidence remains a condition of that authorization.

## Public plans (shared meter catalog `2026-10-usage-v2`, monthly only)

| Plan    | Monthly | Shared Work | Local Numbers | Email Addresses |
| ------- | ------: | ----------: | ------------: | --------------: |
| Lite    |     $12 |          $4 |             1 |               1 |
| Starter |     $24 |         $14 |             1 |               1 |
| Plus    |     $49 |         $36 |             2 |               2 |

Inbound and outbound calls cost $0.25/minute, US SMS $0.04/sent segment,
sent email replies $0.02 each, and Computer $0.20/minute.
Calls and Computer are measured by the second. Every plan has the same core capabilities.
Additional identities cost $3/local number/month and $4/email address/month. These quantities
are extras beyond included capacity; an included identity must never become a paid line item.
Provisioning uses the verified base/work price pair, not user-editable Stripe metadata.

All four kinds of work use one allowance, reset on the subscription billing cycle without
rollover. SMS requires sender approval and recipient permission. International SMS and MMS
are rejected before a shared-work carrier send; they need separately verified pricing.
Legacy subscriptions retain their existing SMS funding. Customer-owned
domains need verification; international/toll-free numbers are not promised at the local rate.
Stripe receives one weighted meter: 100 credits = $1 of work. The first 400/1,400/3,600 credits
cost zero for Lite/Starter/Plus, then one cent per credit. Native quantities remain in the ledger.
Round the combined meter once, not each channel before summation.

The retired monthly offer is retained internally as `starter` so stored periods keep
their allowance. New periods and any omitted tier default to public Starter (`standard`).
This distinction preserves historical invoices and immutable Stripe objects. New checkout
rejects `starter`. Existing package subscriptions are unchanged.
Each billing period freezes its tier. A midperiod tier or add-on change holds new work for
invoice reconciliation rather than retroactively changing accrued usage.

The rate card is in `src/lib/usage-billing-catalog.ts`; the setup script, checkout validator,
UI and estimator must match. No annual or unlimited-use offer is introduced.

## Cost controls and evidence

A retail spending cap does not itself cap provider costs. Computer reserves provider
cost atomically against a separate included processing envelope ($1 Lite, $3.50 Starter,
$9 Plus; original offer $3), plus 40% of completed Computer work above that plan's allowance. Expensive tasks may pause before the retail allowance is used;
the product discloses this and preserves the remaining allowance for other work. Review
actual token, browser and retry costs before expanding that processing policy. Do not
advertise 60 guaranteed Computer minutes or unlimited processing.

Voice admission reserves time; customer quotas and provider capacity remain finite.
There is no per-Bot charge. Bot pictures may repeat, so a workspace is not limited to
120 pictures. Human workspace sharing still requires its own supported permissions.
Do not imply this release proves shared-human tenancy.

Verified bundled-plan sandbox renewal totals on October 25: $12.00 for Lite's exact mixed
allowance, $24.01 for Starter's fractional overage, and $100.00 for Plus with both extra
identities and capped work. Duplicate submissions aggregated once; no live charge was made.

Earlier retired-offer v2 sandbox renewal totals on October 25 matched the stored starter
rate card for mixed included work, fractional work with both add-ons, and cross-channel fractional
rounding. Duplicate requests aggregated once. These provider proofs do not replace
application webhook, entitlement, cancellation, payment-failure and final-release checks.

Published provider prices and internal reservations are planning inputs, not measured
net profit. Track actual provider costs, payment fees, refunds, fixed hosting and founder
support time. The earlier v1 margin percentages are retired; do not reuse them for v2.

## Spend caps

- Default cap $100 a month. Minimum is fixed charges (base plus add-ons) plus $5; maximum $25,000.
- Alerts at 50%, 80% and 100%, each once per period, the highest crossed threshold only.
- At the cap, admission refuses new metered work with `402 USAGE_SPEND_CAP_REACHED`, and Bots pause.
- Work already admitted when the cap is crossed is clamped out of the Stripe report
  (`clampBillableQuantity`, unrounded pricing). The limit covers pre-tax BotBound charges;
  tax-exclusive prices can produce a higher final invoice when tax applies.

## How it works

| Piece                                       | Where                                                                                                                                                       |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Flag and env names                          | `src/lib/usage-billing-config.ts`                                                                                                                           |
| Ledger rules (record, admit, alert, report) | `src/lib/usage-billing-ledger.ts` (pure, unit tested)                                                                                                       |
| Postgres store and Stripe meter client      | `src/lib/usage-billing-store.ts`                                                                                                                            |
| Tables                                      | `src/db/usage-billing-schema.ts`, migrations `0187_usage_billing.sql` through `0192_usage_tier_standard_default.sql`                                                   |
| Plan                                        | `USAGE_PLAN` / `isUsagePlanId` in `src/lib/plan-catalog.ts` (outside `STRIPE_PLANS`)                                                                        |
| Bots                                        | `resolveAgentEntitlement` returns `unlimited: true`. Pictures may repeat (`0193_reuse_bot_mark_pictures.sql`); there is no 120-Bot ceiling                    |
| Checkout                                    | `plan_id: "usage"`, `usage_tier`: selected base/work pair and optional extras; monthly only                                                                 |
| Add-on slots                                | mirrored from the Stripe subscription into `wireline_usage_spend_controls`; included identities plus paid extras determine provisionable capacity           |
| Reporting                                   | `usage_meter_report` job; Stripe meter events carry the idempotency key as `identifier`                                                                     |
| Public copy                                 | `/api/billing/plans` returns `billing_model` and `usage_checkout_available`; the landing and pricing pages switch on it, so copy is never ahead of checkout |

Recording points: settled call minutes (`voice-usage.ts`), sent email replies
(`email-thread-reply.ts`), accepted SMS segments (`sms-usage-billing.ts`), and cloud computer
task wall time (`cloud-computer/task-runner.ts`). SMS reserves whole estimated segments under
the shared spending lock before a carrier attempt. Definitive rejection releases the reservation;
an ambiguous response retains it for reconciliation without resending. Cancellation preserves
the admitted period and holds its final invoice for reconciliation.
Each records once per source id, so retries and replays never double count.

## Stripe objects and env vars

Run `node scripts/stripe-usage-billing-setup.mjs --tier=lite` (or `standard`, `plus`) for the dry run. The default retains the original offer for reconciliation. `--apply` needs a test key;
a live key also needs `--live --rates-approved`. The script reuses existing objects by lookup key
or meter event name and never modifies or archives anything.

| Object                          | Lookup key or event                                             |
| ------------------------------- | --------------------------------------------------------------- |
| Lite / Starter / Plus bases     | `usage_{lite,standard,plus}_monthly_2026_10_v1`                 |
| Lite / Starter / Plus work      | `usage_{lite,standard,plus}_work_2026_10_v1`                    |
| Retired monthly base, historical | `usage_base_monthly_2026_10_v2`                                |
| Sum meter, by Stripe customer   | `botbound_work_credits_v2`                                      |
| Original work price, historical | `usage_work_2026_10_v2`                                         |
| Add-on prices                   | `usage_addon_number_2026_10_v2`, `usage_addon_email_2026_10_v2` |

Environment names: `USAGE_BILLING_ENABLED`, `STRIPE_USAGE_BASE_PRICE_ID`,
`STRIPE_USAGE_WORK_PRICE_ID`, `STRIPE_USAGE_WORK_METER_EVENT`,
`STRIPE_USAGE_NUMBER_ADDON_PRICE_ID`, `STRIPE_USAGE_EMAIL_ADDON_PRICE_ID`,
`STRIPE_USAGE_LITE_BASE_PRICE_ID`, `STRIPE_USAGE_LITE_WORK_PRICE_ID`,
`STRIPE_USAGE_STARTER_BASE_PRICE_ID`, `STRIPE_USAGE_STARTER_WORK_PRICE_ID`,
`STRIPE_USAGE_PLUS_BASE_PRICE_ID`, `STRIPE_USAGE_PLUS_WORK_PRICE_ID`, and
`STRIPE_USAGE_SANDBOX_ACCOUNT_ID` for the allowed test merchant. The API only advertises configured public tiers.

## Rollout

| Stage | What                                                                                                                                                                                                                                                        |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | For a new environment, validate with the flag off. Install migrations 0187 through 0192 through the reviewed release path, verifying the ledger and actual schema before promotion. Never replay them blindly on production. Apply `0192_usage_tier_standard_default.sql` by hand after 0191 and before deploy. |
| 1     | The selected production target is BotBound (`acct_1TkyXL8e6If87QKm`). Use an explicitly selected isolated test sandbox for invoice proof. Audit the target's existing catalog before applying each public tier; reuse passing proof when source and conditions still match. |
| 2     | After proof and authorization, use `--apply --live --rates-approved` as needed, configure matching merchant prices, meter, webhook and runtime permissions, reconcile exact founder/demo bindings, and deploy the reviewed source. The selected-account switch was verified in PR #1386; future configuration changes require fresh matching evidence. |
| 3     | Verify deployed checkout, webhook ownership, entitlement and settlement against the same merchant. Preserve historical merchant bindings and invoices unless an exact, audited reconciliation explicitly changes them.                                      |

## Settlement Verification And Operating Limits

- Computer minutes count task wall time. This remains disclosed in the product.
- Self-service changes between usage tiers are not introduced by this release. Preserve the
  frozen period and reconcile invoices for any operator-managed midperiod change.
- Prove final settlement for cancellation, delayed provider receipts, mid-period add-on changes
  and invoice finalization. These cases retain their receipts as `reconciliation_required` and
  do not automatically submit an amount to a possibly finalized invoice. Enabling live billing
  requires an operator reconciliation procedure and a tested final-invoice policy.
- Prove provider meter aggregation and invoice payment in BotBound test mode. A successful paid
  signup on the earlier package plans does not validate this usage catalog or its meter cycle.
- Include applicable tax in invoice proof. Pricing, Billing and spend-alert copy disclose
  that the limit covers pre-tax BotBound charges, with tax added separately.

### Call reservations and provider reconciliation

Usage calls, including customer self-phone tests, now reserve affordable seconds before
provider admission under the same lock used for cap changes and meter preparation. The
reservation owns the persisted call deadline. It does not debit prepaid Runtime Balance.
Confirmed non-delivery releases it; ambiguous carrier outcomes keep it reserved. Terminal
replay cannot replace the original period or duration. The invoice clamp remains a final
backstop for delayed receipts and overlapping email/Computer work.

The jobs sweep reads Stripe's authenticated V2 meter-error events before reporting further
usage. An asynchronous rejection places the affected period on a durable reconciliation
hold. Partial provider error samples conservatively hold all recent submissions to that
meter; missing samples are not evidence of success. No background job clears that hold or
resends ambiguous attempts. The customer sees a verification pause, distinct from a cap pause.
The Stripe key must permit V2 event reads and meter reads. Verify those permissions in staging.

Meter requests use both a frozen event identifier and HTTP idempotency key. Long source
identities are deterministically hashed to fit Stripe's 100-character identifier limit.
HTTP acceptance remains separate from aggregation and a paid invoice.

Catalog setup and actual usage checkout validate the configured prices, graduated tiers,
currency, tax behavior, product, meter aggregation, customer mapping and event names.
Existing objects with conflicting semantics fail closed. A dedicated test sandbox may be
selected with `STRIPE_USAGE_SANDBOX_ACCOUNT_ID`; that override is ignored for live keys.

### Final invoice and exception procedure

1. Keep a period hold in place on cancellation, renewal with late receipts, an add-on change,
   an expired idempotency window, or an asynchronous provider rejection. Finish already
   admitted work and retain its receipts. Do not create a fresh identifier to retry old work.
2. Run the read-only report in the authorized runtime:
   `node --import tsx scripts/stripe-usage-reconcile.mts --user UUID --period PERIOD_KEY --invoice in_ID`.
   It checks tenant/customer/subscription identity, the frozen meter configuration, Stripe
   aggregates, unresolved receipts and invoice payment. It waits for a 15-minute aggregation
   margin and flags minute-boundary overlap. A matched aggregate is not final-invoice approval.
3. Compare exact invoice line periods, rates, add-on quantities, proration, tax, credits and
   payment status in Stripe. The report deliberately does not mutate invoices or clear holds.
   Preserve the evidence and the proposed correction before any financial action.
4. For a finalized invoice, do not append late usage automatically or silently move it into
   the next period. Customer-friendly default: absorb previously unsubmitted late work.
   A possibly accepted attempt must first be reconciled; neither retry nor credit is safe
   without establishing what Stripe actually charged.
5. Resolve only the exact reviewed period and receipts through a reviewed repair. Recheck
   invoice totals and customer-visible state. Releasing a hold must never erase historical
   events, fixed charges, or the original request. Prove this procedure in the sandbox
   before enabling a new rollout. Existing reconciliation holds remain in place until
   their exact receipts and invoice effects are resolved; an enabled release flag does
   not clear them.

## Purchase and settlement safeguards

Public usage links preserve the monthly plan and optional number/mailbox choices through signup
and activation. Public usage copy requires checkout availability, including all four offered prices.
Checkout operations persist a purchase fingerprint covering prices and quantities. Changed purchases
retire an old payable session before replacement; an unresolved creation cannot be resumed with
different parameters. Fixed charges must fit the disclosed default cap.

Cap changes serialize with meter reporting and cannot go below accrued charges, including pending
work. Spend displays never hide Stripe-accepted usage or fixed charges behind a lower local limit.
Alerts advance their checkpoint only after email transport acceptance; the scheduled sweep retries
failed alerts even if no further usage occurs.

Completed computer tasks store their duration receipt with their terminal outcome. Accepted email
replies store their receipt with the sent ledger entry. Immediate metering is backed by reconciliation
from those durable records, using the same idempotency key and captured admission period/time.
Retrying metering never resends email or reruns a task. Work whose provider outcome or terminal
duration is unknown remains a reconciliation case; it must not be guessed into an invoice.

## Period and retry integrity

Each Stripe subscription period stores its exact customer, subscription, start/end, add-ons and
cap. The period key includes the subscription ID and full timestamp. Missing or stale period
identity prevents admission; no calendar-month fallback guesses the billing window. Owner cap
changes update the current period and the default for future periods under the reporter lock.
Renewal creates a new snapshot. Changed add-ons in the same period preserve the original values
and pause new work until their prorated invoice is reconciled.

Calls persist an admission row before provider acceptance. The first terminal duration changes
that row from `admitted` to `pending`; subsequent callbacks keep the original duration and period,
even after cancellation or a flag pause. Computer and email receipts retain their existing
terminal reconciliation paths. Ordinary package calls do not create usage receipts.

Reporting commits the complete Stripe request under a short per-account lock before making a
network call. Retries keep its customer, event name, timestamp, identifier and amount. There is
no open database transaction spanning the provider request. Stripe currently supports decimal
meter values and guarantees identifier uniqueness for at least 24 hours; ambiguous requests stop
automatic retry after 23 hours. Their reserved billable quantities remain in spend-cap accounting.

Rows requiring reconciliation keep their original quantity and any frozen request. They are
excluded from automatic retry, rather than marked as zero-cost work. Inspect `last_error` and
match the identifier to Stripe meter and invoice evidence before any manual disposition; never
clear an attempt or resend it beyond the deduplication window on an assumption. Stale `admitted`
rows also require provider terminal evidence before settlement.

Sources: [recording usage](https://docs.stripe.com/billing/subscriptions/usage-based/recording-usage-api)
and [meter event identifiers](https://docs.stripe.com/api/billing/meter-event/create).

## Disposable PostgreSQL validation

`tests/usage-billing-postgres.test.ts` executes the committed migrations twice and tests real
transaction visibility, concurrent reporters, cap/period snapshots, flag pauses, call replay,
RLS and deletion cascade. It only connects when `USAGE_BILLING_TEST_DATABASE_URL` names the
local `botbound_usage_review` database. It never falls back to production connection variables.
Use a disposable local PostgreSQL 17 container and run this suite with that URL; its fixture
setup truncates only this dedicated database. The regular test suite skips it when the explicit
local URL is absent. This validates database behavior, not an actual Stripe invoice.

## October 25 bundled-offer rehearsal

The isolated, claimed BotBound sandbox completed paid test-clock renewal invoices at $12.00
for Lite's fully shared allowance; $24.01 for Starter cross-channel fractional rounding; and
$100.00 for Plus with one additional number/mailbox pair and work exactly at the default cap.
Each channel event was replayed with its idempotency key and aggregated once. These are
sandbox invoice proofs, not live customer revenue or final application release certification.

The economic analysis in the BotBound business hub records full-use sensitivities, founder
time, fixed-overhead break-even and current official vendor sources. No net-profit guarantee
is made. All paid plans include identities; additional capacity remains optional.
