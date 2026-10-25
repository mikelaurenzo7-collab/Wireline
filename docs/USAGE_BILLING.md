# Usage billing

Status: **release candidate; production enrollment stays off until final verification and promotion.**
Michael authorized selecting sustainable pricing, completing billing and cloning, merging to main,
deploying to Render and enabling the proven features. No further generic approval is required.
The required release evidence remains a condition of that authorization.

## Rate card (catalog `2026-10-usage-v2`, monthly only)

| Charge                          | Price                                        |
| ------------------------------- | -------------------------------------------- |
| Monthly base                    | $19, including one $12 shared work allowance |
| Calls                           | $0.25/minute, measured by the second         |
| Delivered email replies         | $0.02 each                                   |
| Computer task time              | $0.20/minute                                 |
| Optional BotBound number        | $3/month each                                |
| Optional BotBound email address | $4/month each                                |

All three channels draw from the same $12 allowance. For example, 24 call minutes,
100 delivered replies and 20 Computer minutes together use $12. The allowance resets
on the subscription billing cycle and does not roll over. Fixed add-ons are separate.
The customer sees dollars of work, native quantities, estimated charges and a pretax cap.
Stripe receives one weighted meter: 100 credits = $1 of work; its first 1,200 credits
are free and subsequent credits cost one cent. Keep native quantities in the ledger.
Round the combined meter once, not each channel before summation.

The rate card is in `src/lib/usage-billing-catalog.ts`; the setup script and checkout
validator must match it. The previous v1 separate allowances and graduated call prices
are superseded for new enrollment. Existing package subscriptions are not migrated.

## Cost controls and evidence

A retail spending cap does not itself cap provider costs. Computer reserves provider
cost atomically against a separate $3 included processing envelope plus 40% of completed
Computer work above $12. Expensive tasks may pause before the retail allowance is used;
the product discloses this and preserves the remaining allowance for other work. Review
actual token, browser and retry costs before expanding that processing policy. Do not
advertise 60 guaranteed Computer minutes or unlimited processing.

Voice admission reserves time; customer quotas and provider capacity remain finite.
There is no per-Bot charge, but the current identity namespace supports 120 Bots and
human workspace sharing requires its own supported permissions. Do not promise unlimited
identities or imply this release proves shared-human tenancy.

Verified v2 sandbox renewal totals on October 25: $19.00 for mixed included work,
$40.68 for fractional work with both add-ons, and $19.01 for cross-channel fractional
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
| Tables                                      | `src/db/usage-billing-schema.ts`, migrations `0187_usage_billing.sql` through `0189_usage_billing_periods.sql`                                              |
| Plan                                        | `USAGE_PLAN` / `isUsagePlanId` in `src/lib/plan-catalog.ts` (outside `STRIPE_PLANS`)                                                                        |
| Bots                                        | `resolveAgentEntitlement` returns `unlimited: true` for an active usage subscription; the only ceiling is the 120-mark identity namespace                   |
| Checkout                                    | `plan_id: "usage"`: base, one shared metered price, and only the chosen add-ons; monthly only                                                               |
| Add-on slots                                | mirrored from the Stripe subscription into `wireline_usage_spend_controls`; numbers and BotBound email addresses are provisioned only up to what was bought |
| Reporting                                   | `usage_meter_report` job; Stripe meter events carry the idempotency key as `identifier`                                                                     |
| Public copy                                 | `/api/billing/plans` returns `billing_model` and `usage_checkout_available`; the landing and pricing pages switch on it, so copy is never ahead of checkout |

Recording points: settled call minutes (`voice-usage.ts`), delivered email replies
(`email-thread-reply.ts`) and cloud computer task wall time (`cloud-computer/task-runner.ts`).
Each records once per source id, so retries and replays never double count.

## Stripe objects and env vars

Run `node scripts/stripe-usage-billing-setup.mjs` for the dry run. `--apply` needs a test key;
a live key also needs `--live --rates-approved`. The script reuses existing objects by lookup key
or meter event name and never modifies or archives anything.

| Object                        | Lookup key or event                                             |
| ----------------------------- | --------------------------------------------------------------- |
| Base, $19 licensed monthly    | `usage_base_monthly_2026_10_v2`                                 |
| Sum meter, by Stripe customer | `botbound_work_credits_v2`                                      |
| Shared graduated meter price  | `usage_work_2026_10_v2`                                         |
| Add-on prices                 | `usage_addon_number_2026_10_v2`, `usage_addon_email_2026_10_v2` |

Environment names: `USAGE_BILLING_ENABLED`, `STRIPE_USAGE_BASE_PRICE_ID`,
`STRIPE_USAGE_WORK_PRICE_ID`, `STRIPE_USAGE_WORK_METER_EVENT`,
`STRIPE_USAGE_NUMBER_ADDON_PRICE_ID`, `STRIPE_USAGE_EMAIL_ADDON_PRICE_ID`.

## Rollout

| Stage | What                                                                                                                                                                                                                                                                  |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Validate with the flag off. Migrations 0187, 0188 and 0189 must be installed through the reviewed release path before deploying this source, including the new nullable fields used by existing checkout/task queries.                                                |
| 1     | Use the approved rates in the BotBound Stripe account (`acct_1TkyXL8e6If87QKm`), test mode only: dry run, then `--apply`, staging configuration and an isolated database, then prove a test-clock invoice (base, mixed shared work, add-ons, rounding and cap clamp). |
| 2     | After the proof: `--apply --live --rates-approved`, set env vars, flip `USAGE_BILLING_ENABLED=true`, redeploy.                                                                                                                                                        |
| 3     | Lift the 120-mark ceiling per workspace.                                                                                                                                                                                                                              |

## Known follow-ups before stage 2

- Computer minutes count task wall time.
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
   before live enrollment; the production release flag remains off until that proof passes.

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
