# Wireline Billing Catalog Direction

## Product model

Wireline sells operating capacity, not template access.

- All templates are unlocked.
- Personal starts with free build and Training, then funds live work through Conversation Balance.
- Team, Business, and Enterprise add shared operating capacity, routing, governance, and deeper integration controls.
- Live work should always reconcile through a durable ledger instead of vague "unlimited" promises.

## Target commercial structure

| Offer | Commercial role | Billing expectation |
| --- | --- | --- |
| Personal | Solo or founder use | No required subscription; live work funded through Conversation Balance top-ups |
| Team | Shared SMB coverage | Recurring capacity tier plus Conversation Balance |
| Business | Revenue, support, and front desk teams | Recurring capacity tier plus pooled Conversation Balance |
| Enterprise | Governed rollout, SSO, policy, audit, BYO telephony | Annual committed usage and contract terms |
| Conversation Balance | One-time funding | Web checkout only; customer-controlled top-ups |

## Live Stripe audit snapshot

- Active subscriptions: `0`
- Active payment links: `0`
- Active products still mixed across old and template-shaped catalog names.

Current active products:

- `Custom Enterprise`
- `Sales & Reception`
- `Front Desk`
- `Office Assistant`
- `Solo Agent`
- `Wireline Plus`
- `Wireline Household`
- `Wireline Custom`
- `Wireline Concierge`
- `Wireline Everyday`

## Exact proposed Stripe writes

These writes were **not** applied. They are the exact proposal that should replace the mixed catalog:

1. Create product `Wireline Personal`
   Price writes: none
   Reason: Personal stays create-free and top-up led. Do not create a recurring personal subscription.
2. Create product `Wireline Team`
   Prices:
   - Monthly recurring: `$29`
   - Annual recurring: `$278`
   - Extra agent recurring: `$9`
   - Metered voice overage: `$0.16/min`
   Metadata:
   - `wireline_plan_id=business-starter`
   - `wireline_billing_model=capacity_plus_conversation_balance`
3. Create product `Wireline Business`
   Prices:
   - Monthly recurring: `$59`
   - Annual recurring: `$566`
   - Extra agent recurring: `$12`
   - Metered voice overage: `$0.14/min`
   Metadata:
   - `wireline_plan_id=starter`
   - `wireline_billing_model=capacity_plus_conversation_balance`
4. Create product `Wireline Enterprise`
   Price writes: none for self-serve
   Reason: keep Enterprise contact-sales only until contract and committed-usage operations are live.
5. Create product `Conversation Balance`
   Price writes: optional only
   Reason: current checkout already uses dynamic `price_data`, so fixed `$25/$50/$100` top-up prices are not required for launch.

## Current env mapping after future Stripe writes

Keep the existing env contract until the app is refactored away from transitional ids:

- `STRIPE_BUSINESS_STARTER_PRICE_ID` -> `Wireline Team - Monthly`
- `STRIPE_BUSINESS_STARTER_ANNUAL_PRICE_ID` -> `Wireline Team - Annual`
- `STRIPE_BUSINESS_STARTER_EXTRA_AGENT_PRICE_ID` -> `Wireline Team - Extra Agent`
- `STRIPE_BUSINESS_STARTER_OVERAGE_PRICE_ID` -> `Wireline Team - Voice Overage`
- `STRIPE_PRO_PRICE_ID` -> `Wireline Business - Monthly`
- `STRIPE_PRO_ANNUAL_PRICE_ID` -> `Wireline Business - Annual`
- `STRIPE_PRO_EXTRA_AGENT_PRICE_ID` -> `Wireline Business - Extra Agent`
- `STRIPE_PRO_OVERAGE_PRICE_ID` -> `Wireline Business - Voice Overage`

No Vercel env changes are needed until those new Stripe prices actually exist.

## Migration guardrails

- Do not archive or delete anything tied to active subscriptions.
- Do not archive or delete anything tied to active payment links until replacements exist.
- Preserve internal plan ids in code until subscription storage, entitlements, and webhook sync are migrated safely.
- Keep top-up funding idempotent through ledger references and Stripe invoice or session identifiers.
- Do not mutate old SKUs in place unless the app is explicitly hardcoded to them.

## Archive candidates after repoint and verification

- `Wireline Plus`
- `Wireline Household`
- `Wireline Custom`
- `Wireline Concierge`
- `Wireline Everyday`
- `Solo Agent`
- `Office Assistant`
- `Front Desk`
- `Sales & Reception`
- `Custom Enterprise`

## Still required before live rollout

1. Finalize the durable Conversation Balance ledger metadata and customer-facing reason taxonomy.
2. Create the new Stripe products and prices.
3. Repoint Vercel environment variables to the new Team and Business price ids.
4. Re-run checkout, webhook, portal, and billing-status verification against production.
5. Archive stale products only after the new catalog is live and verified.
