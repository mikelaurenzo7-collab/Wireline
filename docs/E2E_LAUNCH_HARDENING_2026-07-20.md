# E2E Launch Hardening — 2026-07-20 (evening)

Status: **Active** — follow-on to `E2E_AUDIT_STRIPE_VERCEL_2026-07-20.md` after
production launch-readiness dropped from 100 → **83** (`compliance_ready: degraded`).

## Verdict

Core voice/billing/email/OAuth remain ready. The score drop is **Federal DNC
configuration honesty** (runtime correctly rejects misplaced Vercel tokens /
missing keys) — not a Stripe or Vapi regression. Code/ops hardening in this
pass closes the highest-leverage *fixable* gaps found by a fresh audit;
DNCScrub still needs a real vendor `loginId` from the founder before marketing
outbound can go green.

## Confirmed healthy (re-probed)

| Surface | Result |
| --- | --- |
| Production `/api/health` | `ok: true` |
| Stripe Cadence catalog | 14/14 prices; `findings: []` |
| Stripe webhook events | Aligned with `billing-routes.ts` |
| Twilio | Active; balance ~$23.66; 9 voice + 9 SMS numbers |
| Vapi | 18 numbers reachable |
| Resend | `trywireline.com` verified |
| Live `wireline_server` grants | Tenant tables clean; only intentional globals ungranted |

## High-leverage fixes shipped

1. **Activation bypass closed** — settings / branding bootstrap inserts used
   `subscriptionStatus: "trialing"` (no `trialEndsAt`), which
   `enforceLiveWorkActivation` treats as open live access. Now inserts
   `pending_activation` to match signup. Contract:
   `tests/activation-bootstrap-contract.test.ts`.
2. **Insights LLM cost abuse closed** — `/api/insights/topics`,
   `failure-modes`, `daily-brief` had only the no-op `enforce24hSpendCap`.
   Mounted dedicated `insightsAiRateLimit` (20/hour). Contract:
   `tests/insights-ai-rate-limit-contract.test.ts`.
3. **Vendor readiness DNC honesty** — `scripts/check-vendor-readiness.mjs` and
   `scripts/check-prod-env.mjs` now reject `vcp_` / `vercel_` keys the same way
   runtime does (`isFederalDncVendorConfigured`).
4. **Launch-readiness monitor payload** — `/api/health/launch-readiness` now
   includes `blockers` / `launch_blockers` when degraded so ops can see *why*
   without reverse-engineering.
5. **Carrier SMS toggle honesty** — messaging / manager-alert toggles no longer
   show ON without a sendable SID/from/alert number.
6. **DEFAULT PRIVILEGES for `wireline_server`** — applied live for role
   `postgres` in `public` (migration `0106`). Prevents the next silent
   “feature shipped but RLS blocks the app” recurrence.
7. **Dev env parity** — copied `GEMINI_API_KEY` + set
   `WIRELINE_LAUNCH_DEMO_MODE=true` on Vercel Development.

## Still ops-only (not code)

1. **Federal DNCScrub real `loginId`** on Production / Preview (and Development).
   Production score 83 = `FEDERAL_DNC_API_URL+FEDERAL_DNC_API_KEY` blocker.
   Sensitive values are API-unreadable; runtime treats current config as not
   configured (missing, empty, non-HTTPS, or misplaced Vercel token). Replace
   with a real DNCScrub `loginId`, redeploy, confirm score 100 + one live scrub.
2. **Rotate the Vercel personal token** pasted into agent chats.
3. **Twilio balance ~$24** — top up before scaling dials.
4. **GitHub Actions phantom `BuildFailed` workflow** — Settings/support.

## Verification

```bash
npx vitest run tests/activation-bootstrap-contract.test.ts \
  tests/insights-ai-rate-limit-contract.test.ts \
  tests/carrier-sms-toggle-honesty-contract.test.ts \
  tests/vendor-readiness-contract.test.ts
VERCEL_TOKEN=… node scripts/run-stripe-audit-from-vercel.mjs
```

## Visual QA (production, same evening)

`scripts/capture-prod-visual-qa.mjs` against `https://trywireline.com`:

| Sweep | Result |
| --- | --- |
| Desktop + phone marketing + authenticated | **252 PNGs, 0 automated issues** |
| Signup → workspace | Succeeded (`visual.qa.*@mailinator.com`) |
| Dogfood auth probe (`e2e-gold`) | Overview / Studio (Jordan) / Phone / Insights / Billing / Compliance / Carrier / Connections — all 200, no auth bounce |

Manual review of key frames: home/pricing/showcase heroes, Free Builder billing honesty, Salesforce call-sync **OFF** while disconnected, Showcase **"No signup to listen"**, mobile Studio empty-state + bottom nav, dogfood Studio setup for Jordan — all Letterpress-consistent, no launch-facing copy or toggle lies found.

Artifacts: `/opt/cursor/artifacts/visual-qa-prod/2026-07-20T17-52-36-174Z/` and `/opt/cursor/artifacts/visual-qa-dogfood/`.
