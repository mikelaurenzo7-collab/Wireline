# Wireline Billing Catalog Direction

Canonical operating proof runbook: [BILLING_RUNBOOK.md](./BILLING_RUNBOOK.md).

**Status:** the "Target commercial structure," "Pricing lock," and "Exact applied Stripe writes"
sections below are historical records of earlier 2026 catalog experiments. The live self-serve
catalog is **Founder Early Access v6**: Free Builder plus four paid tiers with guaranteed included
voice minutes, a recurring monthly Runtime Allowance, flat $0.22/min Runtime Balance top-ups, and a
licensed extra-agent add-on. **`src/lib/plan-catalog.ts` is the single source of truth** for plan
ids, prices, included voice minutes, Runtime Allowance, overage rates, and Stripe price/lookup-key
resolution. Treat any duplicated number in docs as stale unless it has just been verified against
that file and the live Stripe catalog.

## Product model

Wireline sells operating capacity, not template access.

- All templates are unlocked; Personal ("Free Builder") creates, trains, and privately simulates one draft agent at $0.
- Every paid tier (Starter, Starter Plus, Pro, Business) guarantees live voice capacity and an on-demand number slot — see `voice_minutes_monthly` per plan in `plan-catalog.ts`.
- Optional SMS and business-artifact generation draw from a smaller flexible monthly Runtime Allowance included in the same subscription (`runtime_allowance_usd_monthly`), funded every billing period rather than as a one-time welcome credit. Platform AI, live research, and enrichment use a separate catalog allowance (`ai_spend_allowance_usd_monthly`), where every platform-funded provider call — model turns, Perplexity research, platform-key Apollo enrichment — is metered per account. The hard floor reserves voice, Runtime Allowance, and AI allowance simultaneously; `npm run economics:report` proves both billing intervals from source.
- Live work should always reconcile through a durable ledger instead of vague "unlimited" promises.

## Current commercial structure (Founder Early Access, live in Stripe as of 2026-07-10)

| Plan id | Product name | Monthly / Annual | Voice min | Runtime | Managed AI | Max agents | Number slots |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `personal` | Wireline Free Builder | $0 | 0 | $0 | $1.50 simulation | 1 draft | 0 |
| `starter` | Wireline Starter | $19 / $190 | 50 | $1/mo | $1.50/mo | 1 | 1 |
| `team` | Wireline Starter Plus | $39 / $390 | 100 | $3/mo | $3/mo | 2 | 2 |
| `business` | Wireline Pro | $79 / $790 | 190 | $6/mo | $6/mo | 5 | 5 |
| `enterprise` | Wireline Business | $159 / $1,590 | 350 | $12/mo | $12/mo | 15 | 15 |

The August 2026 launch review corrected a reachable split-meter defect before the first
production subscriber: voice, Runtime Allowance, and AI spend could all be consumed independently,
while the former margin gate reserved only the first two. The revised capacities keep the existing
prices and prepaid-only experience while every monthly and annual plan remains above the 30%
contribution floor at simultaneous full utilization. There were no production customers to migrate.

The optional $19/month Live Video add-on is separate from voice capacity. It includes 60
reserved presenter-session minutes per UTC month. Each session token reserves 5 minutes
atomically before provider minting (`LIVE_VIDEO_SESSION_RESERVATION_MINUTES`); the runtime
pauses at the allowance and never creates automatic overage. This preserves an estimated
~53.3% full-use contribution margin at a conservative $0.13/min provider reserve
(`LIVE_VIDEO_PROVIDER_COST_PER_MINUTE_USD`) after Payments, Billing, future Tax, and fixed
fees — above the 50% floor `LIVE_VIDEO_MIN_FULL_USE_MARGIN` enforces.

Runtime Balance top-ups cover extra voice at a flat **$0.22/min** across paid tiers; there are no
automatic postpaid overages. SMS outbound segments still bill Runtime Balance at **$0.02/segment**
(`SMS_COST_PER_SEGMENT_USD` in `src/lib/sms-billing.ts`).

## Call length vs the "8 second" research timeout (locked 2026-07-20)

**There is no 8-second call-duration budget.** `LIVE_RESEARCH_TIMEOUT_MS` (default `8000`) is only the
HTTP timeout for mid-call *public web research* (Perplexity → Gemini) so a caller is not held in
silence while a lookup runs. PSTN calls continue for as long as the conversation needs.

Commercial protection is minutes + prepaid wallet, not call hard-caps:

1. **Included monthly voice minutes** per paid tier (and +50 min per extra-agent add-on).
2. **Conversation Balance top-ups** fund overflow at the plan's `overage_per_min_usd` — no silent
   postpaid meter, no surprise invoice.
3. **Active calls finish normally**; depleted coverage blocks only the *next* new live action.
4. Soft near-limit warnings in product UI; hard gate only when coverage is gone.

This is the intentional "happy user + protected margin" model. Do **not** reintroduce artificial
short call caps for profitability, and do not rebuild the Stripe catalog unless
`plan-catalog.ts` / live Stripe prices actually diverge.

## Target commercial structure (historical — see status note above)

| Offer                | Commercial role                                     | Billing expectation                                                             |
| -------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------- |
| Personal             | Solo or founder use                                 | No required subscription; live work funded through Conversation Balance top-ups |
| Team                 | Shared SMB coverage                                 | Recurring capacity tier plus Conversation Balance                               |
| Business             | Revenue, support, and front desk teams              | Recurring capacity tier plus pooled Conversation Balance                        |
| Enterprise           | Governed rollout, SSO, policy, audit, BYO telephony | Annual committed usage and contract terms                                       |
| Conversation Balance | One-time funding                                    | Web checkout only; customer-controlled top-ups                                  |

## Live Stripe audit snapshot (historical — see status note above)

- Active subscriptions: `0`
- Active payment links: `0`
- Open checkout sessions: `0`
- Active products now match the capacity catalog.

Current active products after reconciliation:

- `Conversation Balance`
- `Wireline Business`
- `Wireline Enterprise`
- `Wireline Personal`
- `Wireline Team`

## Exact applied Stripe writes (historical — DO NOT APPLY)

Status: **Historical / superseded.** These writes targeted the retired Wireline Stripe
account `acct_1TXb0SJohDtfy3Ik` and an older Team/Business price sheet. **Do not paste
these price writes into Stripe or Vercel.** Current live catalog: Cadence AI
`acct_1TkyXL8e6If87QKm` — see `docs/P0_BILLING_OPS_NOTE.md` and `src/lib/plan-catalog.ts`.

Applied historically on the retired Wireline Stripe account `acct_1TXb0SJohDtfy3Ik`.

1. Updated product `Wireline Personal`
   Price writes: none
   Reason: Personal stays create-free and top-up led. Do not create a recurring personal subscription.
2. Updated product `Wireline Team`
   Prices:
   - Monthly recurring: `$29`
   - Annual recurring: `$278`
   - Extra agent recurring: `$8`
   - Metered voice overage: `$0.16/min`, backed by Stripe Billing Meter `voice_minutes_overage`
     Metadata:
   - `wireline_plan_id=team`
   - `wireline_billing_model=capacity_plus_conversation_balance`
3. Create product `Wireline Business`
   Prices:
   - Monthly recurring: `$59`
   - Annual recurring: `$566`
   - Extra agent recurring: `$10`
   - Metered voice overage: `$0.16/min`, backed by Stripe Billing Meter `voice_minutes_overage`
     Metadata:
   - `wireline_plan_id=business`
   - `wireline_billing_model=capacity_plus_conversation_balance`
4. Updated product `Wireline Enterprise`
   Price writes: none for self-serve
   Reason: keep Enterprise contact-sales only until contract and committed-usage operations are live.
5. Updated product `Conversation Balance`
   Prices:
   - One-time top-up: `$5`
   - One-time top-up: `$10`
   - One-time top-up: `$25`
   - One-time top-up: `$50`
     Reason: fixed top-up prices support catalog clarity while the app can still use dynamic Checkout `price_data` for controlled amounts.

- Live work bills at published rates with **zero included voice minutes** on all tiers.
- Personal Conversation Balance: **$0.18/min**. Team/Business metered voice: **$0.16/min**.
- First Team/Business subscription grants **$10** welcome Conversation Balance (idempotent ledger grant).
- SMS outbound segments bill Conversation Balance at **$0.02/segment**.

## Pricing lock (Jul 2026) (historical — superseded by Founder Early Access above)

| Offer | Platform | Voice | Extra agent |
| --- | ---: | ---: | ---: |
| Personal | $0 | $0.18/min (balance) | — |
| Team | $29/mo | $0.16/min | $8/mo |
| Business | $59/mo | $0.16/min | $10/mo |

Capacity sells agents, lines, routing, and governance — not bundled minutes.

## Current env mapping

Vercel envs intentionally keep a few transitional names while Stripe products carry the clearer
Founder Early Access v6 names. Do not infer the plan from the env-var label; resolve through
`src/lib/plan-catalog.ts`, lookup keys, and Stripe price metadata.

| Env var | Live product / interval |
| --- | --- |
| `STRIPE_STARTER_9_PRICE_ID` | Wireline Starter monthly |
| `STRIPE_STARTER_9_ANNUAL_PRICE_ID` | Wireline Starter annual |
| `STRIPE_STARTER_PRICE_ID` | Wireline Starter Plus monthly |
| `STRIPE_STARTER_ANNUAL_PRICE_ID` | Wireline Starter Plus annual |
| `STRIPE_TEAM_PRICE_ID` | Wireline Pro monthly |
| `STRIPE_TEAM_ANNUAL_PRICE_ID` | Wireline Pro annual |
| `STRIPE_BUSINESS_PRICE_ID` | Wireline Business monthly |
| `STRIPE_BUSINESS_ANNUAL_PRICE_ID` | Wireline Business annual |
| `STRIPE_EXTRA_AGENT_PRICE_ID` | Extra Agent + 50 Minutes add-on |
| `STRIPE_LIVE_VIDEO_ADDON_PRICE_ID` | Live Video add-on |
| `STRIPE_LIVE_VIDEO_MONTHLY_PRICE_ID` | Live Video monthly alias |

Retired zero-included-minutes price env vars and OpenRouter-era runtime assumptions must stay out of
new deploy guidance. Stripe secrets and webhook secrets are separate credentials and must not be
renamed with catalog changes.

## Migration guardrails

- Do not archive or delete anything tied to active subscriptions.
- Do not archive or delete anything tied to active payment links until replacements exist.
- Preserve internal plan ids in code until subscription storage, entitlements, and webhook sync are migrated safely.
- Keep top-up funding idempotent through ledger references and Stripe invoice or session identifiers.
- Do not mutate old SKUs in place unless the app is explicitly hardcoded to them.

## Archived or retired products

Archived products:

- `Wireline Plus`
- `Wireline Household`
- `Wireline Custom`
- `Wireline Concierge`
- `Wireline Everyday`
- `Office Assistant`
- `Front Desk`
- `Sales & Reception`

Previously retired or inactive products no longer active in the catalog:

- `Solo Agent`
- `Custom Enterprise`

Stripe blocks archival of a product's default price. The retired consumer products are inactive, but their default price IDs may remain technically active under inactive products.

## Public positioning and cross-surface consistency

Wireline's commercial story is intentionally narrow and repeatable:

- **Create free** — short intake, no subscription wall, all templates unlocked.
- **Train deeply** — facts, instructions, voice, memory, and sources live in Training, not checkout.
- **Fund live work** — Runtime Balance is customer-controlled; Free Builder never requires a plan.
- **Buy capacity when shared** — Starter, Starter Plus, Pro, and Business add live agents, number slots, governance, and included usage.

These messages must stay aligned across:

| Surface                   | Canonical copy anchor |
| ------------------------- | --- |
| `/pricing`                | Founder Early Access v6 from `src/lib/plan-catalog.ts` |
| Billing settings          | "Start free. Fund live work." |
| Runtime Balance API       | `CONVERSATION_BALANCE_COPY` in `src/lib/conversation-balance.ts` |
| Stripe catalog            | Product names and lookup keys generated by `scripts/lib/stripe-founder-catalog.mjs` |
| ChatGPT MCP widgets       | Wireline Letterpress tokens via `src/lib/wireline-mcp-widget-styles.ts` |
| iOS / Android / extension | Generated `WirelineDesignTokens` from `design-tokens/wireline.tokens.json` |

## Still required before live rollout

1. Re-run production checkout, webhook, portal, and billing-status verification after the next Vercel deployment reaches READY.
2. Confirm prepaid Runtime Balance top-ups and included-minute burn remain the only overflow path (no Stripe metered postpaid overage).
3. Keep Enterprise contact-sales until contract, committed-usage operations, and implementation controls are ready.
4. Enforce custom-auth breached-password screening before public launch.
