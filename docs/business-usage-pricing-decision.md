# Wireline Billing Catalog Direction

Canonical operating proof runbook: [BILLING_RUNBOOK.md](./BILLING_RUNBOOK.md).

**Status:** the "Target commercial structure," "Pricing lock," and "Exact applied Stripe writes"
sections below are a historical record of the Jun/early-Jul 2026 zero-included-minutes catalog. As
of 2026-07-10 the live catalog is the **Founder Early Access** model (5 tiers with guaranteed
included voice minutes and a recurring monthly Runtime Allowance, replacing the one-time welcome
credit). Duplicating prices in this doc is exactly why it drifted stale before —
**`src/lib/plan-catalog.ts` is the single source of truth** for plan ids, prices, included voice
minutes, Runtime Allowance, overage rates, and Stripe price/lookup-key resolution. Treat the
numbers below as historical unless just re-verified against that file and the live Stripe catalog.

## Product model

Wireline sells operating capacity, not template access.

- All templates are unlocked; Personal ("Free Builder") creates, trains, and privately simulates one draft agent at $0.
- Every paid tier (Starter, Starter Plus, Pro, Business) guarantees live voice capacity and an on-demand number slot — see `voice_minutes_monthly` per plan in `plan-catalog.ts`.
- Optional SMS, platform AI/research, enrichment, and business-artifact generation draw from a smaller flexible monthly Runtime Allowance included in the same subscription (`runtime_allowance_usd_monthly`), funded every billing period rather than as a one-time welcome credit.
- Live work should always reconcile through a durable ledger instead of vague "unlimited" promises.

## Current commercial structure (Founder Early Access, live in Stripe as of 2026-07-10)

| Plan id | Product name | Monthly / Annual | Included voice minutes | Runtime Allowance | Max agents |
| --- | --- | ---: | ---: | ---: | ---: |
| `personal` | Wireline Free Builder | $0 | 0 | $0 | 1 |
| `starter` | Wireline Starter | $9 / $90 | 20 | $0.50/mo | 1 |
| `team` | Wireline Starter Plus | $19 / $190 | 40 | $1/mo | 1 |
| `business` | Wireline Pro | $59 / $590 | 100 | $4/mo | 5 |
| `enterprise` | Wireline Business | $149 / $1,490 | 250 | $10/mo | 15 |

Overage beyond included voice minutes ranges $0.25/min (Starter) down to $0.17/min (top tier) — see
`overage_per_min_usd` per plan. SMS outbound segments still bill Conversation Balance at
**$0.02/segment** (`SMS_COST_PER_SEGMENT_USD` in `src/lib/sms-billing.ts`, unchanged by this pivot).

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

## Exact applied Stripe writes (historical — see status note above)

Applied on the live Wireline Stripe account `acct_1TXb0SJohDtfy3Ik`.

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

Vercel production, preview, and development envs were repointed to the live Team and Business price ids. Keep the existing env contract until the app is refactored away from transitional identifiers:

- `STRIPE_BUSINESS_STARTER_PRICE_ID` -> `Wireline Team - Monthly`
- `STRIPE_BUSINESS_STARTER_ANNUAL_PRICE_ID` -> `Wireline Team - Annual`
- `STRIPE_BUSINESS_STARTER_EXTRA_AGENT_PRICE_ID` -> `Wireline Team - Extra Agent`
- `STRIPE_BUSINESS_STARTER_OVERAGE_PRICE_ID` -> `Wireline Team - Voice Overage`
- `STRIPE_PRO_PRICE_ID` -> `Wireline Business - Monthly`
- `STRIPE_PRO_ANNUAL_PRICE_ID` -> `Wireline Business - Annual`
- `STRIPE_PRO_EXTRA_AGENT_PRICE_ID` -> `Wireline Business - Extra Agent`
- `STRIPE_PRO_OVERAGE_PRICE_ID` -> `Wireline Business - Voice Overage`

Retired Personal, Plus, Starter, and old Business/Enterprise price env vars were removed from Vercel. Stripe secrets and webhook secrets were left intact.

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
- **Fund live work** — Conversation Balance is customer-controlled; Personal never requires a plan.
- **Buy capacity when shared** — Team, Business, and Enterprise add routing, governance, and pooled usage.

These messages must stay aligned across:

| Surface                   | Canonical copy anchor                                                           |
| ------------------------- | ------------------------------------------------------------------------------- |
| `/pricing`                | "Create free. Train deeply. Fund live work when it matters."                    |
| Billing settings          | "Start free. Fund live work."                                                   |
| Conversation Balance API  | `CONVERSATION_BALANCE_COPY` in `src/lib/conversation-balance.ts`                |
| Stripe catalog            | Product names: Conversation Balance, Wireline Personal/Team/Business/Enterprise |
| ChatGPT MCP widgets       | Wireline Letterpress tokens via `src/lib/wireline-mcp-widget-styles.ts`         |
| iOS / Android / extension | Generated `WirelineDesignTokens` from `design-tokens/wireline.tokens.json`      |

## Still required before live rollout

1. Re-run production checkout, webhook, portal, and billing-status verification after the next Vercel deployment reaches READY.
2. Confirm metered overage event emission uses `voice_minutes_overage` with `stripe_customer_id` and `value` payload keys before enabling overage burn in production.
3. Keep Enterprise contact-sales until contract, committed-usage operations, and implementation controls are ready.
4. Enforce custom-auth breached-password screening before public launch.
