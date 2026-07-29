# Launch Readiness Audit — 2026-07-28

Status: **NO-GO for unconditional GA**. The product, data plane, runtime, and exact-head preview are healthy enough for controlled founder testing, but release and merge remain blocked by customer-billing configuration, requested visual QA access, and incomplete external-operational proof.

**Baseline:** `main@891033c97d341149b4f1de19619162cd3d70c47d`  
**Audit branch:** `codex/launch-readiness-20260728`  
**Pull request:** #943 (draft until every gate below is satisfied)

This is dated evidence, not product doctrine. Canonical policy remains in the codebase and the active documents indexed by `docs/README.md`.

## Executive result

The deep pass verified that Wireline has a coherent product model, a guarded OpenAI-first runtime, a versioned Founder pricing catalog, tenant-isolated data, activation/spend controls, provider fallbacks, and an extensive launch-test suite. It also found one production billing-status failure caused by avoidable serverless pool fan-out, indefinite retention of expired recovery credentials, and a false-green Stripe readiness check.

All verified code wins are implemented on the audit branch. No speculative redesign, vendor expansion, or destructive data cleanup was applied.

## Exact-head release evidence

The full launch audit completed on code-equivalent commit `ed1954c31952b6854c4c01adbb95d626de001e4b`; the evidence-only follow-up commit is tagged to rerun the same exact-head gate.

| Gate | Result |
| --- | --- |
| Vercel preview | `READY` (`dpl_5VpzNVyQajeZ1n1EsWvos6HrGpYc`) at `ed1954c31952b6854c4c01adbb95d626de001e4b` |
| Unit/contract suite | Curated gate: 35 files / 231 tests; full non-E2E suite: 257 files / 1,366 tests; all passed |
| Static analysis | Client TypeScript, server TypeScript, audit-module TypeScript, and ESLint passed |
| Frontend build | Vite 6.4.3; 3,074 modules transformed in 9.23s |
| Server build | 2.4 MB server bundle; import-safe no-database smoke passed |
| ChatGPT/MCP build | 2.0 MB bundle |
| Public health | `GET /api/health` returned 200 |
| Protected readiness | `GET /api/health/launch-readiness` correctly required the monitor token |
| Public routing | home, pricing, signup, signin, sitemap, robots, and not-found routes returned 200 |
| Browser security | CSP, HSTS, frame denial, content-type protection, strict referrer policy, permissions policy, COOP, and CORP present |
| GitHub Actions | blocked before job startup by account limits; Vercel exact-head build is the current compensating gate |

The largest browser payload remains the 364 kB AreaChart chunk (107 kB gzip). It is route-split and not a verified launch blocker. The main client is 267 kB (86 kB gzip); CSS is 430 kB (58 kB gzip).

## Verified fixes on this branch

### Billing-status pool headroom

`GET /api/billing/status` previously launched four root Drizzle operations concurrently. One helper performs two additional reads while the serverless pool is capped at five clients. Two dashboard mounts could therefore exhaust pool checkout headroom and produce the observed five-second 500.

The route now performs subscription, agent, phone, and entitlement reads sequentially. This preserves all-or-nothing response semantics and leaves pool capacity for concurrent requests. A contract test pins the ordering and bans reintroducing `Promise.all` inside the route.

### Tenant snapshot connection discipline

The same causal pattern appeared in 15 additional pure-read batches that launched four to seven root tenant queries concurrently. Dashboard summaries, onboarding, insights, fleet/activity, agent workspaces, mobile setup, browser testing, Vapi assistant construction, outbound Vapi setup, OpenAI/xAI live-agent setup, and the daily brief now run each batch inside one tenant-scoped Drizzle transaction. Result tuple shapes and parallel-call semantics are preserved while node-postgres serializes the work on one scoped client. A release-gated contract scans every corrected file and prevents four-or-more root-query fan-out from returning.

### Recovery-token retention

The daily per-tenant `purge_old_data` job now removes expired email-verification and password-reset token rows after the existing tenant purge. Deletes are tenant-scoped and sequential, with bounded deletion counts in structured logs. A contract test pins expiry, tenant ownership, and no fan-out.

### Stripe launch truth

The read-only vendor probe and generated launch-status record now verify all of the following before declaring Stripe ready:

- charges and payouts enabled with non-negative available balance;
- customer-facing Wireline name, statement descriptor, website, and support origin;
- one active Wireline-managed or default customer portal with payment-method updates, invoice history, and subscription cancellation;
- one enabled `https://trywireline.com/api/stripe-webhook` endpoint with exactly the eight server-handled events;
- active Stripe Tax settings.

A regression contract pins these fail-closed gates.

## Pricing, billing, and unit economics

The live Founder catalog matches code:

| Offer | Monthly | Annual |
| --- | ---: | ---: |
| Starter | $19 | $190 |
| Starter Plus | $39 | $390 |
| Pro | $79 | $790 |
| Business | $159 | $1,590 |
| Extra agent + 50 minutes + one number | $15 | — |
| Live Video add-on | $19 | — |
| Runtime Balance | $10 / $25 / $50 / $100 | one-time |

The code models $0.128 variable voice cost per minute, $1.15 per phone number per month, and Stripe's 2.9% + $0.30 fee assumption. Catalog checks preserve at least a 45% expected contribution-margin target and a 30% full-utilization floor; annual plans are the tightest but remain above the floor.

The catalog, tax posture, and webhook endpoint are healthy. The customer-facing Stripe account still presents as **Cadence AI**, its public/support URLs are not fully aligned to Wireline, and no active portal configuration exists in the live account yet. The application is designed to create an explicit, catalog-fingerprinted managed configuration on first portal use, but that bootstrap has not been exercised. There are no live Stripe subscriptions; database subscription rows are demo/manual records. Paid self-serve launch is therefore **blocked** until the account identity is corrected and one controlled checkout-to-cancellation matrix proves portal bootstrap.

## Database and backend health

Supabase reports the project `ACTIVE_HEALTHY` on Postgres 17.6.1. All inspected application tables have RLS enabled, and no public, anonymous, authenticated, or PUBLIC table grants were found. The security advisor's leaked-password warning applies to Supabase Auth; Wireline currently uses custom scrypt/HIBP auth, so it is defense-in-depth rather than proof of a custom-auth bypass.

Observed production state:

- 5,932 jobs completed in 30 days, 44 pending, one dead legacy knowledge-URL job, and no stale jobs;
- three demo calls, with no real-call pipeline, STT, or TTS failures;
- 132/132 workspace spend budgets enabled with hard caps;
- zero orphan carrier resources;
- one account deletion pending inside its grace window and not overdue;
- 47 agents: 33 personal and 14 business;
- zero video-presenter configurations or consents;
- one custom-LLM override; otherwise managed defaults;
- 151 expired email-verification tokens and 12 expired password-reset tokens observed before the durable cleanup fix.

Unused-index advisor notices are informational at this pre-launch data volume. No correctness, RLS, or hot-query evidence justified dropping indexes. The legacy `vapi_private_key` column has zero active values and runtime strips it; managed voice secrets remain environment-owned.

## Agent runtime and product model

Wireline's default structured runtime is OpenAI GPT-5.6 Terra, with Gemini continuity fallback and Vercel AI Gateway as a governed last route. xAI is experiment-only behind explicit opt-in. PSTN calls use Twilio numbers through Vapi, with GPT-4o, Deepgram STT, and managed Vapi voices. OpenAI Realtime owns customer-facing browser demos.

Personal and business workspaces intentionally share the same Create -> Train -> Wire -> Run system while applying different defaults, tools, and copy. Existing contracts cover personal/business parity, role terminology, tool separation, voice configuration, agent customization, and Starter Plus's two-agent offer.

Vercel Agent Runs has no Wireline project records because Wireline agents run through the custom Vapi/job runtime. Current operational evidence comes from Wireline jobs, calls, provider probes, Vercel runtime logs, and database health.

## Video, presenters, and media

Live video is correctly a gated add-on, not an implied core capability. The provider abstraction supports LiveAvatar/HeyGen, requires paid-plan entitlement, workspace enablement, catalog readiness, and explicit consent, and falls back to voice. No production tenant has configured or consented to a presenter, so the add-on must remain planned/beta.

Runway is available for asynchronous generated media, not a real-time presenter. Existing Descript projects include Wireline launch and promotional edits. No Wireline-specific Runway asset inventory was found. Magnific media/voice features require a premium plan. No new media was generated because that would not prove the live-presenter path.

## Integrations, observability, and go-to-market

- Stripe, Vercel, Supabase, Runway, and Descript were reachable for read-only verification.
- The Stripe catalog and webhook are coherent; brand and portal remain blocked.
- Vercel production showed one billing-status 500 consistent with pool checkout exhaustion and one older Resend 422 to a synthetic example address.
- Wireline has a deliberate zero-dependency browser/server error reporter that routes structured failures into Vercel logs (`src/lib/sentry.ts` and `src/lib/sentry-events.ts`), but no external Sentry SDK or authenticated Sentry project was found. Do not claim Sentry alerting is certified.
- Ads Manager is intentionally out of scope by founder direction; it was not accessed, no spend was changed, and it is not a launch gate.
- Opera was not connected. The requested fresh screenshot inspection could not be performed.
- The Federal DNC integration still requires one real vendor-authenticated scrub before scaled marketing outbound.
- GitHub Actions currently fail before jobs start because of account limits.

Provider expansion was not justified. Existing boundaries are intentionally layered; adding another search, speech, presenter, or reasoning vendor would increase cost and failure surface without verified customer value.

## Visual and interaction QA

The repository's production visual harness covers 35 public/marketing routes, 29 authenticated routes/states/tabs/modals, and four desktop/mobile viewport profiles. It also checks interactions, overflow, console errors, and accessibility.

This audit did **not** reuse old screenshots or claim visual completion. Fresh screenshots are blocked until Opera's **Allow AI connection** is enabled. Exact viewport execution also requires explicit approval to run the repository's Playwright harness because Opera's connector cannot resize or drive the full interaction matrix.

## Release blockers

1. Rebrand the Stripe account to Wireline, align website/support/statement details and assets, and prove the managed portal bootstrap (or configure a compliant Dashboard default).
2. Run one controlled live Starter checkout -> webhook -> entitlement -> portal -> cancel/refund proof.
3. Enable Opera AI connection and explicitly approve Playwright for the exact cross-viewport matrix; inspect and fix every current screenshot before merge.
4. Restore GitHub Actions execution or explicitly accept Vercel exact-head build as the temporary release gate.
5. Complete one real Federal DNC scrub before scaled marketing outbound.
6. Connect/configure Sentry if it is intended to be a launch dependency; otherwise keep Vercel/runtime logging as the documented observability boundary.
7. Rotate the Vercel personal token that was pasted into chat.

## Merge rule

Do not mark PR #943 ready or merge it to `main` while the Stripe identity/portal gate or fresh visual QA gate is unresolved. Before merge:

1. remove temporary audit-only workflow scaffolding;
2. obtain a green exact-head Vercel preview with all tests and builds;
3. complete current-run visual QA and apply only evidence-backed fixes;
4. update the PR body with live proof and remaining deferred items;
5. squash-merge with the expected head SHA;
6. verify the production deployment points at the merge commit and recheck runtime errors.
