# Vendor Launch Map

Status: **Active canonical vendor, funding, and configuration inventory**.
Executable probe: `npm run vendor:readiness`.

## Current launch snapshot — 2026-08-01

The production deployment and Supabase database are reachable. The managed
runtime is OpenAI-first (structured, GPT-5.6 Terra), Vapi-orchestrated (PSTN),
and Twilio for carrier/SMS, with Gemini as the first structured continuity
fallback and the Vercel AI Gateway as the governed last route. xAI remains
optional experiment-only.

The August 1 pass live-verified Vercel (production READY on current `main`
`680a5f7`), Supabase (`ACTIVE_HEALTHY`, Postgres 17.6, advisor posture
unchanged: one Supabase-Auth WARN that Wireline's custom scrypt+HIBP auth
already supersedes), Stripe (Tax active and livemode; identity and portal
still blocked — see below), Resend (`trywireline.com` verified, sending
enabled), and ElevenLabs (Creator key live; curated voice inventory verified). The
provider inventory below also carries forward the most recent explicit
Twilio, Vapi, and model-account probes; rerun `npm run vendor:readiness`
immediately before GA:

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
- Resend credentials and the `trywireline.com` domain are configured; a controlled real verification/reset delivery remains unproven. Commercial email also remains fail-closed until the operator's valid physical postal address is configured.
- ElevenLabs is on Creator with the Voice API and curated catalog reachable. Wireline now uses
  ElevenLabs Flash 2.5 as managed streaming TTS through Vapi for the small Studio catalog and
  founder-approved private clones. Every Studio call payload carries a curated Vapi fallback;
  the provider key remains production-only and server-side. Vapi BYOK installation plus one live
  Studio call and one forced-fallback call remain launch gates.
- Live public research for PSTN tools already exists as `gemini_ground` →
  `freshPublicResearch()` (Perplexity-first when `PERPLEXITY_API_KEY` is set, else Gemini grounded
  search via `GEMINI_API_KEY`). **Do not add Tavily/Serper.** `PERPLEXITY_API_KEY` is optional
  quality boost, not a launch blocker while Gemini is present.
- Federal DNC: current production runtime reports the vendor unconfigured, so marketing/campaign
  outbound fails closed. The adapter now uses DNCScrub's documented v5 GET/loginId contract and
  allowlists only callable dispositions; configure a real vendor endpoint/loginId and prove one live
  JSON scrub before scaling marketing outbound. A Vercel token is not a DNCScrub credential.
- Stripe processing, the Founder catalog (14/14 prices), Stripe Tax, and the
  `trywireline.com` webhook are reachable and aligned. **Customer billing is still blocked**
  (re-verified live 2026-08-01): the public account identity is still Cadence AI, website/support
  details are not fully aligned to Wireline, and the active portal-configuration list is empty.
  Wireline can create a catalog-fingerprinted managed configuration on first use, but that path
  must be proven before paid self-serve checkout.
- Twilio has no ONLINE WhatsApp sender (private beta).

Launch remains blocked until the following are cleared:

1. **Correct Stripe's customer-facing identity and portal.** Set the public business name,
   statement descriptor/prefix, website, support URL, logo, and colors to Wireline. Activate a
   compliant portal by exercising Wireline's managed bootstrap (or configuring a Dashboard default).
2. **Complete one controlled Stripe lifecycle.** Prove checkout → webhook → entitlement → portal →
   cancellation/refund on a real test customer before inviting paid self-serve users.
3. ~~**Restore full GitHub Actions execution.**~~ **Cleared 2026-08-01.** Workflow runs execute
   again: PR #952 head `e9278fc` completed the whole matrix green, including the Full verification
   ladder (3m 8s), build-smoke, the P0 route-capture gate (5m 59s), the Playwright axe WCAG gate,
   and the static/metadata contract jobs — real durations and retrievable logs, not the
   `startup_failure` billing pattern that produced two-second jobs with no logs. Treat a single
   green matrix as recovery evidence, not a permanent guarantee: if `startup_failure` returns, the
   repository billing limit is back and Vercel exact-head builds are again the compensating gate.
4. **Rotate every Vercel personal token pasted into chat** after this pass; revoke each after
   redeploying any values changed with that credential.
5. **Configure and prove Federal DNCScrub with a live JSON scrub** before scaled marketing
   outbound. Set a valid endpoint/loginId in each intended environment; variable presence alone does
   not prove vendor authentication or disposition semantics.
6. **Complete the controlled live channel matrix.** Account probes do not prove call transfer,
   `gemini_ground`, SMS STOP/HELP, real transactional email delivery, or provider redelivery.
7. **Complete fresh visual QA.** Use the approved cloud browser at exact desktop and mobile
   viewports; inspect current screenshots and core interactions before merge.
8. **Certify Studio speech end to end.** Install the ElevenLabs credential in Vapi Integrations,
   prove inbound/outbound Flash 2.5 speech, then force and verify the Vapi fallback.
9. **Prove carrier registration, not just inventory.** Before outbound voice or SMS is opened,
   confirm the Wireline Primary Business Profile, SHAKEN/STIR number assignments, and the relevant
   approved A2P 10DLC or toll-free registration. Every future customer brand/use case needs its own
   compliant registration and sender isolation before messaging is enabled.
10. **Complete the operator identity in legal and email surfaces.** Provide the exact legal entity
    name and valid physical postal/notice address. Set `WIRELINE_POSTAL_ADDRESS` in production,
    verify it appears in every commercial email, and update Terms/Privacy contact language before
    admitting customers. The lifecycle-email path must stay fail-closed while this is unresolved.
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

| Plane                            | Primary                                  | Fallback / boundary                                     |
| -------------------------------- | ---------------------------------------- | ------------------------------------------------------- |
| Structured reasoning             | OpenAI GPT-5.6 Terra direct              | Gemini → Vercel AI Gateway → optional opt-in xAI        |
| PSTN calls                       | Twilio carrier number → Vapi             | OpenAI GPT-4o call model → Gemini                       |
| Phone speech                     | Deepgram STT + Vapi/ElevenLabs Flash 2.5 | Per-voice curated Vapi fallback                         |
| Live voice demos                 | OpenAI Realtime (Studio/ChatGPT/guest)   | —                                                       |
| Live public research (PSTN tool) | Perplexity (optional) → Gemini grounded  | Unavailable if neither key                              |
| Private voice cloning            | ElevenLabs                               | Founder-only consent + proof + approval + Vapi fallback |

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

| Channel  | Verified state          | Requirement / next gate                                                          |
| -------- | ----------------------- | -------------------------------------------------------------------------------- |
| Voice    | account/inventory ready | Prove Business Profile + SHAKEN/STIR assignments, then complete live-call matrix |
| SMS      | account/inventory ready | Prove A2P/toll-free approval + sender association, then run STOP/HELP            |
| WhatsApp | private beta            | Zero ONLINE senders; complete WABA, sender, templates, callbacks, and consent    |

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

| Vendor              | Product role                                    | Verified posture                                            | Action                                                                         |
| ------------------- | ----------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Vercel              | Hosting, functions, cron                        | project/build path healthy                                  | Rotate exposed token; keep payment method and spend alerts active              |
| Vercel AI Gateway   | Governed final AI route                         | credential/model catalog ready                              | Set per-key budget, alerts, and reserve before scale                           |
| Supabase            | Postgres data plane                             | ACTIVE_HEALTHY; RLS/grants reviewed                         | Keep migrations and custom-auth password controls healthy                      |
| Stripe              | Customer billing                                | **blocked: Cadence AI identity; portal bootstrap unproved** | Rebrand; prove managed portal; run checkout lifecycle                          |
| xAI                 | Optional experiment only                        | credential ready; not launch-default                        | Fund only if explicitly opting into structured fallback; alert if enabled      |
| OpenAI              | Primary structured + Realtime + Vapi call model | credential ready                                            | Maintain budget, payment method, alerts, and scoped keys                       |
| Gemini              | Direct AI continuity                            | credential ready                                            | Retain quota/billing fallback                                                  |
| Vapi                | PSTN orchestration                              | credential ready; 18 numbers reachable                      | Confirm billing/auto-reload and complete live call matrix                      |
| Twilio              | Carrier, numbers, SMS, WhatsApp                 | active; ~$23.66; 9 voice/SMS; API key pair installed        | Rotate Auth Token when convenient; Usage Triggers; channel E2E                 |
| ElevenLabs          | Managed Studio TTS + private clones             | Creator; API/catalog ready; Vapi live proof pending         | Install Vapi BYOK; disable provider training; prove voice + fallback           |
| Resend              | Transactional + lifecycle email                 | configured; delivery/address proof pending                  | Set postal address; test real verification/reset and one commercial footer     |
| Upstash             | Distributed rate limits                         | credentials ready                                           | Maintain production database and billing                                       |
| Federal DNC vendor  | Marketing scrub                                 | **unconfigured; marketing fails closed**                    | Configure valid loginId; prove live JSON semantics; maintain scrub credits     |
| Sentry              | Error alerts                                    | not connected/certified in this audit                       | Add SDK/project/DSN and prove browser+backend receipt, or keep it non-required |
| LiveAvatar / HeyGen | Video add-on                                    | launch-paused; 60-min cap implemented                       | Fund only after consent, catalog, paid-lifecycle, and demand gates pass        |
| Apollo              | Enrichment                                      | optional                                                    | Add capped budget only when Lead Hunt is sold                                  |
| Perplexity          | Live public research (PSTN tool)                | optional; Gemini grounded already covers                    | Set `PERPLEXITY_API_KEY` (+ `PERPLEXITY_MODEL=sonar`) for fresher answers      |

Funding guidance is a reserve policy, not permission for uncapped auto-spend.
Set provider-level budgets below Wireline account-level spend caps.

## Connector inventory

| Vendor / surface                     | Role                                    | State               | Launch boundary                                   |
| ------------------------------------ | --------------------------------------- | ------------------- | ------------------------------------------------- |
| Google Workspace                     | Sign-in, Gmail, calendar, Drive/Sheets  | live / verify E2E   | Tenant retains Workspace plan                     |
| Microsoft 365                        | Sign-in, Outlook, Teams, Excel/OneDrive | live / verify E2E   | Tenant retains Microsoft plan                     |
| HubSpot / Salesforce                 | CRM writeback                           | beta                | Verify OAuth app review and tenant permissions    |
| Shopify / Square                     | Commerce actions                        | beta                | Do not claim full parity without E2E tests        |
| Slack / Zoom                         | Alerts and meetings                     | beta                | Verify OAuth and webhook paths                    |
| Apollo                               | Enrichment                              | beta                | Platform budget or tenant credential              |
| Meta / X Ads                         | Lead ingest and attribution             | beta                | App review plus ad-account funding                |
| Yahoo Mail                           | Mailbox OAuth                           | planned             | Do not market full parity                         |
| DocuSign                             | E-sign                                  | beta                | Verify JWT/access-token path                      |
| ChatGPT App / MCP                    | Account-bound drafting/simulation       | beta                | No unapproved live-call side effects              |
| Browser extension                    | Explicit page-context handoff           | beta                | Store review and privacy verification             |
| iOS / Android                        | Urgent owner control                    | beta                | Signing, native QA, and store approval            |
| Video presenter                      | LiveAvatar/HeyGen                       | planned/beta add-on | 60 reserved min/month; 10 min/session; no overage |
| Figma / Canva / GitHub design export | Design schema/env only                  | planned             | Do not fund until active routes exist             |
| Linear / Discord / Telegram          | No active integration                   | not implemented     | Do not market or fund                             |

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
5. One Studio inbound call, one Studio outbound call, and one forced Vapi fallback; then complete
   a founder-owned clone lifecycle through confirmed provider deletion.
6. WhatsApp only after sender/template approval; test both in-window free-form
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
- Showcase audio assets: `scripts/generate-jingle.mjs`, `scripts/generate-transfer-chime.mjs`
- Twilio messaging: `src/lib/twilio-service.ts`
- Twilio REST authentication: `src/lib/twilio-service-base.ts`
- Vapi orchestration: `src/lib/vapi-client.ts`
