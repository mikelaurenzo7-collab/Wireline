# Vendor Launch Map

Status: **Active canonical vendor, funding, and configuration inventory**.
Executable probe: `npm run vendor:readiness`.

## Current launch snapshot — 2026-07-19

The production deployment and Supabase database are reachable. The branch now
builds with an OpenAI-first managed runtime, managed Vapi phone voices, explicit
provider fallbacks, preview credential isolation, and a read-only vendor
inventory probe. Presence of an environment variable is not treated as proof
that an account is funded, entitled, or has usable inventory.

Launch remains blocked until all of the following are cleared with current
production evidence:

1. **Rotate exposed Twilio credentials and re-run the read-only production
   probe.** A Twilio account SID/auth token was pasted into a chat and must be
   treated as compromised. The current execution environment could not reach
   Twilio directly, so account status, balance, number capabilities, Messaging
   Services, and WhatsApp sender state are not certified. After rotation, run
   `npm run vendor:readiness` with Vercel production env and complete one
   controlled inbound call, outbound call, and two-way SMS test.
2. **Resolve Stripe's negative available balance of $207.00.** The active
   Founder catalog is coherent, but customer billing must not launch while the
   connected account has a negative balance or failed debit posture.
3. **Correct and verify Federal DNC configuration.** Marketing outbound remains
   disabled until `FEDERAL_DNC_API_URL` is a real HTTPS scrub endpoint, the key
   is accepted, and the Compliance Center passes.
4. **Keep WhatsApp private beta until inventory proves readiness.** Production
   requires an approved ONLINE Twilio WhatsApp sender, Meta business/WABA
   approval, callback configuration, and approved templates for
   business-initiated messages outside the 24-hour customer-service window.
5. **Upgrade or replace the ElevenLabs workspace before exposing its paid
   features.** Production runtime logs returned HTTP 402 stating that the
   connected workspace is a free user and cannot use Voice Library voices via
   API. Usage top-ups do not replace paid-plan entitlements.
6. **Restore full GitHub Actions execution.** Pull-request workflow runs are
   ending in `startup_failure` before any job is created. Vercel currently runs
   a narrow launch-policy contract suite and production bundle as a compensating
   control, but that is not a substitute for the full CI matrix.
7. **Rotate the exposed Vercel access token.** Replace it after the audit and
   confirm no unauthorized project or environment changes occurred.

Set or rotate `HEALTH_MONITOR_TOKEN`, then point the uptime monitor at
`/api/health/launch-readiness`. The public health endpoint is intentionally a
small model-health surface and does not certify every vendor account.

## Runtime decision

The launch runtime is deliberately layered rather than vendor-maximal:

| Plane                | Primary                                  | Fallback / boundary                                         |
| -------------------- | ---------------------------------------- | ----------------------------------------------------------- |
| Structured reasoning | OpenAI direct                            | Gemini → Vercel AI Gateway; xAI only behind explicit opt-in |
| PSTN calls           | Twilio carrier number → Vapi             | OpenAI call model → Gemini                                  |
| Phone speech         | Deepgram STT + managed Vapi voice roster | Twilio fallback response                                    |
| Web/mobile live voice| OpenAI Realtime                          | xAI voice remains an optional experiment                    |
| Cloning/showcase TTS | ElevenLabs                               | Optional paid entitlement; never core phone runtime         |

Use OpenAI as Wireline's default reasoning and live-voice runtime. Keep Vapi as
the PSTN orchestration layer and Twilio as the carrier/messaging layer. Keep
Gemini as direct continuity, Vercel AI Gateway as the governed final route, and
xAI behind `WIRELINE_ENABLE_XAI_STRUCTURED_FALLBACK=true` until measured quality,
latency, reliability, and unit economics justify promotion.

Vercel AI Gateway should provide centralized budget controls, observability,
and a final multi-model route. It should not add an unnecessary hop to every
latency-sensitive phone turn.

## Twilio channel posture

| Channel   | Launch state       | Requirement                                                                 |
| --------- | ------------------ | --------------------------------------------------------------------------- |
| Voice     | **required**       | Active paid account, voice-capable number, Vapi import/routing, live tests |
| SMS       | **required**       | SMS-capable sender or Messaging Service, webhook signatures, opt-out flow  |
| WhatsApp  | **private beta**   | ONLINE sender, WABA approval, templates, callback and consent validation   |

Twilio trial allowances such as 100 SMS or WhatsApp messages are onboarding
credits, not a durable production entitlement or customer promise. Wireline's
customer allowance must be governed by its own plan catalog, spend controls,
and current Twilio pricing.

The current code supports signed inbound messaging webhooks and two-way
responses. It does not yet justify general asynchronous WhatsApp marketing
claims: outside the 24-hour service window, approved template delivery must be
implemented and verified using Twilio Content templates.

## Funding and account posture

| Vendor              | Product role                      | Launch posture                         | Action                                                                 |
| ------------------- | --------------------------------- | -------------------------------------- | ---------------------------------------------------------------------- |
| Vercel              | Hosting, functions, cron          | Maintain subscription                  | Rotate exposed token; keep production project and spend alerts active |
| Vercel AI Gateway   | Governed final AI route           | Optional reserve before scale          | Verify OIDC/API key, per-key budget, alerts, and credits               |
| Supabase            | Postgres data plane               | Healthy connected project              | Run DB health and migrations; retain password-screening controls      |
| Stripe              | Customer billing                  | **blocked: -$207 available balance**   | Resolve balance/debits; verify live webhook and catalog                |
| OpenAI              | Primary reasoning + Realtime      | **required**                           | Maintain project budget, payment method, usage alerts, scoped keys    |
| Gemini              | Direct AI continuity              | Recommended                            | Retain accepted key and quota/billing fallback                         |
| xAI                 | Optional voice/reasoning experiment| Optional                              | Keep capped and opt-in; do not make launch depend on it                |
| Vapi                | PSTN orchestration                | **required**                           | Verify key, phone inventory, billing, webhooks, and live call matrix   |
| Twilio              | Carrier, numbers, SMS, WhatsApp   | **required; credentials must rotate**  | Re-probe account/inventory; add Usage Triggers and channel tests       |
| ElevenLabs          | Optional clones/showcase          | **degraded: free-tier entitlement**    | Upgrade only when cloning/showcase is enabled and consented            |
| Resend              | Transactional email               | **required**                           | Verify production key, sending domain, from-address, and delivery      |
| Upstash             | Distributed rate limits           | **required**                           | Maintain production database and billing                              |
| Federal DNC vendor  | Marketing scrub                   | **blocked until HTTPS probe passes**   | Correct endpoint/key and fund scrub volume before campaigns            |
| Sentry              | Error alerts                      | Recommended                            | Verify backend/browser event receipt and alert routing                 |
| LiveAvatar / HeyGen | Video add-on                      | Not core launch                        | Fund only after consent, pricing, and demand gates pass                |
| Apollo / Perplexity | Enrichment/research               | Not core launch                        | Add capped budget only when Lead Hunt is sold                          |

Funding guidance is a reserve policy, not permission for uncapped auto-spend.
Set provider-level budgets below Wireline account-level spend caps.

## Connector inventory

| Vendor / surface                     | Role                                    | State                   | Launch boundary                                      |
| ------------------------------------ | --------------------------------------- | ----------------------- | ---------------------------------------------------- |
| Google Workspace                     | Sign-in, Gmail, calendar, Drive/Sheets  | live / verify prod      | Tenant retains Workspace plan                        |
| Microsoft 365                        | Sign-in, Outlook, Teams, Excel/OneDrive | live / verify prod      | Tenant retains Microsoft plan                        |
| HubSpot / Salesforce                 | CRM writeback                           | beta                    | Verify OAuth app review and tenant permissions       |
| Shopify / Square                     | Commerce actions                        | beta                    | Do not claim full parity without E2E tests            |
| Slack / Zoom                         | Alerts and meetings                     | beta                    | Verify OAuth and webhook paths                        |
| Apollo                               | Enrichment                              | beta                    | Platform budget or tenant credential                 |
| Meta / X Ads                         | Lead ingest and attribution             | beta                    | App review plus ad-account funding                    |
| Yahoo Mail                           | Mailbox OAuth                           | planned                 | Do not market full parity                             |
| DocuSign                             | E-sign                                  | beta                    | Verify JWT/access-token path                          |
| ChatGPT App / MCP                    | Account-bound drafting/simulation       | beta                    | No unapproved live-call side effects                  |
| Browser extension                    | Explicit page-context handoff           | beta                    | Store review and privacy verification                 |
| iOS / Android                        | Urgent owner control                    | beta                    | Signing, native QA, and store approval                |
| Video presenter                      | LiveAvatar/HeyGen                       | planned/beta add-on     | Separate consent and prepaid credits                  |
| Figma / Canva / GitHub design export | Design schema/env only                  | planned                 | Do not fund until active routes exist                 |
| Linear / Discord / Telegram          | No active integration                   | not implemented         | Do not market or fund                                 |

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
