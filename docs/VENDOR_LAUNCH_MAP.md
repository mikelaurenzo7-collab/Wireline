# Vendor Launch Map

Status: **Active canonical vendor, funding, and configuration inventory**.
Executable probe: `npm run vendor:readiness`.

## Current launch snapshot — 2026-07-19

The production deployment and Supabase database are reachable. The branch builds
with an OpenAI-first managed runtime, managed Vapi phone voices, explicit
provider fallbacks, preview credential isolation, and a read-only vendor
inventory probe. Presence of an environment variable is not treated as proof
that an account is funded, entitled, or has usable inventory.

A production-scoped Vercel probe completed at `2026-07-19T17:59:58Z` without
creating calls, messages, or model inference. It verified:

- OpenAI, Gemini, Vercel AI Gateway, and xAI credentials are accepted.
- xAI structured fallback is disabled, as required for the launch default.
- Vapi credentials are accepted, with 18 reachable phone numbers and assistant
  inventory access.
- Twilio is active with a reported balance of `$23.664 USD`, nine incoming
  numbers that are both voice- and SMS-capable, and one Messaging Service.
- Resend is accepted and `trywireline.com` is verified.
- ElevenLabs is on Creator with 130,840 credits remaining and the Voice API is
  reachable.
- The Federal DNC URL/key pair is configured and shape-valid.
- Stripe charges and payouts are enabled, but the available USD balance is
  `-$207.00`.
- Twilio has no ONLINE WhatsApp sender.

Launch remains blocked until all of the following are cleared:

1. **Resolve Stripe's negative available balance of $207.00.** The active
   Founder catalog is coherent, but customer billing must not launch while the
   connected account has a negative balance or failed debit posture.
2. **Restore full GitHub Actions execution.** Pull-request workflow runs are
   ending in `startup_failure` before any job is created. Vercel currently runs
   five focused launch-policy files, 18 tests, operational contracts, and the
   production bundle as a compensating control, but this is not a substitute
   for the full CI matrix.
3. **Rotate the exposed Twilio and Vercel credentials.** Both were pasted into a
   chat and must be treated as compromised even though the current Twilio token
   is accepted. After rotation, update Vercel production secrets, redeploy, and
   re-run the read-only probe.
4. **Complete the controlled live launch matrix.** Account probes do not prove
   end-to-end call transfer, tool execution, SMS opt-out, email delivery, or
   Stripe webhook behavior.

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
| Structured reasoning  | OpenAI GPT-5.6 Terra direct              | Gemini → Vercel AI Gateway; xAI only behind explicit opt-in |
| PSTN calls            | Twilio carrier number → Vapi             | OpenAI GPT-4o call model → Gemini                           |
| Phone speech          | Deepgram STT + managed Vapi voice roster | Twilio fallback response                                    |
| Web/mobile live voice | OpenAI Realtime                          | xAI voice remains an optional experiment                    |
| Cloning/showcase TTS  | ElevenLabs                               | Optional Creator entitlement; never core phone runtime      |

Use OpenAI as Wireline's default reasoning and live-voice runtime. Keep Vapi as
the PSTN orchestration layer and Twilio as the carrier/messaging layer. Keep
Gemini as direct continuity, Vercel AI Gateway as the governed final route, and
xAI behind `WIRELINE_ENABLE_XAI_STRUCTURED_FALLBACK=true` until measured quality,
latency, reliability, and unit economics justify promotion.

Vercel AI Gateway should provide centralized budget controls, observability,
and a final multi-model route. It should not add an unnecessary hop to every
latency-sensitive phone turn.

## Twilio channel posture

| Channel  | Verified state       | Requirement / next gate                                                        |
| -------- | -------------------- | ------------------------------------------------------------------------------ |
| Voice    | account/inventory ready | Nine voice-capable numbers; complete inbound/outbound Vapi live-call matrix |
| SMS      | account/inventory ready | Nine SMS-capable numbers + one Messaging Service; test STOP/HELP/webhooks   |
| WhatsApp | private beta         | Zero ONLINE senders; complete WABA, sender, templates, callbacks, and consent  |

Promotional trials and one-time onboarding credits are not durable production
entitlements or customer promises. Wireline does not promise 100 free SMS or
WhatsApp messages. Customer allowances are governed by Wireline's plan catalog,
prepaid runtime controls, and current Twilio and Meta pricing.

The current code supports signed inbound messaging webhooks and two-way
responses. It does not yet justify general asynchronous WhatsApp marketing
claims: outside the 24-hour service window, approved template delivery must be
implemented and verified using Twilio Content templates.

## Funding and account posture

| Vendor              | Product role                       | Verified posture                         | Action                                                               |
| ------------------- | ---------------------------------- | ---------------------------------------- | -------------------------------------------------------------------- |
| Vercel              | Hosting, functions, cron           | project/build path healthy               | Rotate exposed token; keep payment method and spend alerts active    |
| Vercel AI Gateway   | Governed final AI route            | credential/model catalog ready           | Set per-key budget, alerts, and reserve before scale                  |
| Supabase            | Postgres data plane                | connected project healthy                | Run DB health and migrations; retain password-screening controls     |
| Stripe              | Customer billing                   | **blocked: -$207 available balance**     | Resolve balance/debits; then verify live webhook and catalog          |
| OpenAI              | Primary reasoning + Realtime       | credential ready                         | Maintain budget, payment method, alerts, and scoped keys              |
| Gemini              | Direct AI continuity               | credential ready                         | Retain quota/billing fallback                                        |
| xAI                 | Optional voice/reasoning experiment| credential ready; structured fallback off| Keep capped and opt-in; do not make launch depend on it               |
| Vapi                | PSTN orchestration                 | credential ready; 18 numbers reachable   | Confirm billing/auto-reload and complete live call matrix             |
| Twilio              | Carrier, numbers, SMS, WhatsApp    | active; $23.664; 9 voice/SMS numbers     | Rotate exposed token, re-probe, add Usage Triggers, run channel tests |
| ElevenLabs          | Optional clones/showcase           | Creator; 130,840 credits; Voice API ready| Keep optional, consented, and monitored                               |
| Resend              | Transactional email                | key accepted; trywireline.com verified   | Test real verification/reset delivery and maintain plan              |
| Upstash             | Distributed rate limits            | credentials ready                        | Maintain production database and billing                             |
| Federal DNC vendor  | Marketing scrub                    | URL/key configured                       | Confirm live lookup semantics and maintain scrub credits             |
| Sentry              | Error alerts                       | not certified by vendor probe            | Verify backend/browser event receipt and alert routing               |
| LiveAvatar / HeyGen | Video add-on                       | not core launch                          | Fund only after consent, pricing, and demand gates pass               |
| Apollo / Perplexity | Enrichment/research                | not core launch                          | Add capped budget only when Lead Hunt is sold                         |

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
| Video presenter                      | LiveAvatar/HeyGen                       | planned/beta add-on | Separate consent and prepaid credits                 |
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

Then complete the controlled launch matrix:

1. One inbound and one outbound phone call with transfer/tool execution.
2. One outbound and one inbound SMS, including STOP/HELP handling.
3. One verification email and one password-reset email to a non-owner mailbox.
4. One Stripe checkout, webhook activation, portal open, and cancellation in a
   controlled live customer account after the negative balance is resolved.
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
- Vapi orchestration: `src/lib/vapi-client.ts`
