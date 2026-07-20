# Wireline Launch Perfection Plan

**Status: historical.** This was the rolling launch-readiness record before
the dated `LAUNCH_*` audit sequence took over that role; see
`docs/LAUNCH_READINESS_FINETUNE_2026-07-19.md` for the current audit of
record.

## Gate

```bash
npm run verify:full                 # full local gate (type, lint, contracts, tests, build, smoke)
npm run stripe:audit-live           # read-only live Stripe catalog audit via Vercel key
npm run stripe:webhook:check        # webhook enabled_events vs server handlers
node scripts/check-vercel-env-health.mjs   # Vercel env coverage (metadata only)
npm run check-prod-env              # local env completeness reference
```

## Last full audit — 2026-07-09

`verify:full` PASS (493 tests) at baseline and after this pass.

| Area | State | Evidence |
| --- | --- | --- |
| Repo gate | GREEN | `verify:full` pass: type check, eslint, design/source-control/route/docs/token checks, Stripe catalog contract, authz, CSP, 493 tests, build, server smoke, extension check. |
| Vercel env | GREEN | Core platform vars present on all targets. `DATABASE_POOL_URL` added (mirrors the Supabase transaction pooler already in `POSTGRES_URL`), removing the spurious "missing required env" error on every production cold start. |
| Secret hygiene | GREEN | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `VAPI_PRIVATE_KEY`, `VAPI_WEBHOOK_SECRET`, `RESEND_API_KEY` upgraded from `plain` to `encrypted` in Vercel; sync scripts now write `encrypted` and no longer downgrade. |
| Stripe catalog | GREEN | Live audit: 6 active products, 13 launch prices, 0 findings; every production price-ID env resolves to an ACTIVE live price with the expected product and amount. |
| Stripe webhooks | ACTION | Endpoint `https://trywireline.com/api/stripe-webhook` is enabled but its `enabled_events` are missing `customer.subscription.updated`, `charge.refunded`, `charge.dispute.created` (all handled by the server) and carry three unhandled card-update events. Run `npm run stripe:webhook:align` once to fix; `stripe:webhook:check` guards regressions. |
| Supabase | GREEN | Project healthy. Security advisors: one WARN (Supabase Auth leaked-password protection) — moot per `SUPABASE_ADVISOR_POSTURE_2026-07-07.md`; Wireline custom auth carries HIBP screening. Performance: unused-index INFOs deliberately retained. `wireline_purge_old_data(uuid, integer)` present; the 2026-07-04 purge-job failure burst has not recurred. |
| Resend | GREEN | `trywireline.com` verified, sending enabled; default From (`noreply@trywireline.com`) matches the verified domain. No webhook consumer exists in code, so zero configured Resend webhooks is consistent. |
| Runtime errors | GREEN | 7-day Vercel error stream shows no active defect: the audit-log uuid/email bug is already fixed in `src/lib/audit-logger.ts`; remaining entries are resolved one-offs (Jul-4 purge burst, Jul-6 Supabase restart) and sporadic pooled-connection timeouts on audit writes that are caught and retried. |
| Production probe | GREEN | `GET /api/health` ok; `GET /api/health/public` reports voice runtime, voice fallback, and reasoning operational. |

## Standing rules

- Environment edits land only through the sync scripts or the Vercel dashboard, always as `encrypted` (never `plain`) for secrets; redeploy production afterwards so functions pick up values.
- Any new `case` in the billing webhook switch requires `npm run stripe:webhook:align` and a fresh `stripe:webhook:check` pass.
- Keep this document self-contained: findings, evidence, and open actions live here, not in exported packs on personal machines.

## Open actions

1. `npm run stripe:webhook:align` — one command; aligns the production webhook's `enabled_events` with the server's handlers (URL and signing secret untouched).
2. Redeploy production (`npm run vercel:redeploy-production`) so `DATABASE_POOL_URL` and the re-typed secrets are picked up by live functions.
