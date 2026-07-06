# Wireline Billing Catalog Direction

## Product model

Wireline sells operating capacity, not template access.

- All templates are unlocked.
- Personal starts with free build and Training, then funds live work through Conversation Balance.
- Team, Business, and Enterprise add shared operating capacity, routing, governance, and deeper integration controls.
- Live work should always reconcile through a durable ledger instead of vague "unlimited" promises.

## Target commercial structure

| Offer                | Commercial role                                     | Billing expectation                                                             |
| -------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------- |
| Personal             | Solo or founder use                                 | No required subscription; live work funded through Conversation Balance top-ups |
| Team                 | Shared SMB coverage                                 | Recurring capacity tier plus Conversation Balance                               |
| Business             | Revenue, support, and front desk teams              | Recurring capacity tier plus pooled Conversation Balance                        |
| Enterprise           | Governed rollout, SSO, policy, audit, BYO telephony | Annual committed usage and contract terms                                       |
| Conversation Balance | One-time funding                                    | Web checkout only; customer-controlled top-ups                                  |

## Live Stripe audit snapshot

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

## Exact applied Stripe writes

Applied on the live Wireline Stripe account `acct_1TXb0SJohDtfy3Ik`.

1. Updated product `Wireline Personal`
   Price writes: none
   Reason: Personal stays create-free and top-up led. Do not create a recurring personal subscription.
2. Updated product `Wireline Team`
   Prices:
   - Monthly recurring: `$29`
   - Annual recurring: `$278`
   - Extra agent recurring: `$9`
   - Metered voice overage: `$0.16/min`, backed by Stripe Billing Meter `voice_minutes_overage`
     Metadata:
   - `wireline_plan_id=team`
   - `wireline_billing_model=capacity_plus_conversation_balance`
3. Create product `Wireline Business`
   Prices:
   - Monthly recurring: `$59`
   - Annual recurring: `$566`
   - Extra agent recurring: `$12`
   - Metered voice overage: `$0.14/min`, backed by Stripe Billing Meter `voice_minutes_overage`
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
