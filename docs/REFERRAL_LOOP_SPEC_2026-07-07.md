# Referral Loop Spec — Conversation Balance

**Status:** Planned (post-Horizon 0) · **Companion:** [AURORA_MASTERPLAN.md](./AURORA_MASTERPLAN.md) §2

## Hypothesis

Conversation Balance is a natural referral hook: refer a business, both get credit toward live telephony usage.

## MVP scope

1. **Referral link** — unique per tenant in Settings → Billing (`/settings/billing`).
2. **Attribution** — `signup` records `referred_by_user_id` when `?ref=` present.
3. **Reward** — on referee's first Conversation Balance top-up ≥ $10, credit both wallets $5 (configurable).
4. **Events** — `referral_signup`, `referral_converted` → GTM for paid optimization.
5. **Fraud guard** — same payment method / IP cluster blocks self-referral.

## Non-goals (v1)

- Multi-level referrals
- Cash payouts (balance credit only)

## Verification

- Contract test for referral copy in `product-copy.ts` once shipped
- Stripe idempotency on reward grants
