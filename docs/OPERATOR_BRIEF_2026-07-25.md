# Operator Brief — 2026-07-25

Status: **Active** — the consolidated, prioritized state of the platform after
the 2026-07-25 session: what shipped, what is verified healthy with evidence,
and the open items in the order they deserve attention. Supersedes nothing;
this is the founder-facing digest of the day's rounds (PRs #859–#863) plus
live-infrastructure audits performed the same day.

## Shipped and live today

| Change | PR | Verified |
| ------ | -- | -------- |
| Grok 4.5 temporarily promoted, then **superseded the same day by OpenAI-unified demo+runtime** (`main` `5ee2ba65`): OpenAI → Gemini → Gateway; all live demos on OpenAI Realtime; xAI opt-in only | #859 + #869 | Policy gate + OpenAI-first contracts green |

| Deep-review fixes: campaign temporal-gate retirement, $0 campaign cost stats, inert mid-call DNC termination, WhatsApp sender cross-tenant guard, health-probe cost memoization, partial-refund allowance clamp, timezone date math | #859 | Contract tests lock each fix |
| Stripe catalog copy drift (55/120/285) synced to live account | #860 | Live product re-read |
| E2E harness auto-resolves preinstalled Chromium; signin test hardened | #861 | 61/61 runnable e2e green in-sandbox |
| Pricing decision v6 recorded | #862 | docs/PRICING_DECISION_2026-07-25.md |
| **Founder catalog v6 executed**: $19/$39/$79/$159, 60/120/250/450 min, flat $0.22 top-up, uniform 2-months-free annual, two-floor margin policy; Stripe v6 prices live, v5 archived, Vercel env ids updated | #863 | Prod `/api/billing/plans` probe + live Stripe end-state (14 active prices, all v6) |

## Verified healthy (evidence, not assumption)

- **Billing truth chain**: code catalog = Stripe products/prices/metadata =
  Vercel env ids = prod API response. Zero v5 prices purchasable.
- **Quality gates**: 963/963 unit+contract tests; full `verify` ladder exit 0;
  four tsc configs + eslint clean; 61/61 runnable Playwright e2e; axe WCAG
  A/AA across 18 public pages.
- **Visual QA (this session)**: 524 fresh captures across phone and laptop
  viewports of every public route, zero P0s and zero layout defects; targeted
  full-card review of the v6 pricing grid confirmed correct prices, minutes,
  annual savings copy, and the featured Starter Plus card. The 540
  "non-blocking" manifest entries are exactly two repeated console patterns:
  the sandbox-blocked analytics beacon (environment-only) and the anonymous
  session probe's by-design 401.
- **Production env (Vercel API audit)**: 96 keys on the `wireline` project;
  every launch-critical credential present — xAI, OpenAI, Gemini, AI Gateway,
  Twilio, Vapi, Stripe (+webhook), Resend, Upstash Redis, federal-DNC vendor,
  backend Sentry, DB pool, CORS/APP_URL.
- **Public health**: `/api/health/public` operational; API 404/error contract
  correct in prod.

## Open items, in priority order

1. **P1 — GitHub Actions billing is broken.** Every CI job on every branch
   fails with no logs; local gates are currently the only safety net, and
   merged PRs land with red checks. Fix in GitHub billing settings; no code
   change is involved. When CI returns, the first green run re-validates the
   whole ladder in one shot.
2. **P1 — Frontend error monitoring is dark.** `SENTRY_DSN` (backend) is set
   in Vercel but `VITE_SENTRY_DSN` is not, so browser-side errors go
   unreported. Add `VITE_SENTRY_DSN` (the same DSN, or a dedicated browser
   project's DSN from the Sentry dashboard) to the `wireline` project and
   redeploy — it is a build-time variable, so it only takes effect on the
   next deployment.
3. **P2 — v6 has never been purchased with a real card.** Zero charges have
   ever run on the account. Before inviting paying customers, run one live
   $19 Starter checkout yourself end-to-end (checkout → webhook → entitlement
   → portal), then refund it — that exercises the entire money path once.
4. **P2 — The PR review-bot fleet is entirely out of credit** (Codex usage
   limit, CodeRabbit free-tier rate limit, Kilo out of credits). They add
   noise to every PR and review nothing. Either fund one or uninstall the
   rest.
5. **P3 — Six design-gold e2e tests never run** (credential-gated on
   `WIRELINE_E2E_EMAIL`/`WIRELINE_E2E_PASSWORD`). Provide a seeded test
   account in CI secrets when CI is back.
6. **P3 — Cosmetic**: the anonymous session probe logs a 401 in every
   visitor's browser console. Harmless and by design, but a `200
   {authenticated:false}` probe shape would silence it; touching it means
   updating the auth-probe contract tests deliberately.
7. **P3 — Accepted security advisory to retire later**: react-router
   GHSA-qwww-vcr4-c8h2 (RSC-mode CSRF) is explicitly accepted in
   `scripts/check-security-audit.mjs` because the app has no RSC and no
   data-router actions and no patched 7.x release exists. When
   react-router-dom ships a release above the advisory range, upgrade and
   delete the acceptance. The other high advisory from the same audit (the
   brace-expansion DoS chain under googleapis-common) was actually fixed —
   patched 5.0.8 enforced via package.json overrides with glob lifted to
   minimatch 10 — so the audit gate is green and stays sensitive to anything
   new.

## Standing references

- Pricing/margin policy: `docs/PRICING_DECISION_2026-07-25.md` (the two-floor
  policy and the v6 table) with method in
  `docs/PLAN_CAPACITY_HEADROOM_2026-07-25.md`.
- Runtime/provider policy: `scripts/check-runtime-policy.mjs` (OpenAI-first) and
  `tests/runtime-provider-chain-contract.test.ts` / `tests/openai-live-demo-contract.test.ts`.
- Vendor state: `docs/VENDOR_LAUNCH_MAP.md` (balances there are a 2026-07-20
  snapshot; re-probe with `npm run vendor:readiness` before relying on them).
