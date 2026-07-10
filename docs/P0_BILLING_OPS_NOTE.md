# P0 Billing Ops Note — 2026-07-08

Status: **Operator checklist** for launch integrity after the Jul 2026 pricing lock. Last MCP cross-check: **2026-07-10**.

**Superseded pricing note (2026-07-10, later same day):** the "Pricing lock (code)" and "Live Stripe
proof" checklist below documents the zero-included-minutes Team/Business catalog that was live
earlier on 2026-07-10. The catalog has since moved to the **Founder Early Access** model (Personal
Free/Starter $9/Starter Plus $19/Pro $59/Business $149, each with guaranteed included voice minutes
and a recurring Runtime Allowance — see `src/lib/plan-catalog.ts`, which is the source of truth).
The operational hygiene items below (webhook alignment, env parity, retired-price cleanup) are still
live concerns; only the specific dollar amounts and "zero included minutes" framing are stale.

## Pricing lock (code) — historical, see superseded-pricing note above

- [x] `plan-catalog.ts`: Personal $0.18/min; Team/Business $0.16/min; extra agents $8/$10; `voice_minutes_monthly: 0`
- [x] `voice-usage.ts`: `included = 0` for all tiers
- [x] `setup-stripe-catalog.mjs`: Team/Business overage 16¢; extra agents 800/1000 cents
- [x] Welcome $10 Conversation Balance on first Team/Business subscribe (`subscription-welcome-credit.ts`)
- [x] SMS segments bill Conversation Balance at $0.02 (`sms-billing.ts` + `twilio-service.ts`)
- [x] Run `node scripts/setup-stripe-catalog.mjs` against live Stripe when `STRIPE_SECRET_KEY` is set
- [x] Rotate `STRIPE_PRO_OVERAGE_PRICE_ID` + extra-agent price ids in Vercel (`price_1Tr4KFJohDtfy3Ik70mvNu8Y` Business overage 16¢)

## Live Stripe proof (manual)

Run after deploy with live keys:

1. Sign up → `/settings/billing` → Conversation Balance top-up ($5 test)
2. `checkout.session.completed` credits ledger once (retry → duplicate, no double credit)
3. Team checkout → subscription row + `max_agents` sync + welcome $10 grant once
4. Customer Portal cancel-at-period-end → `GET /api/billing/status` shows flag
5. Voice minute → balance burn or Stripe meter `voice_minutes_overage` when balance empty
6. `npm run stripe:catalog:check` green

## Stripe MCP cross-check — 2026-07-10

Account: Wireline (`acct_1TXb0SJohDtfy3Ik`).

Active products observed:

- Wireline Personal
- Wireline Team
- Wireline Business
- Wireline Enterprise
- Conversation Balance
- Wireline Live Video

Active expected prices observed:

- Team monthly/annual, Team extra-agent, Team voice overage
- Business monthly/annual, Business extra-agent, Business voice overage
- Conversation Balance `$5`, `$10`, `$25`, `$50`
- Live Video add-on monthly

Cleanup done (2026-07-10, same-day follow-up): the 5 zero-dollar `Retired catalog anchor` prices
(`price_1TqN1mJohDtfy3IkTjDzVXRs`, `price_1TqN1lJohDtfy3IkRkWRbXbu`, `price_1TqN1kJohDtfy3IkEcVbD9BJ`,
`price_1TqN1kJohDtfy3Ikt0rTqd6Y`, `price_1TqN1jJohDtfy3Iky9h9DO8z`) were set `active: false` directly via
the Stripe API (they were not referenced by source and carried `wireline_not_for_sale: true` metadata
already). Still worth running once for full parity confirmation:

```bash
npm run stripe:catalog:check
npm run stripe:verify-vercel-parity
```

Do not delete or rewrite historical billing docs solely because they mention retired price ids; keep the operational truth here and in `docs/business-usage-pricing-decision.md`.

## Env hygiene

- [x] `STRIPE_VOICE_OVERAGE_METER_EVENT_NAME=voice_minutes_overage` — confirmed in Vercel prod/preview/dev
- [x] All 9 launch `STRIPE_*_PRICE_ID` vars match `scripts/.stripe-env.generated.json` on prod/preview/dev (`npm run stripe:verify-vercel-parity`)
- [x] Stale duplicate launch prices deactivated (`npm run stripe:deactivate-stale-launch`)
- [x] Live catalog audit green (`node scripts/run-stripe-audit-from-vercel.mjs`)
- [x] Production redeploy after env sync: `dpl_FeCUbQHUFeGuGU9cUBxMFhZkwbAN` (2026-07-08)
- [x] Production env shape must include deploy-safe DB URLs: `npm run check-prod-env` now rejects single-label Postgres hosts such as `base` before deploy.
- No `CLERK_*` references in runtime code (custom JWT auth canonical)
- Migration `0082_phone_voice_routing.sql` targets `wireline_agents`

## Claim honesty

- Marketing/pricing: no “included minutes” language; platform fee vs $/min vs capacity only
- Trust Center: no SOC2/HIPAA claims before evidence collection post-traction
- `docs/PRODUCT_SHOWCASE_MATRIX.md` remains source for Live vs Planned integrations

## Pass/fail

| Check | Result |
| --- | --- |
| Pricing code + tests | Run `npm run test:run` on billing/voice/plan tests |
| Stripe catalog contract | `npm run stripe:catalog:check` — **PASS** |
| Stripe live audit | `node scripts/run-stripe-audit-from-vercel.mjs` — **PASS** (0 findings) |
| Vercel env parity | `npm run stripe:verify-vercel-parity` — **PASS** |
| Production deploy | **READY** `dpl_CdxKLQM7AZ65NZKcrb39YtSL5g1t` → trywireline.com as of the 2026-07-10 MCP check |

_Refresh this note after each live billing proof run._
