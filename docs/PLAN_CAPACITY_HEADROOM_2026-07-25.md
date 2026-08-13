# Plan Capacity Headroom — 2026-07-25

Status: **Active methodology; historical v5/v6 result.** The launch-safe v6
amendment is recorded in `business-usage-pricing-decision.md`. Re-run this model
before changing any plan price, included minute count, included number count,
Runtime Allowance, AI allowance, or commercial-fee assumption.

## The question

Can included voice minutes go up without making a plan unprofitable?

## The model

Everything comes from `src/lib/plan-catalog.ts`. Nothing here is a new
assumption:

| Input                            | Value          |
| -------------------------------- | -------------- |
| `VOICE_VARIABLE_COST_PER_MIN_USD`| $0.128         |
| `PHONE_NUMBER_COST_MONTHLY_USD`  | $1.15          |
| `PAYMENT_PROCESSING_RATE`        | 2.9%           |
| `PAYMENT_PROCESSING_FIXED_USD`   | $0.30          |
| `STRIPE_BILLING_RATE`             | 0.7%           |
| `STRIPE_TAX_TRANSACTION_RATE`     | 0.5% reserve   |
| `LAUNCH_CONTRIBUTION_MARGIN_FLOOR`| 45% at 70% use |
| `HARD_CONTRIBUTION_MARGIN_FLOOR`  | 30% at full use|
| `COGS_DRIFT_THRESHOLD_PER_MIN_USD`| $0.14 (alarm) |

Contribution at full included utilization reserves *every* included minute,
*every* number slot, the whole Runtime Allowance, and the independently metered
AI allowance as consumed COGS. This is conservative but reachable: each meter
can be exhausted without debiting the other three.

## The binding constraint is annual, not monthly

Annual bills at a discount (most tiers are ~2 months free) while the reserved
monthly COGS is unchanged. **Annual is therefore always the tighter side**, and
it is the number that decides how many minutes a plan can carry.

Until this pass, `assertPlanMarginFloors()` only ever evaluated the monthly
interval, so the launch-readiness gate was watching the slack side. It now
checks both.

## Historical v6 validation — 2026-07-29

The launch-hardening pass added Stripe Billing and a conservative future Tax
transaction reserve to the shared fee helper. Pro moved from 250 to **245**
minutes so every paid tier still clears both floors on both billing intervals.
No catalog-version bump is required because prices and checkout compatibility
did not change.

| Plan | Current minutes | Annual full-use | Annual expected-use |
| ---- | --------------- | --------------- | ------------------- |
| Starter | 60 | 33.7% | 50.1% |
| Starter Plus | 120 | 32.3% | 49.2% |
| Pro | **245** | **30.4%** | 47.4% |
| Business | 450 | **30.3%** | 46.1% |

The full-use figures include Payments, Billing, and Tax transaction reserves;
expected-use applies the catalog's 70% minute and Runtime Allowance assumption.

## Launch-safe v6 amendment — 2026-08-13

The historical calculation omitted the separate account AI-spend envelope even
though it was independently consumable. Simultaneous full use could therefore
drive every plan below the certified floor. With no production subscriptions,
Wireline corrected the promise before launch: 50 / 100 / 190 / 350 voice
minutes and explicit $1.50 / $3 / $6 / $12 AI allowances. The hard and expected
floors now reserve voice, numbers, Runtime Allowance, AI allowance, and Stripe
fees together. `npm run economics:report` is the canonical live proof.

## Historical v5 result

Maximum included minutes at the former 45% full-utilization floor, and what
shipped before v6:

| Plan                       | Max (monthly) | Max (annual) | Was | Now  | Annual margin | At $0.14 drift |
| -------------------------- | ------------- | ------------ | --- | ---- | ------------- | -------------- |
| Starter ($9 / $99)         | 21            | **20**       | 20  | 20   | 45.8%         | 42.9%          |
| Starter Plus ($24 / $240)  | 69            | **55**       | 50  | 55   | 45.3%         | 42.0%          |
| Pro ($59 / $590)           | 161           | **123**      | 100 | 120  | 46.0%         | 43.0%          |
| Business ($149 / $1490)    | 391           | **292**      | 250 | 285  | 45.8%         | 43.0%          |

Pro and Business were left a few minutes under their ceiling so a cost blip
does not immediately breach the floor. Every raised plan still clears 40%
contribution even if blended voice COGS drifts all the way to the $0.14/min
pricing-review alarm — locked by
`tests/round6-margin-capacity-contract.test.ts`.

## Why Starter did not move

Starter is the one tier with no headroom, and it is worth understanding why
before anyone tries to "fix" it by lowering the floor.

At $99/yr the plan earns $8.25/month. Against that it reserves:

```
voice     20 x $0.128 = $2.56
number     1 x $1.15  = $1.15
runtime               = $0.50
Stripe   (99 x 2.9% + $0.30) / 12 = $0.26
                        ------
                        $4.47   -> 45.8% contribution
```

Only $0.07/month of room remains — about half a minute. The costs that crowd
it out are structural, not wasteful: a dedicated phone line is $1.15 whatever
the plan costs, and Stripe's fixed $0.30 is a far larger share of $8.25 than of
$124.

So the levers for a more competitive entry tier are, in order of directness:

1. **Raise the annual price.** $99/yr is 11 months of $9. At $108/yr (no annual
   discount) Starter clears 45% at 26 minutes. Even $105 buys ~4 more minutes.
   This trades annual-conversion incentive for headline capacity.
2. **Raise the monthly price.** $12/mo carries 33 minutes at the floor.
3. **Lower the floor.** Defensible for a solo founder with no payroll — 45% is
   a conservative SaaS bar — but it is a deliberate business decision, not a
   code change, and it should be made explicitly rather than by editing a
   constant.

Nothing here recommends fabricating headroom by trimming the reserve inputs.
The conservatism in `VOICE_VARIABLE_COST_PER_MIN_USD` and the full-capacity
number reservation is what protects a solo operator from a single heavy
account.

## Propagation checklist

Included minutes are echoed in more places than the catalog. When they change:

- `src/lib/plan-catalog.ts` — `voice_minutes_monthly` **and** the `features` copy
- `src/lib/plan-catalog.ts` — `ai_spend_allowance_usd_monthly`
- `scripts/lib/stripe-founder-catalog.mjs` — product + price `included_voice_minutes`
- `scripts/check-stripe-catalog-contract.mjs` — `expectedCapacity`
- `src/data/wireline-knowledge.ts` — the plan facts the agent quotes
- `src/lib/plan-catalog.test.ts`, `tests/round6-margin-capacity-contract.test.ts`
- `docs/WIRELINE_CEO_LAUNCH_CHECKLIST_2026-07-10.md`

Live Stripe price **metadata** (`included_voice_minutes`) is descriptive only —
entitlements resolve from `plan-catalog.ts`, not from Stripe — but it should be
re-synced so the live catalog audit does not report drift. Do **not** bump
`FOUNDER_CATALOG_VERSION` for a minutes change: checkout rejects any price whose
`wireline_catalog_version` metadata does not match, so bumping it without
re-running the Stripe sync takes checkout down.
