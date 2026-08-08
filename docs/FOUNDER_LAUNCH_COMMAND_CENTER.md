# Founder Launch Command Center

Status: **Active owner runbook and go/no-go index**. Code and canonical linked
documents win when a number or status changes.

## Executive decision

Wireline keeps Personal and Business workspaces:

- Personal creates a **personal agent**.
- Business creates an **AI employee**.
- Technical/API surfaces keep `agent`.

See `docs/CUSTOMER_TERMINOLOGY.md`.

Do not move the launch runtime to ElevenLabs. ElevenLabs is optional TTS,
cloning, and showcase infrastructure. Keep:

1. OpenAI GPT-5.6 Terra for managed structured reasoning (Gemini, then the AI Gateway as ordered continuity); OpenAI Realtime for Studio / ChatGPT / guest live voice.
2. Twilio + Vapi for PSTN orchestration.
3. OpenAI with Gemini fallback inside the Vapi phone runtime.
4. Vercel AI Gateway as the funded last-resort structured route.
5. ElevenLabs as optional voice identity, not reasoning.
6. xAI only as an explicit opt-in experiment — never a split default for demos vs runtime.

## Certification log

### 2026-08-02 — K3 launch-perfect pass (commit `dfb76da` + fixes)

Verified with evidence, not vibes:

- **Gates green:** `tsc` (app/server/strict), `eslint` 0 warnings, `vitest` 1509/1509, 134/134 contract suites, production build, server smoke, all repo check scripts; authz matrix regenerated (356 routes / 293 protected / 0 violations).
- **pg fix:** production logs showed `client.query() while already executing` (pg@9 hard-fail path). Root cause was the tenant-scoped `release` wrapper queueing `ROLLBACK` behind in-flight queries; the error path now destroys the client directly. 20/20 tenant tests pass. Fix rides this merge.
- **Supabase prod:** RLS on 100% of public tables; migrations 0119/0120/0121 applied; voice-clone consent CHECK + approval gate + triggers + index live; zero cloned voices.
- **Stripe:** 8 products / 14 active prices in exact parity with `plan-catalog.ts` (Starter $19/$190 … Runtime Balance top-ups); Live Video price deliberately `launch_paused`.
- **Reels:** 5 cuts re-scored with ElevenLabs VO — see `docs/WIRELINE_LAUNCH_CAMPAIGN_2026-07-26.md` → Produced cuts.
- **GitHub Actions:** red from account billing, not code — owner deferred; commit statuses (Vercel, GitGuardian) are green.
- **Open:** cloud-browser dogfood (extension not connected), Twilio prepaid top-up, Federal DNC registration, `launch:status` re-run from `main` post-merge with full env.

### 2026-08-07 — Launch readiness perfection pass (post-#1023 main)

Verified live via connectors and local gates, not inferred:

- **Main was red as merged:** 6 contract tests in 5 files still pinned pre-#1023 text
  (`round6/7/8`, `code-review-hardening`, `call-recording-security`). Each invariant was verified
  intact — several strengthened (per-call claim ledger, resumable debits, fail-closed failover
  compliance) — and the contracts now pin the new form. Full non-e2e suite green after the fix.
- **Launch env gates were mutually unsatisfiable:** `launch:status` demanded three-target coverage
  and `vercel:env:health` demanded preview coverage for keys the build-time
  `check-deployment-boundaries.mjs` gate deliberately forbids in preview. Both audits now require
  production coverage only (`tests/vercel-env-target-policy-contract.test.ts` pins this), and
  `vercel:env:health` reports **CORE READY** against the live project.
- **Production:** deployed at exact `main` head `41a63af`; Vercel runtime errors over 7 days are
  two groups only — the pg deprecation warning (silent since 2026-08-02, matching the K3 fix) and
  one demo-line canary timeout for Marcus/+16173134469 at 2026-08-07 04:00 UTC (single probe,
  10s abort, no retry by design). **Re-check the Marcus line in daylight** via
  `GET /api/health/canary` or the Vapi dashboard before demo traffic.
- **Sentry:** `revaluate/wireline-backend` receives events; zero production-relevant unresolved
  issues in 14 days. The `mikelaurenzo7gmailcom` org's two auto-named projects are unused —
  consolidate or delete to keep one observability home.
- **Supabase:** ACTIVE_HEALTHY; security advisors show only the leaked-password-protection notice,
  which is not the active control (custom-auth HIBP screening is, per Compliance and trust below).
- **Resend:** `trywireline.com` verified, sending enabled, us-east-1; delivery proof still pending
  (Red item unchanged).
- **Stripe identity:** confirmed not correctable from this session — the account API rejects
  self-identity writes and the session permission layer blocks them; the Dashboard actions in
  `docs/VENDOR_LAUNCH_MAP.md` remain the path. Business records read live 2026-08-07 for the DNC
  registration package (see vendor map item 5) and the prepared `WIRELINE_POSTAL_ADDRESS` value
  (item 10).
- **Token hygiene:** another Vercel personal token was pasted into chat for this pass — rotate it
  with the rest per the standing Red item.

## Current go/no-go

### Red — resolve before taking live customers

- [ ] **Stripe merchant identity — subscribers currently see `CADENCE AI` on their card statement.** Verified live on `acct_1TkyXL8e6If87QKm` 2026-08-07. The catalog is correct; the identity around it is not. Dashboard-only — not writable from the application. Full field-by-field table and the three Dashboard pages are in `docs/VENDOR_LAUNCH_MAP.md` → *Stripe merchant identity*. The gate is `node --env-file=.env.production scripts/check-vendor-readiness.mjs`, not the Dashboard looking right. Highest-yield chargeback trigger in the billing surface.
- [ ] Top Twilio prepaid to at least **$150** — balance re-verified `$15.01` live 2026-08-08, **now below the $25 daily usage trigger**; a single active day can exhaust it (Usage Triggers daily $25 / monthly $200 are already live).
- [ ] **Require `twilio_sms_webhook_retries=ready` before paid SMS.** New Wireline numbers now provision with bounded Twilio connection overrides that retry transient 5xx/connection/read failures. Existing IncomingPhoneNumber `SmsUrl` values must carry the same `#rc=2&rp=5xx,ct,rt&ct=3000&rt=5000&tt=15000` fragment; the vendor-readiness probe is now a hard gate so a database blip cannot turn a provider-acknowledged inbound text into silent message loss.
- [ ] **Watch the toll-free SMS verification outcome** for `+1 (855) 542-7828` — the rejected coordinAGENTS-era submission was resubmitted live 2026-08-07 under the Wireline identity with the runtime-pinned verbal consent script; re-checked live 2026-08-08: status advanced to `IN_REVIEW`, no rejection reason (notifications go to `mikelaurenzo7@gmail.com`). US toll-free SMS is subject to carrier blocking until approved. Details in `docs/VENDOR_LAUNCH_MAP.md`.
- [ ] Complete controlled live launch matrix (inbound/outbound call + tools, SMS STOP/HELP, Resend verify/reset, Stripe checkout→webhook→portal).
- [ ] **Exercise the repaired purchase path end to end — this is the highest-priority item in the matrix.** On 2026-08-07 no signed-in customer could buy anything: three independent breaks, all of which had to work for a single dollar to arrive. (1) Settings → Billing offered "Choose a paid plan" linking to the public `/pricing` page, whose plan cards point at `/signup?plan=…`, which redirects an authenticated visitor to `/overview` — every in-product intent to pay looped back to the dashboard. The working checkout card existed but was mounted only under `/admin`, which nothing links to. (2) `TrialGateModal` rendered at `z-[100]` beneath the first-run wizard's opaque backdrop at `z-1050`, so the 402 paywall was invisible while focus moved into it. (3) `authFetch` filtered 402s through a stale code allowlist, so six real paywalls — including the agent cap and the `+$15` extra-agent add-on — produced a dead-end string with nothing to click. All three are fixed and contract-pinned, but the repaired path is **new code that has never taken a live payment**. Verify by hand, signed in as a Free Builder: Settings → Billing → choose a plan → Stripe → webhook → entitlement flips → portal opens. Then repeat from a 402 (create an agent past the plan cap) and confirm the modal appears *above* the wizard and reaches checkout.
- [ ] Enable **leaked password protection** in Supabase Auth (Dashboard → Authentication → Settings) — the only security-advisor finding on the live database, one toggle.
- [ ] Rotate any Vercel personal tokens pasted into chat; revoke after redeploy.
- [ ] Restore GitHub Actions execution and required checks; escalate the documented startup failure if repository configuration is sound. **This is now load-bearing:** the contract gates added since 2026-08-06 have never executed on a runner, so their first real run is also their first true test. Until then every claim of "gates green" is a local claim.
- [ ] Re-run `npm run launch:status` and `npm run vendor:readiness` until required launch gates are green.
- [ ] Rotate/set `HEALTH_MONITOR_TOKEN`; point uptime monitor at `/api/health/launch-readiness` (the route is token-gated by `requireMonitorToken`, so an unset token makes the probe useless rather than merely unauthenticated).

### Yellow — launch with caps (not GO blockers)

- [ ] **Federal DNCScrub** — register the business, obtain a real `loginId`, set `FEDERAL_DNC_*` on all Vercel targets, run `npm run dnc:probe`. Marketing outbound stays fail-closed until then; Studio non-marketing dials still use tenant DNC + TCPA.
- [ ] **A2P 10DLC registration** — no brand/campaign exists for the six local tenant numbers (verified live 2026-08-07); unregistered US 10DLC traffic is heavily filtered. The approved Trust Hub profile (`coordinAGENTS`) can seed a standard brand registration, but it incurs carrier fees — decide before tenant SMS at volume. Research pass 2026-08-08 verified the shape of that decision against Twilio primary docs: each tenant needs its own Secondary Customer Profile + Brand (no shared Wireline brand), unmapped subaccounts expose the whole platform to suspension from one tenant's bad traffic, and a Sole Proprietor brand is capped at one 10DLC number with a non-CPaaS mobile for OTP. Full detail in `docs/VENDOR_LAUNCH_MAP.md`. The runtime side of the same pass is already merged: telemarketing dials now open with the 64.1200(b)(3) opt-out announcement, outbound prompts carry the tenant callback number, the verbal SMS opt-in script carries all four carrier consent elements, and each live-call opt-in writes a per-recipient `consent_granted` ledger row.
- [x] **The historical 105-file unjournalled migration backlog is understood and remains archive-only.** Baseline verification on 2026-08-07 found 138 `.sql` files vs. 33 Drizzle journal entries. Forward migrations `0135`–`0140` have since advanced the live journal to **39** without back-filling that archive. Post-merge verification 2026-08-08 confirmed `0136`–`0140` in the live Drizzle sequence and checked their exact schema effects: consent/AI-disclosure uniques, tenant-scoped email uniques, active-only cadence re-enrollment, tenant email suppressions, and the daily-brief dispatch lease are all live.
  - **Do not back-fill the journal.** 10 of the 45 declared columns are absent, and every one is from an abandoned approach — `organization_id` on six tables, `voice_clone_id`, `managed_voice_id`, `is_read`. `src/db/schema.ts` declares **none** of them (zero occurrences of `organizationId`). Their absence is correct; the live schema matches the code, not the historical files. Journalling those migrations would re-apply DDL the product deliberately moved away from.
  - **The one real remnant is indexes.** 72 of 104 exist. Of the 32 missing by name, 16 have their leading column served by another index; **16 have no index serving the leading column at all** (of those, `phone_numbers.vapi_number_id` and `team_members.tenant_id` are served by partial indexes for their actual query patterns, so ~14 are genuinely unserved). Full list in the launch review notes. This is **pre-scale, not live**: the largest table is `wireline_jobs` at ~7.4k rows / 4.4 MB, where Postgres seq-scans anyway. Creating them is a production write and needs an owner decision, not a blind apply.
  - Treat the 105 as archive. `schema.ts` plus the **39-entry live Drizzle journal** are the forward-looking contract. A contract test pins the relationship so the historical backlog cannot silently grow.
- [ ] Confirm Vapi / OpenAI / Gemini / Gateway / xAI budgets and alerts.
- [ ] Flip `WIRELINE_LAUNCH_DEMO_MODE` to `false` when first real customer is admitted.
- [x] **Six-angle subsystem audit + primary-source hardening (2026-08-08).** Fixed and
  contract-pinned this pass: runtime prompt clamp preserving the compliance/escalation block; marketing
  email suppression + unsubscribe on every transport; voice/action follow-up promises backed by durable
  tasks; inbound Vapi tenant binding; terminal Stripe subscription deletion; 10 → 40 budget-bounded job
  sweep; knowledge-header injection collapse; concurrency-safe inbound SMS persistence combined with
  retryable 503 responses; bounded Twilio 5xx webhook redelivery for newly provisioned numbers plus a
  readiness gate for existing numbers; FCC opt-outs that durably suppress first and then await Vapi's
  current TLS-only `monitor.controlUrl` end-call command; public singing-demo per-caller rate limits plus
  a five-minute paid bridge ceiling; public intake rate limiting before database key resolution; the
  daily brief wired to Vercel GET cron with per-day due checks and a crash-safe DB dispatch lease; and
  terminal Google refresh failures clearing stale credentials so integration health asks for reconnect.
  The DNC control capability rejects redirects and non-TLS monitor URLs.

  Re-review also removed two stale findings: callback continuity already has a five-minute
  `callback_tick` reconciler, and the current verification UI does not falsely claim a signup email was
  delivered (resend surfaces transport failure). Scheduled reports re-arm before external work and the
  queue retries/reclaims stale jobs; campaigns also re-arm while leads or calls remain. Do **not** add an
  automatic "resurrect every dead job forever" loop — retry exhaustion is an operator-visible fault, not
  permission to repeat external side effects indefinitely.

  Still deferred by design, not mistaken for green: `post_call_enrichment` remains a dead/vacuous SLO
  path that should be removed or rebuilt before anyone relies on that metric; broad IP-keyed public
  limiters still favor availability when Redis is absent, while auth/intake/spend/provider-cost gates
  fail closed. These are pre-scale architecture follow-ups, not reasons to weaken the launch gates above.

### Green at audit

- Vercel production deployment is Ready and serves `trywireline.com`.
- Public health reports voice, fallback, and reasoning operational.
- Supabase is `ACTIVE_HEALTHY`; database health reports 73 tables, 198 indexes,
  and no issues/warnings.
- xAI, OpenAI, Gemini, Vapi, ElevenLabs, Resend, and Stripe API credentials are
  accepted.
- Resend domain `trywireline.com` is verified.
- ElevenLabs Creator is active with its full audited credit allowance unused.
- Stripe charges and payouts are enabled; catalog products are active; there
  are no active subscriptions.
- AI Gateway, Upstash, Sentry, OAuth, MCP, Vapi, Stripe, and core encryption
  env names exist in Vercel. Federal DNC remains intentionally fail-closed until configured.

## Funding cheat sheet

Use caps and alerts; never solve launch anxiety with uncapped auto-spend.
Full dollar bands and API-cost map: `docs/LAUNCH_GURU_PLAYBOOK_2026-07-20.md`.

Live snapshot **2026-07-21**: Stripe available **$0.00**; Twilio **$23.664**.

| Account | Recommended start fund / action |
| --- | --- |
| Stripe | Keep a **$300–500** operating buffer before paid invites; no retired-account deficit is carried into this launch account. |
| Twilio | Top to **$150–250**; Usage Triggers daily $25 / monthly $200 until ~20 paid accounts; confirm API key + Auth Token. |
| Vapi | **$200–400** or ≥2 weeks expected minutes; auto-reload on; concurrency = peak+2. |
| xAI | **$0–100** optional experiment budget only if `WIRELINE_ENABLE_XAI_STRUCTURED_FALLBACK` is intentionally enabled. |
| OpenAI | **$200–400**; primary structured runtime, PSTN call model, and OpenAI Realtime demos depend on this key. |
| Gemini | **$50–100** separate fallback budget. |
| AI Gateway | **$50** reserve + auto top-up + monthly key budget. |
| Perplexity | **$0–40** optional research quality. |
| ElevenLabs | **$0** extra — Creator credits for clones/showcase only; never core PSTN. |
| Federal DNC | Credits for **2×** first marketing list; no marketing dial without scrub. |
| Supabase/Vercel/Upstash/Resend | Cards on file (~$40–60/mo lean infra). |
| LiveAvatar/HeyGen/Apollo | **$0** until paid add-on / Lead Hunt monetized. |

**Founder operating float to open gates:** roughly **$1,500–2,500** (Stripe buffer + voice wallets + AI budgets + optional $200–500 ad test).

Generate the current record with `npm run launch:status`; it writes the untracked
`docs/LAUNCH_STATUS.generated.json` by probing live production. Read it fresh rather than trusting a
copy — the file is deliberately not committed because a stored snapshot reads as current truth long
after the deployment it measured. Executable probes and vendor detail live in
`docs/VENDOR_LAUNCH_MAP.md`. Creative assets: `docs/LAUNCH_CREATIVE_MEDIA_KIT_2026-07-20.md`.

## Runtime operating rules

### Structured work

`OpenAI (GPT-5.6 Terra) → Gemini → Vercel AI Gateway` (optional opt-in xAI after Gateway)

- Do not route every request through the most expensive model — simple/medium tasks ride GPT-5 inside the OpenAI lane.
- OpenAI is the managed structured primary for personal agents, business agents, and hybrid direction alike.
- Tag and budget Gateway usage before promoting it above last-resort status.
- Record provider, model, tokens, latency, feature, account, and cost for each
  paid action.

### Live voice demos

`OpenAI Realtime` for Studio, ChatGPT private simulation, and guest previews. Phone demos and production PSTN stay on Vapi.

### Phone calls

`Twilio number → Vapi → OpenAI call model → Gemini fallback`

Speech: Deepgram Flux STT + managed Vapi TTS. Twilio supplies number,
messaging, and limited fallback behavior. ElevenLabs is not the tenant phone
default.

### Spend safety

- No paid provider action without entitlement or Conversation Balance.
- No automatic postpaid customer overage.
- Pause new paid actions when provider funding falls below the owner reserve.
- Finish active calls; block only the next paid action.
- Attribute vendor spend to customer, agent, feature, and call.

## Launch timeline

### T-7 operating gate

- Run `npm run verify:full`, `npm run vendor:readiness`,
  `npm run db:health`, `npm run stripe:catalog:check`.
- Complete Twilio, DNC, Stripe balance, and monitor-token red actions.
- Verify Resend signup, verification, reset, billing, and support mail.
- Run real inbound/outbound calls with transcript, summary, ledger, and webhook
  reconciliation.
- Confirm Trust Center claims match `docs/TRUST_CONVERSION_PACK.md`.

### T-24

- Promote the tested Vercel deployment per `DEPLOY.md`.
- Freeze schema/catalog writes.
- Confirm status page and support inbox ownership.
- Set provider alerts and cards-on-file.
- Prepare a rollback deployment and provider kill switches.
- Confirm DNC, consent, quiet-hours, recording, and caller-ID policy.

### Launch hour

- Start with founder/design-partner traffic, not broad paid ads.
- Watch health, Vapi/Twilio webhooks, Stripe events, signup email, model errors,
  call completion, and gross margin.
- Keep marketing outbound disabled until the DNC probe is green.
- Do not promote browser/native/MCP/video as generally available.

### H+2 / D+1

- Reconcile subscriptions, Conversation Balance, call costs, and provider
  invoices.
- Review failed/abandoned signups and first-agent completion.
- Listen to real call samples with consent.
- Fix funnel breaks before increasing traffic.

## KPI traffic lights

Pause paid acquisition on any red condition.

| Metric                                    |         Green |          Yellow |                           Red |
| ----------------------------------------- | ------------: | --------------: | ----------------------------: |
| Signup → first personal agent/AI employee |          ≥60% |          40–59% |                          <40% |
| First creation → first successful test    |          ≥50% |          30–49% |                          <30% |
| Paid activation → first live call         |          ≥70% |          50–69% |                          <50% |
| Completed-call rate                       |          ≥95% |          90–94% |                          <90% |
| Webhook reconciliation                    | 100% same day | recoverable lag |               unresolved >24h |
| Contribution margin                       |          ≥45% |          35–44% |                          <35% |
| Refund/dispute rate                       |           <2% |            2–4% |                           >4% |
| Support P0 response                       |       <15 min |       15–30 min |                       >30 min |
| DNC/consent coverage                      |          100% |             N/A | any marketing dial unscreened |

Pricing and margin inputs come only from `src/lib/plan-catalog.ts` and
`docs/P0_BILLING_OPS_NOTE.md`.

## GTM sequence

1. **Design partners:** one repeatable, high-value call job.
2. **Founder Early Access:** prove Create → Train → Wire → Run and support.
3. **Web launch:** sell outcomes, included number/capacity, control, and proof.
4. **Browser beta:** explicit page-context handoff only.
5. **Native beta:** urgent approvals, calls, notifications, wallet safety.
6. **ChatGPT/MCP beta:** drafting/simulation; no dialing or billing bypass.
7. **Video add-on:** only after consent, cost, demand, and fallback proof.

Expansion gate remains: repeatable paid accounts, clean webhook/ledger
reconciliation, and margin above floor.

## Positioning cheat code

### Personal

“A personal agent for the calls and appointments you keep putting off.”

### Business

“An AI employee that handles one customer-facing job across voice, SMS, and
email—and logs every outcome.”

### Proof order

1. One clear job.
2. One trained identity.
3. One reachable number on paid plans.
4. One visible outcome record.
5. Owner controls for spend, approvals, handoff, and compliance.

Do not lead with model names, “unlimited,” autonomous workforce hype, video
presenters, or a list of integrations.

## Compliance and trust

- Federal and tenant DNC checks before marketing outbound.
- Documented consent and opt-out handling.
- Quiet-hour and campaign caps.
- Recording disclosure according to jurisdiction and policy.
- STIR/SHAKEN/Trust Hub, Voice Integrity, and CNAM after Twilio is repaired.
- Never claim SOC 2 Type II certification until externally attested.
- Keep provider secrets and OAuth tokens server-owned/encrypted.
- Use custom-auth HIBP screening; the Supabase leaked-password advisor is not
  the active auth control.

Canonical references:

- `docs/TRUST_CONVERSION_PACK.md`
- `docs/COMPANY_IDENTITY_PACK.md`
- `docs/INCIDENT_RESPONSE.md`
- `docs/CLIENT_SURFACES.md`
- `docs/SLA.md`

## Incident / rollback tree

| Failure          | Immediate action                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| Auth/database    | Stop acquisition, post status, rollback deploy if correlated, inspect Supabase/Vercel.             |
| Stripe           | Pause checkout/top-ups; do not alter ledger manually; replay verified webhooks after fix.          |
| Vapi/OpenAI PSTN | Pause new calls; preserve inbound fallback; post degraded status.                                  |
| Twilio           | Pause number/SMS provisioning; preserve Vapi-owned paths; rotate credentials if unauthorized.      |
| OpenAI structured/Realtime | Structured chain should move to Gemini/Gateway; pause Studio/ChatGPT live demos if Realtime sessions fail. |
| xAI (optional)   | Only relevant if opt-in fallback is enabled; otherwise ignore. Do not disable OpenAI demos for an xAI outage. |
| DNC vendor       | Hard-stop marketing outbound. Inbound/support may continue.                                        |
| Resend           | Keep app available; surface verification/reset degradation and use support escalation.             |
| Bad release      | Promote previous Vercel production deployment; verify DB/catalog compatibility first.              |

## Owner dashboard

Daily:

- Vercel errors and latency
- Supabase health/connections
- Vapi failed calls/concurrency/credits
- Twilio auth, usage, delivery failures
- xAI/OpenAI/Gemini/Gateway spend
- Stripe negative balance, webhooks, checkout, disputes
- Resend bounce/domain status
- Sentry P0/P1
- DNC availability and blocked dials
- Signup → creation → test → activation funnel
- Gross margin by plan/account

Weekly:

- Provider invoices vs ledger
- Top failure reasons
- Call-quality review
- Refund/support themes
- CAC/payback by channel
- Expansion-feature demand

## Canonical command sequence

```bash
npm run vendor:readiness
npm run db:health
npm run verify:full
npm run stripe:catalog:check
node scripts/check-chatgpt-app-release.mjs --url https://trywireline.com
node apps/browser-extension/scripts/build.mjs --check
```

No launch is “green” because the site renders. Green means the customer can
sign up, create, test, activate, call, receive the outcome, reconcile cost, and
get support without a hidden manual rescue.
