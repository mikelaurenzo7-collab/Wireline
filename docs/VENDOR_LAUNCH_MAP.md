# Vendor Launch Map

Status: **Active canonical vendor, funding, and configuration inventory**.
Executable probe: `npm run vendor:readiness`.

## Current launch snapshot — 2026-07-19

Production deployment and database are healthy. AI keys, Vapi, ElevenLabs,
Resend, Stripe, Supabase, Upstash, and the main OAuth registrations are present
in the Vercel `revaluate/wireline` project. The public health endpoint reports
voice runtime, fallback, and reasoning as operational.

Three owner actions remain launch-blocking:

1. **Twilio credentials are rejected (HTTP 401).** Rotate
   `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN`, confirm the account is paid, and
   test one SMS plus one number-provisioning flow.
2. **Stripe has a negative available balance of $207.00.** The audit found two
   $103.50 Stripe Tax subscription charges and repeated failed bank
   withdrawals. Settle the balance and decide whether the Tax subscription
   should be kept or replaced with the appropriate pay-as-you-go posture before
   accepting customers.
3. **`FEDERAL_DNC_API_URL` is present but is not a valid HTTPS URL.** Replace it
   with the actual scrub endpoint. Marketing outbound remains a no-go until the
   vendor probe and Compliance Center both pass.

The monitor-token request to production returned `401`; rotate or separately
set `HEALTH_MONITOR_TOKEN`, then point the uptime monitor at
`/api/health/launch-readiness`.

## Runtime decision

Do not substitute ElevenLabs for xAI or Vercel AI Gateway. They occupy different
planes:

| Plane                | Primary                         | Fallback / boundary                                      |
| -------------------- | ------------------------------- | -------------------------------------------------------- |
| Structured reasoning | xAI Grok 4.5 direct             | OpenAI → Gemini → AI Gateway                             |
| PSTN calls           | Twilio number → Vapi            | OpenAI call model → Gemini                               |
| Phone speech         | Deepgram STT + managed Vapi TTS | Twilio fallback response                                 |
| Studio live voice    | xAI Grok realtime               | OpenAI Realtime is a separate manual continuity endpoint |
| Cloning/showcase TTS | ElevenLabs                      | Optional; never the reasoning runtime                    |

Keep the tested direct-provider chain for launch. Use AI Gateway as the funded,
budgeted last-resort route and observability/control option for future
non-realtime consolidation after production baselines exist.

## Funding and account posture

| Vendor              | Product role                   | Account model                   | Fund now?               | Launch action                                                                        |
| ------------------- | ------------------------------ | ------------------------------- | ----------------------- | ------------------------------------------------------------------------------------ |
| Vercel              | Hosting, functions, cron       | Subscription                    | Maintain                | Keep `wireline` production project and payment method active.                        |
| Vercel AI Gateway   | Last AI fallback               | Prepaid credits                 | **Yes, modest reserve** | Add credits, auto-top-up, and a per-key monthly budget.                              |
| Supabase            | Postgres data plane            | Subscription                    | Maintain                | Project is `ACTIVE_HEALTHY`; run `npm run db:health` before releases.                |
| Stripe              | Customer billing               | Processor balance               | **Resolve -$207**       | Fix failed bank debit; review Stripe Tax subscription; verify webhook.               |
| xAI                 | Structured + live voice        | Prepaid or invoiced limit       | **Confirm reserve**     | Keep enough prepaid credit or a nonzero invoiced limit for two launch weeks.         |
| OpenAI              | PSTN model + fallback          | Billing method / project budget | **Confirm reserve**     | Payment method, project budget, and alerts; do not use for all workloads by default. |
| Gemini              | AI/PSTN fallback               | Google Cloud billing            | Maintain                | Key is accepted; retain as inexpensive failure fallback.                             |
| Vapi                | PSTN orchestration             | Credits + concurrency           | **Confirm credits**     | Dashboard → Settings → Billing; enable auto-reload and review call lines.            |
| Twilio              | Number purchase, SMS, WhatsApp | Paid account + usage billing    | **Blocked first**       | Credentials currently fail; rotate, upgrade/pay, add Usage Triggers.                 |
| ElevenLabs          | Optional clones/showcase       | Creator subscription + credits  | **No immediate top-up** | Creator is active with 130,840 credits remaining at audit; keep optional.            |
| Resend              | Transactional email            | Subscription                    | Maintain                | `trywireline.com` is verified; keep sending plan healthy.                            |
| Upstash             | Distributed rate limits        | Subscription                    | Maintain                | Required for production abuse protection.                                            |
| Federal DNC vendor  | Marketing scrub                | Subscription/credits            | **Yes before outbound** | Correct HTTPS endpoint and maintain scrub volume before campaigns.                   |
| Sentry              | Error alerts                   | Subscription                    | Maintain                | Backend and browser report path must stay healthy.                                   |
| Plausible           | Product analytics              | Subscription                    | Maintain if used        | Verify domain/event receipt before paid acquisition.                                 |
| LiveAvatar / HeyGen | Video add-on                   | Prepaid credits                 | Not for core launch     | Fund only after consent, pricing, and demand gates pass.                             |
| Apollo / Perplexity | Enrichment/research            | Prepaid API                     | Not for core launch     | Add a capped budget only when Lead Hunt is sold.                                     |

Funding guidance is a reserve policy, not permission for uncapped auto-spend.
Set provider-level limits below Wireline's account-level spend caps.

## Connector inventory

| Vendor / surface                     | Role                                    | State                   | Owner payment                                        |
| ------------------------------------ | --------------------------------------- | ----------------------- | ---------------------------------------------------- |
| Google Workspace                     | Sign-in, Gmail, calendar, Drive/Sheets  | **live**                | Google Cloud project; tenants retain Workspace plans |
| Microsoft 365                        | Sign-in, Outlook, Teams, Excel/OneDrive | **live**                | Azure app; tenants retain Microsoft plans            |
| HubSpot / Salesforce                 | CRM writeback                           | **live**                | OAuth apps; tenant subscriptions                     |
| Shopify / Square                     | Commerce actions                        | **beta**                | OAuth apps; tenant subscriptions/fees                |
| Slack / Zoom                         | Alerts and meetings                     | **beta**                | OAuth apps; tenant plans                             |
| Apollo                               | Enrichment                              | **beta**                | Platform API budget or tenant OAuth                  |
| Meta / X Ads                         | Lead ingest and attribution             | **beta**                | App review plus ad-account funding                   |
| Yahoo Mail                           | Mailbox OAuth                           | **planned**             | Do not market full parity yet                        |
| DocuSign                             | E-sign                                  | **beta**                | DocuSign plan                                        |
| ChatGPT App / MCP                    | Account-bound drafting/simulation       | **beta**                | OpenAI app review; no live-call side effects         |
| Browser extension                    | Explicit page-context handoff           | **beta**                | Store registration; no runtime balance               |
| iOS / Android                        | Urgent owner control                    | **beta**                | Apple Developer / Firebase; signing and store fees   |
| Video presenter                      | LiveAvatar/HeyGen                       | **planned/beta add-on** | Separate prepaid credits                             |
| Figma / Canva / GitHub design export | Design schema/env only                  | **planned**             | Do not fund until routes exist                       |
| Linear / Discord / Telegram          | No active integration                   | **not implemented**     | Do not fund                                          |

## Required owner checks

```bash
# Pull secrets without committing them.
npx vercel env pull .env.production --environment=production --yes

# Read-only provider auth/funding probes.
node --env-file=.env.production scripts/check-vendor-readiness.mjs

npm run db:health
npm run stripe:catalog:check
npm run check-prod-env
```

Never commit `.env.production`. Delete it after the audit.

## Stripe catalog discipline

Current active products match the Founder catalog and there are no active
subscriptions at the audit timestamp. Before future catalog writes:

1. Run `node scripts/audit-stripe-catalog-live.mjs` (read-only).
2. Confirm no subscriptions, payment links, or open checkout sessions reference
   retired objects.
3. Present exact product/price IDs for owner approval.
4. Only then run `npm run stripe:setup`.

## Sources

- Runtime registry: `src/lib/runtime-integrations-registry.ts`
- Workspace catalog: `src/lib/workspace-integration-catalog.ts`
- Runtime policy: `src/lib/ai-models.ts`
- Funding probe: `scripts/check-vendor-readiness.mjs`
- Surface tiers: `docs/CLIENT_SURFACES.md`
- Integration audit: `docs/INTEGRATION_VENDOR_AUDIT.md`
