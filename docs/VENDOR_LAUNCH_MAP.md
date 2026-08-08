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
- Twilio is active (`$20.76` balance, re-verified live 2026-08-07); **7/7** incoming numbers are
  voice+SMS capable and point voice at Vapi inbound, SMS at
  `https://trywireline.com/api/twilio-webhook/sms`, and status callbacks at Vapi. Messaging Service
  `MG92d5225d0c71519d74bc1c1f2f083287` (`Wireline Messaging`) holds the toll-free number and
  defers inbound to the number's webhook (`use_inbound_webhook_on_number: true`).
- **Toll-free SMS verification for `+1 (855) 542-7828` was TWILIO_REJECTED** ("Verbal Consent
  Script Must Be Provided") under the stale coordinAGENTS identity. Resubmitted live 2026-08-07
  (verification `HH720c68ae28f83278466af8226c2eba53`) under the Wireline identity with the verbal
  consent script that is pinned into the agent runtime (`vapi-tool-format.ts` →
  `send_text_message` guidance; contract-tested). Re-checked live 2026-08-08: status `IN_REVIEW`,
  no rejection reason. Until Twilio approves, US toll-free SMS from this number is subject to
  carrier blocking — watch for the review outcome at `mikelaurenzo7@gmail.com`. Note the runtime
  script gained two carrier elements (frequency + message type) after resubmission; the four
  originally attested elements are unchanged, so no re-attestation is needed — the script only
  got stricter.
- **No A2P 10DLC brand/campaign exists** for the six local tenant numbers; unregistered US 10DLC
  traffic is heavily filtered. The Trust Hub profile `coordinAGENTS` is twilio-approved, so a
  standard brand registration can proceed from it, but it incurs one-time/recurring carrier fees —
  owner decision before tenant SMS at volume. Adversarially verified constraints (2026-08-08,
  Twilio primary docs) that shape this decision:
  - **ISV model requires per-tenant registration.** Twilio's ISV onboarding requires a Primary
    Customer Profile for Wireline plus a Secondary Customer Profile and its own Brand for every
    end customer, populated with that customer's business details. There is no lawful shortcut of
    one Wireline brand sending all tenant SMS — tenant onboarding must collect legal business
    name, EIN, address, and an authorized contact before tenant SMS, and per-tenant registration
    fees plus approval lag belong in plan unit economics.
  - **Subaccount isolation is a suspension firewall.** Twilio states that when subaccounts are not
    mapped to individual customers, one customer's noncompliant traffic can force suspension of
    the primary Account — platform-wide SMS loss. Per-tenant subaccounts are business continuity,
    not bookkeeping.
  - **Sole Proprietor caps.** A Sole Proprietor campaign carries exactly one 10DLC number, and its
    OTP verification number must be a real US/CA mobile — not a Twilio/CPaaS number. Any
    multi-number tenant (separate inbound and campaign numbers) is forced onto Standard brand
    registration.
  - **One-to-one consent is NOT required (for now).** The Eleventh Circuit vacated Part III.D of
    the FCC's 2023 order (both one-to-one consent and the logically-and-topically-associated
    rule) as exceeding statutory authority; neither is in force. Do not market per-seller consent
    capture as a legal requirement, but keep the capability — the case was remanded and the FCC
    may re-promulgate.
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
3. **GitHub Actions is back on the billing limit — compensating gate active.** The 2026-08-01
   recovery did not hold: runs from 2026-08-04 onward show the `startup_failure` billing pattern
   again (two-to-twelve-second jobs, no logs). Owner direction 2026-08-07: treat these failures as
   billing noise, not code signal. Per this item's own standing rule, Vercel exact-head builds plus
   the local full verification ladder are again the compensating release gate. The contract gates
   added since 2026-08-06 still have never executed on a runner; their first real run remains their
   first true test once billing is restored.
4. **Rotate every Vercel personal token pasted into chat** after this pass; revoke each after
   redeploying any values changed with that credential.
5. **Configure and prove Federal DNCScrub with a live JSON scrub** before scaled marketing
   outbound. Set a valid endpoint/loginId in each intended environment; variable presence alone does
   not prove vendor authentication or disposition semantics.
   **Registration package (prepared 2026-08-07 from the live Stripe account record; owner must
   submit — the FTC certification and payment are legal attestations):**
   - Entity: sole proprietorship — Michael Laurenzo d/b/a Wireline (Stripe `business_type:
     individual`, identity verified; no EIN on file). Recommended first step: obtain a free IRS EIN
     online so no SSN appears on registry or vendor forms.
   - Profile data: Wireline, 914 West Van Buren Street, Chicago, IL 60607, US ·
     +1 (561) 727-0142 · https://trywireline.com · owner Gmail as contact.
   - Step 1 — FTC Telemarketer Account Profile at telemarketing.donotcall.gov → organization ID +
     password (shown once on screen, never emailed).
   - Step 2 — Subscribe and certify to receive the SAN. First five area codes are free; each
     additional area code is $82 in FY 2026. Start with the area codes of the first campaign lists.
   - Step 3 — Open the DNCScrub account at dnc.com keyed to that SAN; the issued `loginId` is the
     `FEDERAL_DNC_API_KEY`. Set it with `FEDERAL_DNC_API_URL` on the production target only (the
     preview boundary gate intentionally excludes it), then prove semantics with `npm run dnc:probe`.
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
    **Value prepared 2026-08-07** from the live Stripe records (tax head office and support address
    agree): `Wireline, 914 West Van Buren Street, Chicago, IL 60607`. One command applies it:
    `vercel env add WIRELINE_POSTAL_ADDRESS production` (repeat for `development`; keep it out of
    preview per the boundary policy).
    Server-side Sentry is now live (verified 2026-08-07): `SENTRY_DSN` is set on all targets and
    `src/lib/error-reporter.ts` posts exceptions to the Sentry store endpoint over native fetch with
    no SDK, so backend receipt is proven (`revaluate/wireline-backend` is receiving events). The
    remaining Sentry work is an explicit P0 alert policy; the browser reporter stays the bounded
    `/api/health/report` path and browser-side Sentry remains optional.
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
| Stripe              | Customer billing                                | **blocked: Cadence AI identity (verified live 2026-08-07)** | Apply the Dashboard rebrand below; run one live checkout-to-portal lifecycle   |
| xAI                 | Optional experiment only                        | credential ready; not launch-default                        | Fund only if explicitly opting into structured fallback; alert if enabled      |
| OpenAI              | Primary structured + Realtime + Vapi call model | credential ready                                            | Maintain budget, payment method, alerts, and scoped keys                       |
| Gemini              | Direct AI continuity                            | credential ready                                            | Retain quota/billing fallback                                                  |
| Vapi                | PSTN orchestration                              | credential ready; 18 numbers reachable                      | Confirm billing/auto-reload and complete live call matrix                      |
| Twilio              | Carrier, numbers, SMS, WhatsApp                 | active; ~$23.66; 9 voice/SMS; API key pair installed        | Rotate Auth Token when convenient; Usage Triggers; channel E2E                 |
| ElevenLabs          | Managed Studio TTS + private clones             | Creator; API/catalog ready; Vapi live proof pending         | Install Vapi BYOK; disable provider training; prove voice + fallback           |
| Resend              | Transactional + lifecycle email                 | domain verified (DKIM+SPF+DMARC p=none); `WIRELINE_POSTAL_ADDRESS` set 2026-08-07; delivery proof pending | Prove one real verification/reset + commercial footer; add DMARC `rua` reporting, then move to `p=quarantine` |
| Upstash             | Distributed rate limits                         | credentials ready                                           | Maintain production database and billing                                       |
| Federal DNC vendor  | Marketing scrub                                 | **unconfigured; marketing fails closed**                    | Configure valid loginId; prove live JSON semantics; maintain scrub credits     |
| Sentry              | Error alerts                                    | **live**: `SENTRY_DSN` set on all targets; server `reportError` posts to the store endpoint (no SDK); `revaluate/wireline-backend` receiving events | Set an alert policy on P0 tags; browser receipt still optional (bounded `/api/health/report` covers the client) |
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

## Stripe merchant identity — verified red, Dashboard-only

Read live from `acct_1TkyXL8e6If87QKm` on 2026-08-07. The **catalog is correct**:
all eight products are active, named `Wireline …`, and carry
`wireline_catalog_version=founder_early_access_2026_07_v6` with plan ids that
match `src/lib/plan-catalog.ts`. The account **identity around that catalog is
not**, and `stripeBrandReady` in `scripts/check-vendor-readiness.mjs` is
currently false on all four of its conditions.

| Stripe setting                                | Live value                     | Required                         | Where the customer sees it |
| --------------------------------------------- | ------------------------------ | -------------------------------- | -------------------------- |
| `settings.payments.statement_descriptor`       | `CADENCE AI`                   | `WIRELINE`                       | Card statement             |
| `settings.card_payments.statement_descriptor_prefix` | `CADENCE AI`             | `WIRELINE`                       | Card statement             |
| `business_profile.name`                        | `Cadence AI`                   | `Wireline`                       | Receipts, invoices         |
| `settings.dashboard.display_name`              | `Cadence AI`                   | `Wireline`                       | Portal, Stripe emails      |
| `business_profile.url`                         | `https://wireline-chi.vercel.app` | `https://trywireline.com`     | Receipts                   |
| `business_profile.support_url`                 | `null`                         | `https://trywireline.com`        | Receipts, portal           |
| `business_profile.support_email`               | `null`                         | a monitored address              | Receipts, portal           |
| `settings.branding.logo` / `icon` / colors     | all `null`                     | Wireline mark + brand colors     | Checkout, portal           |

A subscriber to "Wireline" currently sees `CADENCE AI` on their card statement.
That is the single highest-yield chargeback trigger in the billing surface, and
it is the reason this row blocks launch rather than merely being untidy.

These are Dashboard settings on a `type: standard` account; they are not
writable from the application. Apply them at:

1. **Public details** — <https://dashboard.stripe.com/settings/account>
   Set business name, dashboard display name, website
   (`https://trywireline.com`), support email, and support URL.
2. **Card statement** — <https://dashboard.stripe.com/settings/payments>
   Set the statement descriptor and the shortened/prefix form to `WIRELINE`.
   Changes apply to new charges; existing disputes keep the old descriptor.
3. **Branding** — <https://dashboard.stripe.com/settings/branding>
   Upload the Wireline mark and set the brand colors so Checkout and the
   customer portal stop rendering unbranded.

Then verify — this is the gate, not the Dashboard:

```bash
node --env-file=.env.production scripts/check-vendor-readiness.mjs
```

`stripeBrandReady` requires all of: `business_profile.name` matching
`/wireline/i`, `statement_descriptor` starting with `WIRELINE`, and both
`business_profile.url` and `business_profile.support_url` equal to
`https://trywireline.com`.

**Portal bootstrap is no longer unproved.** `POST /billing/portal`
(`src/routes/billing-portal-readiness-routes.ts`) calls
`ensureManagedPortalConfiguration` before `billingPortal.sessions.create` and
passes the configuration explicitly, so the managed configuration is created on
first use. The live account currently lists zero configurations because no
customer has opened the portal yet — that is the expected pre-launch state, not
a defect. What remains genuinely unproved is the live checkout-to-portal
lifecycle having been exercised end to end at least once.

## Launch economics — verified against the live catalog

Computed from `src/lib/plan-catalog.ts` at `EXPECTED_INCLUDED_UTILIZATION = 0.7`
against `LAUNCH_CONTRIBUTION_MARGIN_FLOOR = 0.45`:

| Plan          | $/mo | Included min | Revenue/min | Contribution margin |
| ------------- | ---- | ------------ | ----------- | ------------------- |
| Starter       | 19   | 60           | $0.317      | 56.3%               |
| Starter Plus  | 39   | 120          | $0.325      | 56.3%               |
| Pro           | 79   | 245          | $0.322      | 55.1%               |
| Business      | 159  | 450          | $0.353      | 54.2%               |

Every tier clears the floor, and the model already reserves carrier, voice
runtime, model variance, number rental, Stripe processing, Stripe Billing, and a
Stripe Tax transaction rate that is not yet live. That is a conservative model,
not an optimistic one.

The one asymmetry worth pricing attention: **prepaid Runtime Balance is the
least profitable revenue in the business.** At `FLAT_OVERAGE_PER_MIN_USD = 0.22`
against `VOICE_VARIABLE_COST_PER_MIN_USD = 0.128`, overage runs ~41.8% before
payment fees, and a minimum $10 top-up carries 5.9% in Stripe fees on top —
landing near 36% against 54–56% on subscription minutes. The `$10` floor
(`CONVERSATION_BALANCE_MIN_USD`) is doing real work here; a `$5` tier would
carry 8.9% in fees. The commercial implication is that a tenant repeatedly
topping up is worth less than the same tenant one plan higher, so balance-low
moments should lead with an upgrade path rather than a top-up button.

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
