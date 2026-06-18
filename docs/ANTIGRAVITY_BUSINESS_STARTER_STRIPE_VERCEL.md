# Antigravity Runbook — Business Starter Stripe/Vercel Setup

## Objective

Wireline now has a cheaper business tier in code:

- Plan id: `business-starter`
- Public name: `Business Starter`
- Monthly price: `$99/mo`
- Annual price: `$950/yr`
- Included agents: `2`
- Included phone numbers: `2`
- Included voice minutes: `300/mo`
- Overage: `$0.20/min`
- Extra agent add-on: `$19/mo`

This tier should sit between `Personal+` and `Business Growth`.

## Product strategy

Business Starter is the low-friction SMB entry point. It is for a solo operator, local service business, small medical/legal/real-estate office, restaurant, or owner-led sales motion that cannot yet justify `$249/mo` but will understand `$99/mo` quickly.

Do not reduce Business Growth. Keep Growth at `$249/mo` as the main tier for serious front desks. Business Starter exists to capture price-sensitive businesses and graduate them upward.

## Code already pushed to main

The following commits are on `main`:

- `e8507a72c9bb6808038ffb12b3bdb57ee30ef969` — allow `business-starter` in signup validation
- `fd1668802fe130012d61f6342f2d7f63d25efc80` — route lighter SMB signup wedges to Business Starter
- `c6fd8785b57e8a3d66a08b72b5ae65a335e6651b` — expose Business Starter in authenticated billing UI
- `1e17e009167634992d2dd027d20a3535ccee27fb` — add Business Starter to backend billing catalog
- `2698fea39d85d9eb1cf42d667e3e6612b2917554` — add Business Starter to public pricing

## Stripe tasks

Use the existing Wireline business product if appropriate. If current products are organized as `Wireline Personal`, `Wireline Pro/Business`, use the existing business product for this tier. Do not create a duplicate product unless the existing structure is broken.

Create these Stripe prices:

### Base monthly subscription

- Product: Wireline Business product
- Nickname: `Business Starter — Monthly ($99/mo)`
- Unit amount: `9900`
- Currency: `usd`
- Recurring interval: `month`
- Lookup key: `wireline_launch_v3_business-starter_monthly`
- Metadata:
  - `wireline_tier=business-starter`
  - `wireline_price_type=monthly`
  - `wireline_catalog_version=launch_v3`

Save price id as:

```env
STRIPE_BUSINESS_STARTER_PRICE_ID=price_...
```

### Base annual subscription

- Product: Wireline Business product
- Nickname: `Business Starter — Annual ($950/yr)`
- Unit amount: `95000`
- Currency: `usd`
- Recurring interval: `year`
- Lookup key: `wireline_launch_v3_business-starter_annual`
- Metadata:
  - `wireline_tier=business-starter`
  - `wireline_price_type=annual`
  - `wireline_catalog_version=launch_v3`

Save price id as:

```env
STRIPE_BUSINESS_STARTER_ANNUAL_PRICE_ID=price_...
```

### Extra agent add-on

- Product: Wireline Business product
- Nickname: `Business Starter — Extra Agent ($19/mo)`
- Unit amount: `1900`
- Currency: `usd`
- Recurring interval: `month`
- Lookup key: `wireline_launch_v3_business-starter_extra_agent`
- Metadata:
  - `wireline_tier=business-starter`
  - `wireline_price_type=extra_agent`
  - `wireline_catalog_version=launch_v3`

Save price id as:

```env
STRIPE_BUSINESS_STARTER_EXTRA_AGENT_PRICE_ID=price_...
```

### Metered voice overage

Use the existing Stripe meter event:

```env
STRIPE_VOICE_OVERAGE_METER_EVENT_NAME=voice_minutes_overage
```

Create metered price:

- Product: Wireline Business product
- Nickname: `Business Starter — voice overage ($0.20/min)`
- Unit amount: `20`
- Currency: `usd`
- Recurring interval: `month`
- Usage type: `metered`
- Meter: existing `voice_minutes_overage` meter
- Lookup key: `wireline_launch_v3_business-starter_voice_overage`
- Metadata:
  - `wireline_tier=business-starter`
  - `wireline_price_type=voice_overage`
  - `wireline_catalog_version=launch_v3`

Save price id as:

```env
STRIPE_BUSINESS_STARTER_OVERAGE_PRICE_ID=price_...
```

## Vercel tasks

Add these env vars to the Wireline Vercel project in Production, Preview, and Development unless intentionally environment-specific:

```env
STRIPE_BUSINESS_STARTER_PRICE_ID=price_...
STRIPE_BUSINESS_STARTER_ANNUAL_PRICE_ID=price_...
STRIPE_BUSINESS_STARTER_EXTRA_AGENT_PRICE_ID=price_...
STRIPE_BUSINESS_STARTER_OVERAGE_PRICE_ID=price_...
```

Then redeploy `main`.

## Important follow-up code patch

The following files should be checked after the Stripe/Vercel env work:

1. `src/lib/plan-entitlements.ts`
   - Add `business-starter` to the entitlement mapping.
   - Owner/founder effective plan should map to `scale`, not old `enterprise`.
   - `defaultAiSpendBudgetUsdForTier("business-starter")` should return `45`.

2. `src/lib/server-context.ts`
   - Quota resolver should map:
     - `business-starter`, `business-lite`, `lite` → `business-starter`
     - `starter`, `pro` → `starter`
     - `scale`, `business`, `enterprise` → `scale`

3. `scripts/check-prod-env.mjs`
   - Add Business Starter Stripe env checks if not already present.

4. `index.html`
   - Add JSON-LD offer for Business Starter at `$99`.
   - Warning: if inline CSP hash enforcement blocks changed JSON-LD, update the CSP hash strategy accordingly.

## Verification checklist

After env vars are set and main is redeployed:

```bash
curl https://trywireline.com/api/billing/plans
```

Expected:

- `business-starter` appears between `personal-plus` and `starter`
- `price_usd_monthly` is `99`
- `price_usd_annual` is `950`
- `max_agents` is `2`
- `voice_minutes_monthly` is `300`
- `overage_per_min_usd` is `0.2`
- `configured` is `true` once Vercel env vars are set

Manual browser QA:

- `/pricing` shows five tiers: Personal, Personal+, Business Starter, Business Growth, Scale
- `Business Starter` CTA goes to `/get-started?plan=business-starter`
- Signup with `?plan=business-starter` stores the correct intent
- Authenticated billing screen shows Business Starter and enables checkout only after env vars exist
- Stripe Checkout opens for Business Starter monthly
- Stripe webhook sync stores `plan=business-starter`
- Billing status shows `plan_id=business-starter` and correct max agent count

## Do not do

- Do not lower Business Growth from `$249`.
- Do not delete legacy `STRIPE_PRO_*` or `STRIPE_BUSINESS_*` env vars yet; they still map Growth and Scale.
- Do not recreate the old launch-v2 setup script.
- Do not make Business Starter unlimited agents or unlimited minutes.
