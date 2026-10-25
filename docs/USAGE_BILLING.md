# Usage billing (dark launch)

Status: **built, off by default, rates approved; activation pending invoice validation.**
`USAGE_BILLING_ENABLED=true` and the configured Stripe objects are required for new checkout and
metered work. Turning the flag off pauses new work; receipts from prior admissions still settle.
Apply the committed migrations before deploying even with enrollment off. No live Stripe object
or production configuration has been changed by this review.

Source of truth for every number: `src/lib/usage-billing-catalog.ts`. The Stripe setup script
(`scripts/stripe-usage-billing-setup.mjs`) mirrors it, and `tests/usage-billing-catalog.test.ts`
fails if the two drift.

## Rate card (catalog `2026-10-usage-v1`, monthly only)

| Line                                     | Price                                                                              | Included in the base                                     |
| ---------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Monthly base                             | $19                                                                                | 60 call minutes, 100 emails handled, 15 computer minutes |
| Call minutes                             | $0.25 for the first 500 past the included 60, $0.22 for the next 1,500, then $0.20 |                                                          |
| Emails handled                           | $0.02 each                                                                         |                                                          |
| Computer minutes                         | $0.15 each                                                                         |                                                          |
| BotBound number (optional add-on)        | $3 / month each                                                                    |                                                          |
| BotBound email address (optional add-on) | $4 / month each                                                                    |                                                          |

Never metered: Bots, roles, seats, summaries. Calls are billed by the second (decimal minutes).
Gmail and Outlook connect at no extra charge and never create a BotBound inbox.

### Margins (reserve $0.128/min, stress $0.14/min, fees 4.1% + $0.30)

| Line                               | Margin                              | Stress                |
| ---------------------------------- | ----------------------------------- | --------------------- |
| Base at 100% included use          | 34.0% (floor 30%)                   | 30.2% (floor 25%)     |
| Base at 70% included use           | 50.1% (floor 45%)                   |                       |
| Minutes 1-500 / 501-2,000 / 2,001+ | 44.7% / 37.7% / 31.9%               | 39.9% / 32.3% / 25.9% |
| Email handled                      | 45.9%                               |                       |
| Computer minute                    | 29.2% worst case, about 56% typical |                       |
| Number / email address add-on      | 57.6% / 45.9%                       |                       |

Example bills: solo contractor $52 (44.8%), busy salon $252.55 (41.5%), three-site service company
$2,136.75 (34.1%). The computer minute is the one line that can dip under 30%; reprice to $0.18 if
measured cost per active minute exceeds $0.105.

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
| Tables                                      | `src/db/usage-billing-schema.ts`, migrations `0187_usage_billing.sql` through `0189_usage_billing_periods.sql`                                                                                        |
| Plan                                        | `USAGE_PLAN` / `isUsagePlanId` in `src/lib/plan-catalog.ts` (outside `STRIPE_PLANS`)                                                                        |
| Bots                                        | `resolveAgentEntitlement` returns `unlimited: true` for an active usage subscription; the only ceiling is the 120-mark identity namespace                   |
| Checkout                                    | `plan_id: "usage"`: base, three metered prices, and only the chosen add-ons; monthly only                                                                   |
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

| Object                                | Lookup key or event                                                                             |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Product `BotBound`                    |                                                                                                 |
| Base price, $19 licensed monthly      | `usage_base_monthly_2026_10_v1`                                                                 |
| Meters (sum, by `stripe_customer_id`) | `botbound_call_minutes`, `botbound_emails_handled`, `botbound_computer_minutes`                 |
| Graduated metered prices              | `usage_call_minutes_2026_10_v1`, `usage_emails_2026_10_v1`, `usage_computer_minutes_2026_10_v1` |
| Add-on prices                         | `usage_addon_number_2026_10_v1` ($3), `usage_addon_email_2026_10_v1` ($4)                       |

Env vars (names only): `USAGE_BILLING_ENABLED`, `STRIPE_USAGE_BASE_PRICE_ID`,
`STRIPE_USAGE_CALL_MINUTES_PRICE_ID`, `STRIPE_USAGE_CALL_MINUTES_METER_EVENT`,
`STRIPE_USAGE_EMAILS_PRICE_ID`, `STRIPE_USAGE_EMAILS_METER_EVENT`,
`STRIPE_USAGE_COMPUTER_MINUTES_PRICE_ID`, `STRIPE_USAGE_COMPUTER_MINUTES_METER_EVENT`,
`STRIPE_USAGE_NUMBER_ADDON_PRICE_ID`, `STRIPE_USAGE_EMAIL_ADDON_PRICE_ID`.

## Rollout

| Stage | What                                                                                                                                                                                                                                                  |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Validate with the flag off. Migrations 0187, 0188 and 0189 must be installed through the reviewed release path before deploying this source, including the new nullable fields used by existing checkout/task queries.                                      |
| 1     | Use the approved rates in the BotBound Stripe account (`acct_1TkyXL8e6If87QKm`), test mode only: dry run, then `--apply`, staging configuration and an isolated database, then prove a test-clock invoice (base, tiered minutes, add-ons, cap clamp). |
| 2     | After the proof: `--apply --live --rates-approved`, set env vars, flip `USAGE_BILLING_ENABLED=true`, redeploy.                                                                                                                                        |
| 3     | Lift the 120-mark ceiling per workspace.                                                                                                                                                                                                              |

## Known follow-ups before stage 2

- A call's maximum length is not yet bounded by cap headroom, so calls already in progress can run
  past the cap; the clamp keeps that time off the invoice.
- Computer minutes count task wall time.
- The bounded "test my phone" flow still requires prepaid call funding. Add usage-plan
  funding support and prove that flow before offering the usage plan to customers.
- Prove final settlement for cancellation, delayed provider receipts, mid-period add-on changes
  and invoice finalization. These cases retain their receipts as `reconciliation_required` and
  do not automatically submit an amount to a possibly finalized invoice. Enabling live billing
  requires an operator reconciliation procedure and a tested final-invoice policy.
- Prove provider meter aggregation and invoice payment in BotBound test mode. A successful paid
  signup on the earlier package plans does not validate this usage catalog or its meter cycle.
- Include applicable tax in invoice proof. Pricing, Billing and spend-alert copy disclose
  that the limit covers pre-tax BotBound charges, with tax added separately.

## Purchase and settlement safeguards

Public usage links preserve the monthly plan and optional number/mailbox choices through signup
and activation. Public usage copy requires checkout availability, including all six offered prices.
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
