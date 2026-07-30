# Launch Readiness Audit — 2026-07-28

Status: **NO-GO for unconditional GA**. The product, data plane, runtime, and exact-head preview are healthy enough for controlled founder testing, but release and merge remain blocked by customer-billing configuration, requested visual QA access, and incomplete external-operational proof.

**Baseline:** `main@891033c97d341149b4f1de19619162cd3d70c47d`  
**Audit branch:** `codex/launch-readiness-20260728`  
**Pull request:** #943 (draft until every gate below is satisfied)

This is dated evidence, not product doctrine. Canonical policy remains in the codebase and the active documents indexed by `docs/README.md`.

## Executive result

The deep pass verified that Wireline has a coherent product model, a guarded OpenAI-first runtime, a versioned Founder pricing catalog, tenant-isolated data, activation/spend controls, provider fallbacks, and an extensive launch-test suite. It also found one production billing-status failure caused by avoidable serverless pool fan-out, indefinite retention of expired recovery credentials, a false-green Stripe readiness check, email diagnostics that could expose recipient addresses or a verification bearer link, and a shared database-error formatter that retained Drizzle bound parameters.

All verified code wins are implemented on the audit branch. Follow-up passes also found that the margin model omitted Stripe Billing and future Tax transaction fees, Vapi end-of-call persistence read several current report fields only from compatibility locations, pooled transaction state could strand a worker on a read-only backend, failed-but-retryable durable jobs were never reclaimable, a shadow Extra Agent write path could have reintroduced non-atomic entitlement handling if router order changed, DNCScrub blocked/unknown outcomes could be treated as callable, outbound AI identity and recording notices were not guaranteed in the actual first message, and transcript-free calls could be recorded as if disclosure delivery were proven. These defects are now corrected and permanently release-gated. No speculative redesign, vendor expansion, or destructive data cleanup was applied.

## Exact-head release evidence

The latest code-bearing audit completed on commit `e983101c4b263a2ece8175e3de4a41da795d3e1e` (`dpl_99cmdMooZRdvsMzy4fHfYriRiQBT`, `READY`). This documentation-only refresh records evidence about that proven code head; the exact documentation head and its deployment are recorded on PR #943 to avoid a self-referential evidence loop.

| Gate | Result |
| --- | --- |
| Vercel preview | `READY` (`dpl_99cmdMooZRdvsMzy4fHfYriRiQBT`) at `e983101c4b263a2ece8175e3de4a41da795d3e1e` |
| Unit/contract suite | Curated gate: 41 files / 273 tests; full non-E2E suite: 261 files / 1,391 tests; all passed |
| Static analysis | Client TypeScript, server TypeScript, audit-module TypeScript, and ESLint passed |
| Frontend build | Vite 6.4.3; 3,074 modules transformed; production build passed |
| Server build | 2.4 MB server bundle; import-safe no-database smoke passed |
| ChatGPT/MCP build | 2.0 MB bundle |
| Production public health | `GET /api/health` returned 200 |
| Protected readiness | `GET /api/health/launch-readiness` correctly required the monitor token |
| Production public routing | home, pricing, signup, signin, sitemap, and robots returned 200; the exact preview remains Vercel-auth protected |
| Browser security | CSP, HSTS, frame denial, content-type protection, strict referrer policy, permissions policy, COOP, and CORP present |
| GitHub Actions | blocked before job startup by account limits; Vercel exact-head build is the current compensating gate |

The largest browser payload remains the 364 kB AreaChart chunk (107 kB gzip). It is route-split and not a verified launch blocker. The main client is 267 kB (86 kB gzip); CSS is 430 kB (58 kB gzip).

## Verified fixes on this branch

### Federal DNC and spoken-call evidence

The DNCScrub adapter previously recognized only a guessed D-shaped subset as blocked and returned clear for empty, malformed, or unknown dispositions. The v5 integration now allowlists only the documented callable outcomes (C/E/G/H/O/W/X/Y); D/P/B/I/M/L/F/V, blank payloads, malformed responses, and future unknown codes fail closed. Unit coverage executes every documented disposition family plus empty and unknown responses.

Vapi's actual `firstMessage` now prepends an outbound AI/responsible-business identification independently of a tenant-selected compliance preset and uses the workspace business name before the agent-name fallback. Every non-HIPAA call Wireline records receives a compact spoken recording notice; HIPAA recording remains disabled in both directions. End-of-call evidence now distinguishes `disclosure_played`, `disclosure_not_detected`, and `disclosure_unverifiable`; missing transcript evidence can no longer create a false played record. These controls reduce risk but are not legal certification; consent purpose, jurisdiction, and campaign operations still require counsel-approved policy and live proof.

### Billing-status pool headroom

`GET /api/billing/status` previously launched four root Drizzle operations concurrently. One helper performs two additional reads while the serverless pool is capped at five clients. Two dashboard mounts could therefore exhaust pool checkout headroom and produce the observed five-second 500.

The route now performs subscription, agent, phone, and entitlement reads sequentially. This preserves all-or-nothing response semantics and leaves pool capacity for concurrent requests. A contract test pins the ordering and bans reintroducing `Promise.all` inside the route.

### Tenant snapshot connection discipline

The same causal pattern appeared in 15 additional pure-read batches that launched four to seven root tenant queries concurrently. Dashboard summaries, onboarding, insights, fleet/activity, agent workspaces, mobile setup, browser testing, Vapi assistant construction, outbound Vapi setup, OpenAI/xAI live-agent setup, and the daily brief now run each batch inside one tenant-scoped Drizzle transaction. Result tuple shapes and parallel-call semantics are preserved while node-postgres serializes the work on one scoped client. A release-gated contract scans every corrected file and prevents four-or-more root-query fan-out from returning.

### Pooled transaction recovery and guards

Production job sweeps at 17:30, 17:35, 17:40, and 17:45 UTC failed because one idle transaction-pool backend retained read-only state. The primary remained writable and outside recovery. The exact affected backend was isolated and recycled without broad termination or data mutation. Five consecutive sweep cycles at 17:50, 17:55, 18:01, 18:05, and 18:10 UTC then created both `cadence_tick` and `callback_tick` jobs; every job finished `done` on its first attempt, current retry debt is zero, and Vercel has reported no runtime errors since recovery.

The branch now requests `SET TRANSACTION READ WRITE` before tenant-role setup, gives unscoped worker transactions explicit Drizzle `accessMode: "read write"`, probes the exact selected application connection without mutation, and documents targeted pooled-backend recovery using the [official Supabase resolution](https://supabase.com/docs/guides/troubleshooting/resolving-cannot-execute-update-in-a-read-only-transaction-on-transaction-pooler-connections-ef582c). A permanent database-connection contract pins both layers.

### Durable retry execution

Retryable jobs were moved to `failed` with a future `runAt`, but both claim paths selected only `pending`; those jobs could never retry. Both claim paths now admit `pending` and retryable `failed` rows while preserving `runAt <= now` backoff eligibility. A six-test durable-enqueue contract covers both claiming paths and the retry-state invariant.

### Recovery-token retention

The daily per-tenant `purge_old_data` job now removes expired email-verification and password-reset token rows after the existing tenant purge. Deletes are tenant-scoped and sequential, with bounded deletion counts in structured logs. A contract test pins expiry, tenant ownership, and no fan-out.

### Email observability privacy

Transactional-email diagnostics previously logged full recipient addresses, and the missing-transport verification path logged the single-use verification URL itself. Provider error bodies could also echo a mailbox back into logs or user-facing errors.

Email-service logs now retain only a redaction marker and recipient domain, never the local part. Verification, reset, signup, and escalation payload values are excluded from log calls, and Resend error details are bounded, flattened, and email-redacted before they are returned or logged. A release-gated contract parses every email-service log call and exercises both JSON and raw provider-error sanitization.

### Shared error-log privacy

A fresh production-log review found that the historical billing-status database failure also emitted Drizzle's bound `params:` value, including a tenant UUID. The shared error formatter now strips bound SQL parameters, email addresses, UUIDs, bearer credentials, signed query values, and overlong payloads before structured logging. The existing observability-privacy release contract now pins every redaction class and the 2,000-character bound.

### Stripe launch truth

The read-only vendor probe and generated launch-status record now verify all of the following before declaring Stripe ready:

- charges and payouts enabled with non-negative available balance;
- customer-facing Wireline name, statement descriptor, website, and support origin;
- one active Wireline-managed or default customer portal with payment-method updates, invoice history, and subscription cancellation;
- one enabled `https://trywireline.com/api/stripe-webhook` endpoint with exactly the eight server-handled events;
- active Stripe Tax settings.

A regression contract pins these fail-closed gates.

### Extra Agent purchase integrity

The broad billing router retained a shadow `POST /billing/extra-agents` implementation even though the dedicated atomic router was mounted first. The shadow path mutated Stripe and then polled invoice state, so a future router-order change could have revived provider/local divergence and bypassed the launch-hard gate.

The shadow writer is removed; the broad router now owns only the read surface. The sole write owner takes the tenant capacity advisory lock, treats Stripe quantity as authoritative, uses deterministic idempotency, immediately invoices increases with `payment_behavior: "error_if_incomplete"`, re-retrieves and verifies provider quantity, and persists Postgres capacity only after that proof. Declined collection returns 402 without entitlement. Launch blockers stop only quantity increases; reductions and no-op reconciliation remain available so customers are never trapped during an incident. Permanent contracts pin sole ownership, payment-failure handling, mutation/verification/persistence ordering, and downgrade availability.

### Complete Stripe commercial-fee reserve

The shared margin model previously reserved Stripe Payments (2.9% + $0.30) but omitted Stripe Billing's 0.7% of subscription volume and the future Stripe Tax transaction fee. That made the Pro annual full-use margin appear above 30% when the complete commercial stack put 250 included minutes below the policy floor.

One shared helper now reserves Payments, Billing, and a conservative 0.5% future Tax transaction fee for every catalog and tenant-economics calculation. Pro is tightened from 250 to **245 included minutes**; prices, plan ids, catalog version, add-ons, and prepaid-only overflow are unchanged. Code, tests, agent knowledge, operator docs, environment examples, and live Stripe product/price metadata are aligned. Vercel permanently runs the plan and capacity suites.

### Vapi end-of-call evidence integrity

Current Vapi reports can place cost and timestamps on the report message and transcript/recording data inside `artifact`; call API objects retain compatible cost/timestamp and cost-breakdown shapes. The handler previously preferred call-object timestamps, persisted only `call.cost`, and read only direct transcript/recording fields. Missing cost was coerced to zero, erasing the distinction between absent telemetry and a genuinely free call.

A pure normalizer now resolves both current and compatibility shapes, preserves a real zero, refuses to undercount incomplete cost breakdowns, and stores missing cost as null. Insert, outbound-placeholder finalization, AI enrichment, digest, compliance, and retry-safe evidence backfill all consume the same normalized values. Focused tests are part of every Vercel deployment.

## Pricing, billing, and unit economics

The live Founder catalog matches code:

| Offer | Monthly | Annual | Included voice |
| --- | ---: | ---: | ---: |
| Starter | $19 | $190 | 60 min |
| Starter Plus | $39 | $390 | 120 min |
| Pro | $79 | $790 | **245 min** |
| Business | $159 | $1,590 | 450 min |
| Extra agent + 50 minutes + one number | $15 | — |
| Live Video add-on | $19 | 60 reserved session min/month · 10 min/session · no automatic overage |
| Runtime Balance | $10 / $25 / $50 / $100 | one-time |

The code models $0.128 variable voice cost per minute, $1.15 per phone number per month, Payments at 2.9% + $0.30, Billing at 0.7%, and a conservative future Tax transaction reserve of 0.5%. Catalog checks preserve at least a 45% expected contribution-margin target and a 30% full-utilization floor on both monthly and annual intervals. Annual full-use margins are 33.7%, 32.3%, 30.4%, and 30.3% from Starter through Business.

The catalog, tax posture, and webhook endpoint are healthy. The customer-facing Stripe account still presents as **Cadence AI**, its public/support URLs are not fully aligned to Wireline, and no active portal configuration exists in the live account yet. The application is designed to create an explicit, catalog-fingerprinted managed configuration on first portal use, but that bootstrap has not been exercised. There are no live Stripe subscriptions; database subscription rows are demo/manual records. Paid self-serve launch is therefore **blocked** until the account identity is corrected and one controlled checkout-to-cancellation matrix proves portal bootstrap.

## Database and backend health

Supabase reports the project `ACTIVE_HEALTHY` on Postgres 17.6.1. All inspected application tables have RLS enabled, and no public, anonymous, authenticated, or PUBLIC table grants were found. The security advisor's leaked-password warning applies to Supabase Auth; Wireline currently uses custom scrypt/HIBP auth, so it is defense-in-depth rather than proof of a custom-auth bypass.

Observed production state:

- Twenty-six consecutive post-recovery sweep cycles created both recurring job types (52 jobs total) and finished them on the first attempt; current due, running, retryable-failed, and exhausted job debt is zero, and the primary reports read-write with recovery off. The earlier 30-day sample had 5,750 finished jobs and five dead historical jobs (one intentionally disabled knowledge-URL job and four May purge jobs from before the purge RPC was present; the current RPC exists);
- 66 demo-marked call rows; 57 have duration, 52 have null cost, 14 have zero cost, and none has positive cost; 13 have transcripts and nine have recording references. Four older demo fixtures carry `pipeline_error = 'dialing'`, while STT/TTS error flags are zero. No row is live-customer call or empirical COGS proof;
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

Live video is a gated add-on, not an implied core capability. The provider abstraction supports LiveAvatar/HeyGen, requires paid-plan entitlement, workspace enablement, catalog readiness, and explicit consent, and falls back to voice. The deeper economics pass found that repeated 10-minute session mints were not bounded by a monthly allowance. Runtime now serializes each mint through a tenant/month advisory lock, reserves 10 minutes before issuing a provider token, releases the reservation when minting fails, and pauses at 60 reserved session minutes per month with no automatic overage.

At $19/month, 60 minutes at the conservative $0.12/min provider-cost reserve plus Payments, Billing, future Tax, and fixed transaction fees preserves an estimated 56.4% full-use contribution margin. Stripe catalog metadata now states the 60/10/no-overage policy and remains `launch_paused`; the production catalog gate must stay false until the curated presenter set and a controlled checkout-to-cancellation proof pass. No production tenant has configured or consented to a presenter, so the add-on remains planned/beta.

Runway is available for asynchronous generated media, not a real-time presenter. Existing Descript projects include Wireline launch and promotional edits. No Wireline-specific Runway asset inventory was found. Magnific media/voice features require a premium plan. No new media was generated because that would not prove the live-presenter path.

## Integrations, observability, and go-to-market

- Stripe, Vercel, Supabase, Runway, and Descript were reachable for read-only verification.
- The Stripe catalog and webhook are coherent; brand and portal remain blocked.
- Vercel production showed one older billing-status 500 consistent with pool checkout exhaustion, one older Resend 422 to a synthetic example address, and the four pooled read-only sweep failures described above. Recipient/bound-parameter logging is fixed and release-gated; the pooled backend recovered, 26 consecutive cycles completed both recurring jobs on the first attempt, and no runtime errors have appeared since 17:50 UTC.
- Wireline has a deliberate zero-dependency browser/server error reporter that routes structured failures into Vercel logs (`src/lib/sentry.ts` and `src/lib/sentry-events.ts`), but no external Sentry SDK or authenticated Sentry project was found. Do not claim Sentry alerting is certified.
- Ads Manager is intentionally out of scope by founder direction; it was not accessed, no spend was changed, and it is not a launch gate.
- Opera was not connected. The requested fresh screenshot inspection could not be performed.
- The Federal DNC integration still requires one real vendor-authenticated scrub before scaled marketing outbound.
- GitHub Actions currently fail before jobs start because of account limits.

Provider expansion was not justified. Existing boundaries are intentionally layered; adding another search, speech, presenter, or reasoning vendor would increase cost and failure surface without verified customer value.

## Visual and interaction QA

The repository's production visual harness covers 35 public/marketing routes, 29 authenticated routes/states/tabs/modals, and four desktop/mobile viewport profiles. It also checks interactions, overflow, console errors, and accessibility.

A fresh semantic browser pass covered all 30 sitemap routes at 1363×936: titles, H1s, canonical/meta tags, image loading, input labels, duplicate ids, and horizontal overflow were clean; the status page settled from its transient check to operational. That pass also found and fixed the Trust canonical/landmark defects and moved signup's primary action above the desktop fold.

This audit does **not** claim the requested screenshot matrix complete. Exact 1440×1100, 1280×900, 834×1112, and 390×844 public/authenticated screenshots, modal/tab states, and side-by-side visual comparisons remain blocked until Opera's **Allow AI connection** is enabled. The selected Product Design browser policy keeps this pass Opera-only.

## Release blockers

1. Rebrand the Stripe account to Wireline, align website/support/statement details and assets, and prove the managed portal bootstrap (or configure a compliant Dashboard default).
2. Run one controlled live Starter checkout -> webhook -> entitlement -> portal -> cancel/refund proof.
3. Enable Opera AI connection, run the exact Opera cross-viewport matrix, and inspect and fix every current screenshot before merge.
4. Restore GitHub Actions execution or explicitly accept the exact-head Vercel full audit as the temporary release gate.
5. Complete one real Federal DNC scrub before scaled marketing outbound.
6. Prove one controlled real transactional email delivery; the prior example-domain rejection is not customer-delivery evidence.
7. Rotate the Vercel personal token that was pasted into chat.

External Sentry is not a launch dependency. Wireline's documented launch observability boundary is structured Vercel/runtime logging plus the bounded browser-report endpoint. Adopt external Sentry later only if its project and alerting are explicitly chosen and receipt-tested.

## Merge rule

Do not mark PR #943 ready or merge it to `main` while the Stripe identity/portal gate or fresh visual QA gate is unresolved. Before merge:

1. remove temporary audit-only workflow scaffolding;
2. obtain a green exact-head Vercel preview with all tests and builds;
3. complete current-run visual QA and apply only evidence-backed fixes;
4. update the PR body with live proof and remaining deferred items;
5. squash-merge with the expected head SHA;
6. verify the production deployment points at the merge commit and recheck runtime errors.
