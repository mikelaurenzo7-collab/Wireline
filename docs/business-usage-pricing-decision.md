# BotBound Billing Catalog Direction

Canonical operating proof runbook: [BILLING_RUNBOOK.md](./BILLING_RUNBOOK.md).

**Status:** the "Target commercial structure," "Pricing lock," and "Exact applied Stripe writes"
sections below are historical records of earlier 2026 catalog experiments. The live self-serve
catalog is **Founder Early Access v6**: Free Builder plus three public paid tiers with guaranteed included
voice minutes, a recurring monthly Runtime Allowance, flat $0.22/min Runtime Balance top-ups, and a
licensed extra-Bot add-on. **`src/lib/plan-catalog.ts` is the single source of truth** for plan
ids, prices, included voice minutes, Runtime Allowance, overage rates, and Stripe price/lookup-key
resolution. Treat any duplicated number in docs as stale unless it has just been verified against
that file and the live Stripe catalog.

## Product model

BotBound sells operating capacity, not audience modes or template access.

- All role starters are unlocked; Free Builder (legacy internal id `personal`) creates, trains, and privately simulates one draft Bot at $0.
- Every public paid tier (Starter, Starter Plus, Pro) guarantees live voice capacity and an on-demand number slot — see `voice_minutes_monthly` per plan in `plan-catalog.ts`. Larger Scale rollouts are sales-assisted.
- Optional SMS and shareable-artifact generation draw from a smaller flexible monthly Runtime Allowance included in the same subscription (`runtime_allowance_usd_monthly`), funded every billing period rather than as a one-time welcome credit. Platform AI, live research, and enrichment use a separate catalog allowance (`ai_spend_allowance_usd_monthly`), where every platform-funded provider call—model turns, Perplexity research, platform-key Apollo enrichment—is metered per account. The hard floor reserves voice, Runtime Allowance, and AI allowance simultaneously; `npm run economics:report` proves both billing intervals from source.
- Live work should always reconcile through a durable ledger instead of vague "unlimited" promises.

## Current commercial structure (Founder Early Access, live in Stripe as of 2026-07-10)

| Plan id    | Product name          | Monthly / Annual | Voice min | Runtime |       Managed AI | Max Bots | Number slots |
| ---------- | --------------------- | ---------------: | --------: | ------: | ---------------: | -------: | -----------: |
| `personal` | BotBound Free Builder |               $0 |         0 |      $0 | $1.50 simulation |  1 draft |            0 |
| `starter`  | BotBound Starter      |       $19 / $190 |        50 |   $1/mo |         $1.50/mo |        1 |            1 |
| `team`     | BotBound Starter Plus |       $39 / $390 |       100 |   $3/mo |            $3/mo |        2 |            2 |
| `business` | BotBound Pro          |       $79 / $790 |       190 |   $6/mo |            $6/mo |        5 |            5 |

The legacy `enterprise` catalog row remains in code and Stripe for historical
event and entitlement resolution. It is `public: false`: public discovery and self-serve checkout
stop at Pro, then route larger deployments to a custom Scale agreement.

The August 2026 launch review corrected a reachable split-meter defect before the first
production subscriber: voice, Runtime Allowance, and AI spend could all be consumed independently,
while the former margin gate reserved only the first two. The revised capacities keep the existing
prices and prepaid-only experience while every monthly and annual plan remains above the 30%
contribution floor at simultaneous full utilization. There were no production customers to migrate.

The former $19/month Live Video add-on is fully retired. Checkout, entitlement,
session minting, and creative publication remain closed (`addonOffered: false`).
Leftover `STRIPE_LIVE_VIDEO_*` price IDs are webhook-only so historical
subscriptions can still sync; do not advertise, regenerate, or re-offer the
talking-head SKU.

Runtime Balance top-ups cover extra voice at a flat **$0.22/min** across paid tiers; there are no
automatic postpaid overages. SMS outbound segments still bill Runtime Balance at **$0.02/segment**
(`SMS_COST_PER_SEGMENT_USD` in `src/lib/sms-billing.ts`).

## Call length and the "8 second" research timeout (updated 2026-09-19)

`LIVE_RESEARCH_TIMEOUT_MS` (default `8000`) limits one mid-call public-web research request
(Perplexity → Gemini). It does not set the phone call's duration.

Standard live SIP calls support **up to 60 minutes per session**, matching OpenAI's session
maximum. The runtime default and upper bound are 3,600 seconds. A positive
`OPENAI_SIP_MAX_CALL_SECONDS` can set a shorter limit, with a 30-second minimum; an existing
explicit value of `300` continues to limit that deployment to five minutes until updated.
Private browser rehearsals and limited take-a-message flows retain a five-minute maximum;
suspended-account notices remain limited to 20 seconds.

Production call admission on Render, and on any legacy Vercel rollback, requires a configured persistent voice worker. Deploy and
verify that worker, then align the web and worker duration configuration before enabling longer
live calls. Missing worker configuration fails closed. A configuration change alone does not
prove a long call survives deployment boundaries; exercise the worker and carrier path before
advertising deployment readiness.

Balance protection and session duration have separate rules:

1. **Included monthly voice minutes** apply per paid tier, with +50 minutes per extra-Bot add-on.
2. **Runtime Balance top-ups** fund overflow at the plan's `overage_per_min_usd`, with no automatic
   postpaid meter or surprise invoice.
3. **An admitted standard live call is not terminated when balance depletes.** Depleted coverage
   blocks the next new live action. Normal hangup, transfer, safety termination, and the session
   duration limit still apply.
4. Soft near-limit warnings keep spend visible. Session-limit warnings help callers wrap up;
   they do not promise unlimited duration or seamless continuation into another session.

Keep margin protection in included capacity, prepaid balance, and new-action admission. Preserve
the provider's session boundary, and do not rebuild the Stripe catalog unless `plan-catalog.ts`
and live Stripe prices diverge.

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

Products active in that historical snapshot:

- `Conversation Balance`
- `Wireline Scale & Enterprise` (sales-assisted; no self-serve price)
- `Wireline Enterprise`
- `Wireline Personal`
- `Wireline Team`

## Exact applied Stripe writes (historical — DO NOT APPLY)

Status: **Historical / superseded.** These writes targeted the retired Wireline Stripe
account `acct_1TXb0SJohDtfy3Ik` and an older Team/Business price sheet. **Do not paste
these price writes into Stripe or Vercel.** The current live catalog belongs to the BotBound
account `acct_1TkyXL8e6If87QKm`; `Cadence AI` was its former label in July audit evidence and is
not the current public identity. See `docs/P0_BILLING_OPS_NOTE.md` and `src/lib/plan-catalog.ts`.

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

| Offer    | Platform |               Voice | Extra agent |
| -------- | -------: | ------------------: | ----------: |
| Personal |       $0 | $0.18/min (balance) |           — |
| Team     |   $29/mo |           $0.16/min |       $8/mo |
| Business |   $59/mo |           $0.16/min |      $10/mo |

Capacity sells agents, lines, routing, and governance — not bundled minutes.

## Current env mapping

Vercel envs intentionally keep a few transitional names while Stripe products carry the clearer
Founder Early Access v6 names. Do not infer the plan from the env-var label; resolve through
`src/lib/plan-catalog.ts`, lookup keys, and Stripe price metadata.

| Env var                              | Live product / interval             |
| ------------------------------------ | ----------------------------------- |
| `STRIPE_STARTER_9_PRICE_ID`          | BotBound Starter monthly            |
| `STRIPE_STARTER_9_ANNUAL_PRICE_ID`   | BotBound Starter annual             |
| `STRIPE_STARTER_PRICE_ID`            | BotBound Starter Plus monthly       |
| `STRIPE_STARTER_ANNUAL_PRICE_ID`     | BotBound Starter Plus annual        |
| `STRIPE_TEAM_PRICE_ID`               | BotBound Pro monthly                |
| `STRIPE_TEAM_ANNUAL_PRICE_ID`        | BotBound Pro annual                 |
| `STRIPE_BUSINESS_PRICE_ID`           | Legacy hidden catalog compatibility |
| `STRIPE_BUSINESS_ANNUAL_PRICE_ID`    | Legacy hidden annual compatibility  |
| `STRIPE_EXTRA_AGENT_PRICE_ID`        | Extra Bot + 50 Minutes add-on       |
| `STRIPE_LIVE_VIDEO_ADDON_PRICE_ID`   | Retired webhook-only compatibility  |
| `STRIPE_LIVE_VIDEO_MONTHLY_PRICE_ID` | Retired monthly webhook-only alias  |

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

BotBound's commercial story is intentionally narrow and repeatable:

- **Build free** — short intake, no subscription wall, all role starters unlocked.
- **Train deeply** — facts, instructions, voice, memory, and sources live in Training, not checkout.
- **Fund live work** — Runtime Balance is customer-controlled; Free Builder never requires a plan.
- **Add capacity when useful** — Starter, Starter Plus, Pro, extra Bots, and Scale increase live-Bot, number, governance, and included-usage capacity without changing product or workspace type.

These messages must stay aligned across:

| Surface                   | Canonical copy anchor                                                               |
| ------------------------- | ----------------------------------------------------------------------------------- |
| `/pricing`                | Founder Early Access v6 from `src/lib/plan-catalog.ts`                              |
| Billing settings          | "Build free. Go live from $19/mo."                                                  |
| Runtime Balance API       | `CONVERSATION_BALANCE_COPY` in `src/lib/conversation-balance.ts`                    |
| Stripe catalog            | Product names and lookup keys generated by `scripts/lib/stripe-founder-catalog.mjs` |
| ChatGPT MCP widgets       | BotBound Letterpress tokens via `src/lib/wireline-mcp-widget-styles.ts`             |
| iOS / Android / extension | Generated `WirelineDesignTokens` from `design-tokens/wireline.tokens.json`          |

## Still required before live rollout

1. Re-run production checkout, webhook, portal, and billing-status verification after the exact reviewed source is live on Render, following `docs/DEPLOYMENT_RUNBOOK.md`.
2. Confirm prepaid Runtime Balance top-ups and included-minute burn remain the only overflow path (no Stripe metered postpaid overage).
3. Keep Scale sales-assisted until contract, committed-usage operations, and implementation controls are ready.
4. Enforce custom-auth breached-password screening before public launch.
