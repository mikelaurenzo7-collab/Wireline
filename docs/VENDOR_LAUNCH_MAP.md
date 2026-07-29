# Vendor Launch Map

Status: **Active canonical vendor, funding, and configuration inventory**.
Executable probe: `npm run vendor:readiness`.

## Current launch snapshot — 2026-07-28

The production deployment and Supabase database are reachable. The managed
runtime is OpenAI-first (structured, GPT-5.6 Terra), Vapi-orchestrated (PSTN),
and Twilio for carrier/SMS, with Gemini as the first structured continuity
fallback and the Vercel AI Gateway as the governed last route. xAI remains
optional experiment-only.

The July 28 pass re-verified Vercel, Supabase, Stripe, runtime policy, and current source. The provider inventory below also carries forward the most recent explicit Twilio, Vapi, Resend, and model-account probes; rerun `npm run vendor:readiness` immediately before GA:

- OpenAI, Gemini, Vercel AI Gateway, and xAI credentials are accepted.
- Since 2026-07-25, OpenAI is the managed structured primary and the live-demo
  voice default; `WIRELINE_ENABLE_XAI_STRUCTURED_FALLBACK` remains the explicit
  opt-in for appending direct xAI after the AI Gateway.
- Vapi credentials are accepted, with 18 reachable phone numbers and assistant inventory access.
- Twilio is active (~`$23.66` balance); **9/9** incoming numbers are voice+SMS capable and now
  point SMS at `https://trywireline.com/api/twilio-webhook/sms` (stale `coordinagents.com`
  toll-free webhook remediated). Messaging Service
  `MG92d5225d0c71519d74bc1c1f2f083287` (`Wireline Messaging`) has delivery
  `StatusCallback` set to `/api/twilio-webhook/message-status`.
- Scoped Twilio REST credentials `TWILIO_API_KEY` + `TWILIO_API_SECRET` are installed on
  Vercel production/preview (Standard key verified against IncomingPhoneNumbers). Keep
  `TWILIO_AUTH_TOKEN` for webhook-signature validation; rotate it out-of-band when convenient.
- Resend is accepted and `trywireline.com` is verified.
- ElevenLabs is on Creator with Voice API reachable; remains **optional** clone/showcase TTS only
  (tenant PSTN speech stays on managed Vapi voices — do not route ElevenLabs Agents into core calls).
- Live public research for PSTN tools already exists as `gemini_ground` →
  `freshPublicResearch()` (Perplexity-first when `PERPLEXITY_API_KEY` is set, else Gemini grounded
  search via `GEMINI_API_KEY`). **Do not add Tavily/Serper.** `PERPLEXITY_API_KEY` is optional
  quality boost, not a launch blocker while Gemini is present.
- Federal DNC: production runtime reports `compliance_ready` (Sensitive URL/KEY present). Development's
  encrypted key is a misplaced Vercel token (`vcp_…`) and does **not** authenticate DNCScrub — fix
  development and run one live scrub probe before scaling marketing outbound.
- Stripe processing, the Founder catalog (14/14 prices), Stripe Tax, and the
  `trywireline.com` webhook are reachable and aligned. **Customer billing is still blocked**:
  the public account identity is Cadence AI, website/support details are not fully aligned to Wireline,
  and there is no active managed or default customer portal configuration yet. Wireline can create a
  catalog-fingerprinted managed configuration on first use, but that path must be proven before paid self-serve checkout.
- Twilio has no ONLINE WhatsApp sender (private beta).

Launch remains blocked until the following are cleared:

1. **Correct Stripe's customer-facing identity and portal.** Set the public business name,
   statement descriptor/prefix, website, support URL, logo, and colors to Wireline. Activate a
   compliant portal by exercising Wireline's managed bootstrap (or configuring a Dashboard default).
2. **Complete one controlled Stripe lifecycle.** Prove checkout → webhook → entitlement → portal →
   cancellation/refund on a real test customer before inviting paid self-serve users.
3. **Restore full GitHub Actions execution.** PR workflow runs still end in `startup_failure`
   before any job is created. Vercel exact-head builds compensate but are not the full CI matrix.
4. **Rotate the exposed Vercel personal token** that was pasted into chat; revoke it after
   redeploying any values changed with that credential.
5. **Prove Federal DNCScrub with a live JSON scrub** before scaled marketing outbound (and replace
   the development `vcp_…` placeholder). Presence does not prove vendor authentication.
6. **Complete the controlled live channel matrix.** Account probes do not prove call transfer,
   `gemini_ground`, SMS STOP/HELP, real transactional email delivery, or provider redelivery.
7. **Complete fresh visual QA.** Connect Opera and run the repository's exact-viewport interaction
   harness only after explicit Playwright approval; inspect current screenshots before merge.
External Sentry is not a launch gate. Structured Vercel/runtime logs and the bounded
`/api/health/report` browser reporter are the launch observability boundary; adopt Sentry later
only after its SDK, project, alert policy, and browser/backend receipt are explicitly tested.
Ads Manager is intentionally out of scope by founder direction.

WhatsApp is not a core-launch blocker, but it remains **private beta** until an
approved ONLINE Twilio sender, Meta business/WABA approval, callback
configuration, and approved templates are present for business-initiated
messages outside the 24-hour customer-service window.

Set or rotate `HEALTH_MONITOR_TOKEN`, then point the uptime monitor at
`/api/health/launch-readiness`. The public health endpoint is intentionally a
small model-health surface and does not certify every vendor account.

## Runtime decision

The launch runtime is deliberately layered rather than vendor-maximal:

| Plane                 | Primary                                  | Fallback / boundary                                         |
| --------------------- | ---------------------------------------- | ----------------------------------------------------------- |
| Structured reasoning  | OpenAI GPT-5.6 Terra direct              | Gemini → Vercel AI Gateway → optional opt-in xAI            |
| PSTN calls            | Twilio carrier number → Vapi             | OpenAI GPT-4o call model → Gemini                           |
| Phone speech          | Deepgram STT + managed Vapi voice roster | Twilio fallback response                                    |
| Live voice demos      | OpenAI Realtime (Studio/ChatGPT/guest)   | —                                                           |
| Live public research (PSTN tool) | Perplexity (optional) → Gemini grounded | Unavailable if neither key                                  |
| Cloning/showcase TTS  | ElevenLabs                               | Optional Creator entitlement; never core phone runtime      |

Use OpenAI GPT-5.6 Terra as Wireline's default structured-reasoning runtime and
OpenAI Realtime for every customer-facing live-voice demo. Keep Vapi as the
PSTN orchestration layer and Twilio as the carrier/messaging layer. Keep Gemini
as the first structured continuity fallback and the Vercel AI Gateway as the
governed final route. Do not split providers between demos and runtime, and do
not conflate live-voice demos with the production PSTN call model, which stays
OpenAI GPT-4o under Vapi.

Vercel AI Gateway should provide centralized budget controls, observability,
and a final multi-model route. It should not add an unnecessary hop to every
latency-sensitive phone turn.

## Twilio channel posture

| Channel  | Verified state          | Requirement / next gate                                                       |
| -------- | ----------------------- | ----------------------------------------------------------------------------- |
| Voice    | account/inventory ready | Nine voice-capable numbers on Vapi inbound; complete live-call matrix           |
| SMS      | account/inventory ready | Nine SMS webhooks on trywireline.com + Messaging Service status callback; run STOP/HELP |
| WhatsApp | private beta            | Zero ONLINE senders; complete WABA, sender, templates, callbacks, and consent |

Promotional trials and one-time onboarding credits are not durable production
entitlements or customer promises. Wireline does not promise 100 free SMS or
WhatsApp messages. Customer allowances are governed by Wireline's plan catalog,
prepaid runtime controls, and current Twilio and Meta pricing.

The current code supports signed inbound messaging webhooks and two-way
responses. It does not yet justify general asynchronous WhatsApp marketing
claims: outside the 24-hour service window, approved template delivery must be
implemented and verified using Twilio Content templates.

The Twilio REST client prefers `TWILIO_API_KEY` + `TWILIO_API_SECRET` with
`TWILIO_ACCOUNT_SID` (installed on Vercel as of 2026-07-20). The Account Auth
Token remains required for Twilio webhook-signature validation and as a REST
compatibility fallback until it is rotated.

## Funding and account posture

| Vendor              | Product role                        | Verified posture                          | Action                                                                        |
| ------------------- | ----------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------- |
| Vercel              | Hosting, functions, cron            | project/build path healthy                | Rotate exposed token; keep payment method and spend alerts active             |
| Vercel AI Gateway   | Governed final AI route             | credential/model catalog ready            | Set per-key budget, alerts, and reserve before scale                           |
| Supabase            | Postgres data plane                 | ACTIVE_HEALTHY; RLS/grants reviewed         | Keep migrations and custom-auth password controls healthy                    |
| Stripe              | Customer billing                    | **blocked: Cadence AI identity; portal bootstrap unproved** | Rebrand; prove managed portal; run checkout lifecycle |
| xAI                 | Optional experiment only                | credential ready; not launch-default      | Fund only if explicitly opting into structured fallback; alert if enabled |
| OpenAI              | Primary structured + Realtime + Vapi call model | credential ready                  | Maintain budget, payment method, alerts, and scoped keys                       |
| Gemini              | Direct AI continuity                | credential ready                          | Retain quota/billing fallback                                                  |
| Vapi                | PSTN orchestration                  | credential ready; 18 numbers reachable    | Confirm billing/auto-reload and complete live call matrix                      |
| Twilio              | Carrier, numbers, SMS, WhatsApp     | active; ~$23.66; 9 voice/SMS; API key pair installed | Rotate Auth Token when convenient; Usage Triggers; channel E2E |
| ElevenLabs          | Optional clones/showcase            | Creator; Voice API ready; not on PSTN path | Keep optional, consented, and monitored                        |
| Resend              | Transactional email                 | key accepted; trywireline.com verified    | Test real verification/reset delivery and maintain plan                       |
| Upstash             | Distributed rate limits             | credentials ready                         | Maintain production database and billing                                      |
| Federal DNC vendor  | Marketing scrub                     | URL/key configured                        | Confirm live lookup semantics and maintain scrub credits                       |
| Sentry              | Error alerts                        | not connected/certified in this audit       | Add SDK/project/DSN and prove browser+backend receipt, or keep it non-required |
| LiveAvatar / HeyGen | Video add-on                        | launch-paused; 60-min cap implemented     | Fund only after consent, catalog, paid-lifecycle, and demand gates pass         |
| Apollo              | Enrichment                          | optional                                  | Add capped budget only when Lead Hunt is sold                                  |
| Perplexity          | Live public research (PSTN tool)    | optional; Gemini grounded already covers  | Set `PERPLEXITY_API_KEY` (+ `PERPLEXITY_MODEL=sonar`) for fresher answers        |

Funding guidance is a reserve policy, not permission for uncapped auto-spend.
Set provider-level budgets below Wireline account-level spend caps.

## Connector inventory

| Vendor / surface                     | Role                                    | State               | Launch boundary                                      |
| ------------------------------------ | --------------------------------------- | ------------------- | ---------------------------------------------------- |
| Google Workspace                     | Sign-in, Gmail, calendar, Drive/Sheets  | live / verify E2E   | Tenant retains Workspace plan                        |
| Microsoft 365                        | Sign-in, Outlook, Teams, Excel/OneDrive | live / verify E2E   | Tenant retains Microsoft plan                        |
| HubSpot / Salesforce                 | CRM writeback                           | beta                | Verify OAuth app review and tenant permissions       |
| Shopify / Square                     | Commerce actions                        | beta                | Do not claim full parity without E2E tests           |
| Slack / Zoom                         | Alerts and meetings                     | beta                | Verify OAuth and webhook paths                       |
| Apollo                               | Enrichment                              | beta                | Platform budget or tenant credential                 |
| Meta / X Ads                         | Lead ingest and attribution             | beta                | App review plus ad-account funding                   |
| Yahoo Mail                           | Mailbox OAuth                           | planned             | Do not market full parity                            |
| DocuSign                             | E-sign                                  | beta                | Verify JWT/access-token path                         |
| ChatGPT App / MCP                    | Account-bound drafting/simulation       | beta                | No unapproved live-call side effects                 |
| Browser extension                    | Explicit page-context handoff           | beta                | Store review and privacy verification                |
| iOS / Android                        | Urgent owner control                    | beta                | Signing, native QA, and store approval               |
| Video presenter                      | LiveAvatar/HeyGen                       | planned/beta add-on | 60 reserved min/month; 10 min/session; no overage    |
| Figma / Canva / GitHub design export | Design schema/env only                  | planned             | Do not fund until active routes exist                |
| Linear / Discord / Telegram          | No active integration                   | not implemented     | Do not market or fund                                |

## Required owner checks

```bash
# Pull secrets without committing them.
npx vercel env pull .env.production --environment=production --yes

# Static environment and contract checks.
npm run check-prod-env
npm run db:health
npm run stripe:catalog:check

# Read-only provider auth, inventory, entitlement, and funding probes.
node --env-file=.env.production scripts/check-vendor-readiness.mjs
```

Before the final Twilio probe, confirm production contains a complete scoped
REST pair (`TWILIO_API_KEY`, `TWILIO_API_SECRET`) plus the newly rotated
`TWILIO_AUTH_TOKEN` used for webhook validation.

Then complete the controlled launch matrix:

1. One inbound and one outbound phone call with transfer/tool execution.
2. One outbound and one inbound SMS, including STOP/HELP handling.
3. One verification email and one password-reset email to a non-owner mailbox.
4. Rebrand the Stripe account, prove the managed portal bootstrap (or a compliant
   Dashboard default), then prove checkout, webhook, entitlement, cancellation, and refund.
5. WhatsApp only after sender/template approval; test both in-window free-form
   and out-of-window approved-template delivery.

Never commit `.env.production`; delete it after the audit.

## Stripe catalog discipline

The active products match the Founder catalog. Before future catalog writes:

1. Run `node scripts/audit-stripe-catalog-live.mjs` read-only.
2. Confirm no subscriptions, payment links, or open checkout sessions reference
   retired objects.
3. Present exact product/price IDs for owner approval.
4. Only then run `npm run stripe:setup`.

## Sources

- Runtime registry: `src/lib/runtime-integrations-registry.ts`
- Runtime environment validator: `src/lib/env-validator.ts`
- Runtime policy: `src/lib/ai-models.ts`
- Provider chain: `src/lib/ai-client.ts`
- Funding and inventory probe: `scripts/check-vendor-readiness.mjs`
- Production env check: `scripts/check-prod-env.mjs`
- Twilio messaging: `src/lib/twilio-service.ts`
- Twilio REST authentication: `src/lib/twilio-service-base.ts`
- Vapi orchestration: `src/lib/vapi-client.ts`
