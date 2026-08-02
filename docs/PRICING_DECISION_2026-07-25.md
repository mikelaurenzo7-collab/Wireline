# Pricing Decision — 2026-07-25 (founder catalog v6)

Status: **Active — decided and executed 2026-07-25.** This document records
the deep pricing audit, the analysis, and the decision for the founder
catalog now live. A 2026-07-29 launch-hardening review then reserved Stripe
Billing and future Stripe Tax transaction fees in every margin check and
trimmed Pro from 250 to 245 included minutes to preserve the 30% annual
full-utilization floor. Execution followed the checklist below: v6 prices minted in
Stripe alongside v5, the code/catalog sweep landed with the two-floor policy,
Vercel plan price-id env vars were updated to the v6 ids, and the v5
recurring prices were archived once the deploy served v6. Supersedes the *conclusions* (not the method) of
`PLAN_CAPACITY_HEADROOM_2026-07-25.md`, whose margin arithmetic remains the
reference model and which explicitly anticipated this decision: *"Lower the
floor… is a deliberate business decision, not a code change."* That decision
is made here, by the founder's direction, together with a price restructure.

## Context that makes this cheap to do now

Verified live on 2026-07-25 against the production Stripe account:
**zero subscriptions (any status), zero charges.** There is no grandfathering,
proration, or migration surface. This is the one moment a full repricing is
free; the window closes with the first paying customer.

Operating reality: solo founder, no payroll, all costs variable except a small
fixed SaaS stack. Optimization target stated by the founder: user-friendly,
still profitable. Translated into constraints: no bill shock (keep
prepaid-only overflow), self-serve everything, few concepts, honest headline
capacity, margins that survive worst-case utilization without babysitting.

## Audit — what is wrong with v5

Current v5: Starter $9/$99 (20 min), Starter Plus $24/$240 (55), Pro $59/$590
(120), Business $149/$1490 (285); allowances $0.50/$1/$4/$10; overage
$0.25/$0.22/$0.19/$0.17; extra agent $15 (+50 min, +1 number); top-ups
$10/$25/$50/$100; Free Builder $0.

1. **The effective per-minute ladder is inverted.** $9/20 = $0.45/min,
   $24/55 = $0.44, $59/120 = $0.49, $149/285 = $0.52. The biggest plan is the
   worst minutes-per-dollar deal on the page. Internally justified (numbers
   and agents scale too), but buyers compare this number first.
2. **Starter's included capacity is experientially broken.** 20 min/mo is
   ~40 seconds of calling per business day. A real user exhausts it in week
   one, then meets top-up friction while paying $9 — the plan converts
   curiosity and then manufactures disappointment. The headroom doc proved 20
   is the *maximum* the 45% full-use floor allows at $9/$99: the price point
   is what is wrong, not the minute count.
3. **Stripe's fixed fee makes $9 structurally bad.** $0.56 of every $9 month
   (6.2%) is processing before any COGS. Entry customers also generate the
   same support load as $149 customers — negative-margin work for a solo
   operator.
4. **The annual ladder is inconsistent and inverted in generosity.** Starter
   annual $99 is ~1 month free (8.3%) while every other tier gives 2 months
   (16.7%) — the cheapest plan gets the worst deal, and annual is the
   margin-binding side everywhere.
5. **Six pricing concepts.** Guaranteed minutes, dollar Runtime Allowance,
   prepaid Runtime Balance, four per-plan overage rates, an extra-agent
   add-on, a video add-on. The four overage rates buy ~pennies of
   differentiation at real volumes and cost a paragraph of explanation.
6. **The single 45%-at-100%-utilization floor is the binding constraint on
   user-friendliness.** It reserves every included minute, every number, and
   the whole allowance as consumed COGS. Real entry-tier utilization will run
   well under that; unused voice minutes cost $0. A prepaid-only system
   bounds the worst case by design — the floor double-insures against a risk
   the billing model already caps.
7. **Positioning.** Managed AI-phone competitors cluster at ~$29+ entry or
   $0.25–$0.40/min. v5's subscription minutes at $0.44–$0.52 effective
   under-tell the story of a product that is a whole AI-employee workspace
   (voice + SMS + email + Lead Hunt + approvals), not a dialer.

## Policy decision — two-floor margin gate

The single floor (≥45% contribution at 100% utilization) is replaced by:

- **Planning floor: ≥45% contribution at 70% expected utilization** of
  minutes and allowance (numbers always reserved at 100% — a provisioned line
  bills regardless of use). This is the bar new catalog numbers are designed
  against.
- **Hard floor: ≥30% contribution at 100% utilization, annual interval**
  (always the binding side). No plan may breach this even if every customer
  maxes everything — the bounded worst case of a prepaid-only system.

Rationale: with no payroll and no auto-overage exposure, a 30% worst-case
floor still pays for the fixed stack within a handful of subscribers, while
the 70%-utilization planning bar restores honest, competitive included
capacity. `VOICE_VARIABLE_COST_PER_MIN_USD = $0.128` stays conservative and
untouched; the $0.14 COGS-drift alarm stays.

## The decision — catalog v6

| Plan (public name) | id | Price mo / yr | Agents | Numbers | Minutes | Allowance |
| ------------------ | -- | ------------- | ------ | ------- | ------- | --------- |
| Free Builder | `personal` | $0 | 1 draft | 0 | 0 | $0 |
| Starter | `starter` | **$19 / $190** | 1 | 1 | **60** | **$1** |
| Starter Plus | `team` | **$39 / $390** | 2 | 2 | **120** | **$3** |
| Pro | `business` | **$79 / $790** | 5 | 5 | **245** | **$6** |
| Business | `enterprise` | **$159 / $1,590** | 15 | 15 | **450** | **$12** |

Unchanged on purpose: prepaid-only overflow (no automatic overages), Runtime
Balance denominations ($10/$25/$50/$100), extra-agent add-on ($15 → +1 agent,
+50 min, +1 number — clears both floors as-is), Live Video add-on ($19 →
60 reserved session minutes/month, reserved in 10-minute sessions, no automatic overage),
Free Builder as the trial (build/train/simulate free, pay to go live), public
plan names and canonical plan ids (zero alias/schema churn).

Simplified: **one flat top-up/overage rate of $0.22/min on every plan**
(replaces $0.25/$0.22/$0.19/$0.17; 42% margin over blended COGS), and
**annual = exactly 2 months free on every tier** (fixes the Starter annual
asymmetry).

### Why these numbers

- **Effective rate flattens at ~$0.32/min** — $19/60 = $0.317, $39/120 =
  $0.325, $79/245 = $0.322, $159/450 = $0.353 (top premium carried by 15
  numbers/agents). The inversion is gone; every tier's headline is a better
  deal than v5's best tier.
- **~2× ladder** ($19→$39→$79→$159): each step roughly doubles capacity and
  price — trivial to reason about, no dead zones.
- **Entry moves $9→$19 with 3× the minutes.** $19 filters for intent (the
  support cost of a $9 customer exceeds the margin), roughly halves Stripe's
  fixed-fee share, undercuts the ~$29 competitor entry cluster, and delivers
  a month of real usage instead of a week.
- **2-agent tier keeps the founder hybrid pair** (personal Concierge +
  business employee) as the differentiated mid-step.

### Floor verification (annual = binding; voice $0.128/min, number $1.15/mo)

Stripe reserve per successful charge: Payments 2.9% + $0.30, Billing 0.7%,
and a conservative future Tax transaction reserve of 0.5%. The live account
has no tax registrations yet; reserving the fee now prevents registration
from silently breaking catalog economics later.

Hard floor — 100% utilization, annual revenue/mo vs reserved COGS/mo:

| Plan | Rev/mo | Voice | Numbers | Allow. | Stripe | Margin |
| ---- | ------ | ----- | ------- | ------ | ------ | ------ |
| Starter $190 | 15.83 | 7.68 | 1.15 | 1.00 | 0.67 | **33.7%** |
| Starter Plus $390 | 32.50 | 15.36 | 2.30 | 3.00 | 1.36 | **32.3%** |
| Pro $790 | 65.83 | 31.36 | 5.75 | 6.00 | 2.72 | **30.4%** |
| Business $1,590 | 132.50 | 57.60 | 17.25 | 12.00 | 5.46 | **30.3%** |

All ≥30% at absolute worst case after the complete commercial-fee reserve.
Monthly-interval full-use margins run 41–42.6%. Planning-floor margins at 70%
utilization run 54–56% monthly and 46–50% annual, so every tier clears 45% on
both intervals. Blended at realistic usage, contribution stays in the 50s;
the fixed stack is covered by roughly five Starter Plus subscribers.

## Execution checklist (next pass — order matters)

The v6 prices are new Stripe objects; checkout rejects any price whose
`wireline_catalog_version` metadata mismatches the code. Sequence to keep
checkout up throughout:

1. Author v6 in `scripts/lib/stripe-founder-catalog.mjs`
   (`founder_early_access_2026_07_v6`, `*_founder_2026_07_v6` lookup keys,
   new amounts/minutes/copy) and run `npm run stripe:setup` so live Stripe
   carries v6 products/prices *alongside* v5.
2. Update `src/lib/plan-catalog.ts` (prices, minutes, allowances, flat
   `overage_per_min_usd: 0.22`, features copy, new fallback price ids,
   `FOUNDER_CATALOG_VERSION = …v6`) and the two-floor margin helpers; update
   `assertPlanMarginFloors()` to check both floors on both intervals.
3. Propagate per the headroom doc's checklist: `check-stripe-catalog-contract`
   `expectedCapacity`, `src/data/wireline-knowledge.ts` plan facts,
   `plan-catalog.test.ts`, `round6-margin-capacity-contract.test.ts` (rewrite
   to the two-floor policy), pricing/marketing pages and their contract
   tests, `docs/WIRELINE_CEO_LAUNCH_CHECKLIST_2026-07-10.md`.
4. Update Vercel env price-id vars (`STRIPE_*_PRICE_ID`) to the v6 ids via
   `npm run stripe:sync-vercel` (or set fallback ids only — env overrides win
   when present, so stale env vars are the classic way to serve v5 by
   accident).
5. Deploy, run `npm run stripe:catalog:check` + checkout smoke, then archive
   (deactivate) the v5 recurring prices in Stripe so they can never be bought.

## Risks and reversals

- **Worst-case margin is now 30%, not 45%.** Accepted deliberately; bounded
  by prepaid-only overflow and revisited at the $0.14 COGS alarm or first
  sustained >80% fleet utilization.
- **$19 entry may slow raw signup counts** vs $9. Accepted: Free Builder
  remains the $0 top-of-funnel, and the customers lost are the ones that cost
  more than they pay.
- Zero subscribers means every change here is reversible until the first
  checkout completes — after that, any further repricing needs a
  grandfathering plan.
