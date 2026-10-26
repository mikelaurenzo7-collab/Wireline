# Vendor Launch Map

**Status:** Active canonical operating map.  
**Updated:** October 25, 2026.

> Current source routes structured reasoning through xAI first, then OpenAI. Gemini is retired and AI Gateway is disabled on Render. [Deployment Runbook](DEPLOYMENT_RUNBOOK.md) governs actual provider configuration; do not enable an optional provider merely because it appears in this map.

This document records BotBound's intended production provider roles and the evidence required before a capability is treated as launch-ready. Historical balances, account screenshots, temporary tokens, and one-off audit results do not belong here; use the executable probes and deployment logs for current evidence.

## Runtime stack

| Plane                        | Primary                                                                                                 | Continuity / boundary                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Structured reasoning         | xAI `grok-4.7` managed structured runtime                                                               | OpenAI GPT-5.6 Terra backup; source policy in `src/lib/ai-models.ts`                                       |
| PSTN orchestration           | xAI Grok Voice for registered lines when selected; OpenAI Realtime otherwise                            | Call-bound routing; cloned and catalog speech use the persistent media bridge                              |
| Carrier + SMS                | Twilio                                                                                                  | Tenant registration and sender eligibility remain separate compliance gates                                |
| Managed speech               | Stock voice roster, prepared ElevenLabs and public Cartesia catalog voices, consented ElevenLabs clones | Catalog and cloning require provider capacity, server-side entitlement and actual phone acceptance         |
| Live browser voice           | OpenAI Realtime (`gpt-realtime-2.1`) over authenticated WebRTC                                          | Authenticated Studio and ChatGPT rehearsals use server-owned policy; public voice previews are retired     |
| Public research              | Perplexity when configured                                                                              | Managed Responses API web search fallback in `src/lib/live-web-research.ts`                                |
| Payments                     | Stripe, BotBound account `acct_1TkyXL8e6If87QKm`                                                        | Do not bill on BOTBOUND LLC. Shared-work subscriptions and preserved package plans keep their own accounting |
| Database                     | Managed Postgres / Supabase infrastructure                                                              | Server-owned migrations and application auth controls                                                      |
| Rate limiting / shared cache | Upstash Redis                                                                                           | Production must not rely on per-instance memory limits                                                     |
| Transactional email          | Resend                                                                                                  | Commercial mail additionally requires a valid postal address                                               |
| Live Video                   | Retired                                                                                                 | Identity badges stay. LiveAvatar/HeyGen are not minted. Video files are not generated.                     |

## Live Video — retired talking-head

Live talking-head sessions are retired. Identity badges remain the in-app visual. Video files and clip-script substitutes are not offered. A later vendor may own real clips. Until then the Bot focuses on phone, email, and text.

Leftover Stripe Live Video price IDs may still exist so webhooks do not brick billing. App checkout and session mint stay closed.

- `isLiveVideoCatalogReady()` is always false.
- `POST /api/billing/live-video-checkout` fails closed.
- Session, avatar, and enable routes return `410 LIVE_VIDEO_RETIRED`.

## Billing and commercial truth

- New public enrollment is Lite, Starter and Plus in `src/lib/usage-billing-catalog.ts` and `scripts/stripe-usage-billing-setup.mjs`; see [Usage Billing](USAGE_BILLING.md). The earlier Founder/package catalog remains compatibility-only.
- Shared-work subscriptions meter calls, US SMS, sent email replies and Computer against one allowance and a disclosed pretax spending cap. Package plans and prepaid Runtime Balance retain their separate funding rules; do not mix the two billing models.
- Leftover Live Video price IDs are reconciliation-only legacy records. No checkout, entitlement, or session can be created.
- Stripe checkout, webhook, entitlement, portal, cancellation, and refund/dispute handling must remain server-owned and idempotent.
- Run `npm run stripe:catalog:check` before any catalog mutation and the read-only live Stripe audit before a billing release.

## Communications compliance

### Voice

Production voice inventory is not equivalent to compliance clearance. Before scaled outbound traffic, prove the responsible business identity, applicable caller-ID/attestation posture, consent basis, quiet-hour rules, DNC handling, and live transfer/handoff behavior.

The call's purpose and recipient permission are separate from the area code a customer chooses for their business number. A customer choosing a local number does not grant permission to call people in that area. Customer attestations also do not replace BotBound's server-owned consent and suppression checks.

| Flow                                                            | Current launch boundary                                                                                                                                                                                                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Private Studio setup/rehearsal                                  | No recipient is dialed; keep external actions disabled and provider spend capped.                                                                                                                                                                       |
| Inbound customer call                                           | A caller reaches the business voluntarily; verify routing, paid coverage, identification, and applicable recording/transcription policy. Federal outbound screening is not a prerequisite to receiving the call.                                        |
| Requested callback                                              | Require the existing server-recorded callback request, destination, purpose and one-time execution controls. Keep suppression, calling-hour and coverage checks. A generic form submission is not interchangeable with that request.                    |
| Appointment, support, recruiting, payment or other service call | Do not infer consent from a purpose label or an existing relationship. Applicable artificial-voice consent and state rules still matter. Keep direct dialing closed until the required auditable recipient permission and the supported workflow exist. |
| Marketing/campaign call                                         | Require auditable recipient permission, applicable written consent, current screening, internal suppression, calling hours, identification and working opt-out. Fail closed when the required evidence or screening service is unavailable.             |

FCC 24-17 treats AI-generated voices as artificial/prerecorded voices under the TCPA; it does not make nonmarketing AI calls universally exempt. Explicit AI identification is BotBound policy. FCC 24-84 proposed additional AI-specific disclosures and is not itself a final disclosure rule. The January 2025 court decision vacated the FCC's new one-to-one consent restriction; do not describe that vacated rule as an operative January 2025 requirement. Existing applicable consent obligations remain. [FCC 24-17](https://docs.fcc.gov/public/attachments/FCC-24-17A1.pdf), [current calling rules](https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-64/subpart-L/section-64.1200), [FCC proposal](https://docs.fcc.gov/public/attachments/FCC-24-84A1_Rcd.pdf), [court decision](https://media.ca11.uscourts.gov/opinions/pub/files/202410277.pdf).

State recording consent is a separate question. A notice, area-code inference, or continued conversation is not universal proof of all required consent. Do not market the product as eliminating legal exposure. For example, Illinois regulates surreptitious recording/transmission of private conversations; its rule is not simply a notice checkbox. [Illinois statute](https://ilga.gov/documents/legislation/ilcs/documents/072000050K14-2.htm).

### SMS

SMS sender inventory is not equivalent to carrier registration. US messaging must use the appropriate approved toll-free or A2P 10DLC registration and tenant isolation model before volume traffic is opened. STOP/HELP and consent behavior must be exercised end to end.

### Federal DNC

Marketing/campaign outbound must remain fail-closed while the federal DNC vendor or
the seller's own subscription is unavailable. The supported DNCScrub configuration is
`FEDERAL_DNC_PROVIDER=dncscrub`,
`FEDERAL_DNC_API_URL=https://www.dncscrub.com/app/main/rpc/scrub`, and a server-only
`FEDERAL_DNC_API_KEY` containing the generated API user's key (sent as `loginId`).
The API key is not the seller's Subscription Account Number (SAN).

Each seller records its legal name, SAN, covered area codes and expiry in Compliance.
Configure a separate vendor project with that SAN, then link the exact project through
the platform-admin DNC registration route. Runtime sends its `projId` on marketing
lookups and rejects missing, unlinked, expired or uncovered seller registrations.
One BotBound subscription cannot be shared across unrelated customer sellers.

Validate vendor authentication and project access, then retain scoped scrub evidence.
`npm run dnc:probe` checks a synthetic number on the default project; it neither proves
seller linkage nor grants permission to call. It makes a vendor API request, whose
billing depends on the vendor agreement. Keep internal suppression, written marketing
consent, supported calling hours and provider gates intact. The current version-5
scrub response remains supported by the vendor; do not change formats without updating
both runtime and probe parsing. See [API authentication](https://docs.dncscrub.com/api-reference/authentication),
[project setup](https://docs.dncscrub.com/api-reference/other/project-create), and
[FTC seller subscriptions](https://www.ftc.gov/business-guidance/resources/qa-telemarketers-sellers-about-dnc-provisions-tsr-0).

### WhatsApp

WhatsApp remains optional/private until an approved sender, Meta/WABA posture, callback routing, consent, and template behavior are proven. Do not market it as generally available based on code support alone.

## Security and operations

- Keep production secrets server-side in Render's production secret store. Local development and previews use dedicated sandbox values.
- Use Upstash-backed distributed limits for production abuse controls.
- Call recording is optional and requires the implemented disclosure, consent and ownership controls. A transcript or a configured recording option does not establish that a particular call was recorded or lawfully accepted.
- Public trust copy must match deployed retention, recording, and monitoring behavior.
- Production health/status endpoints are evidence surfaces, not contractual uptime guarantees.
- Rotate personal access tokens after use; never commit them or document them here.

## Release evidence

Before production merge, require:

1. full local verification and review of the exact source, with the Render release sequence in `docs/DEPLOYMENT_RUNBOOK.md`;
2. TypeScript application/server/audit-module checks green;
3. ESLint green;
4. full Vitest suite green;
5. canonical Stripe catalog/static billing contracts green;
6. no unresolved regression introduced by the branch;
7. required Render production services live on that reviewed source, with authenticated worker readiness and source parity after merge; and
8. current runtime-error and public-health checks clean.

GitHub Actions billing/startup failures that do not execute repository code are tracked separately and are not treated as code evidence. Exact-head verification and Render release certification remain required while that external billing condition persists. A legacy Vercel check does not certify Render.

## Funding review order

Treat balances and invoice amounts as dated evidence, never as permanent facts in this map.
A readable API key, a READY build, or an empty error log does not prove funded service.

| Priority                   | Account                                                         | Verify before allocating money                                                                                                                                                |
| -------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Restore availability       | Render                                                          | Open invoices, API/voice service state, scheduler execution, deployment source parity, and canonical health. Restore the existing production services; do not duplicate them. |
| Protect phone continuity   | Twilio                                                          | Actual balance/currency, recharge failures, recurring number inventory, and carrier eligibility. Reuse detached owned numbers before automatic purchase.                      |
| Protect Bot runtime        | OpenAI API                                                      | Correct organization/project, credit or billing status, usage limits, and Realtime access. An enabled model key alone does not prove funded usage.                            |
| Preserve infrastructure    | Supabase, Upstash, domain registrar                             | Active plan, invoices, usage limits, renewal date and payment method. Check the selected account before paying.                                                               |
| Deliver email              | Resend, AgentMail                                               | Plan/quota, verified BotBound domain, signed callbacks, and sending/receiving proof. A domain being verified does not certify callback delivery.                              |
| Collect customer payments  | Stripe                                                          | Account requirements, payout eligibility, negative balances or failed debits, and a controlled checkout lifecycle. Do not add funds just to manufacture test evidence.        |
| Restore release automation | GitHub                                                          | Billing/spending limits and whether jobs actually executed. Never classify a test failure as a billing failure.                                                               |
| Optional paid features     | Perplexity, Apollo, X and other explicitly enabled integrations | Only fund the route or integration actually needed by the approved cohort. Track its quota separately from the primary runtime; retired providers are not funding targets.    |
| Later launch gates         | Federal DNC, Apple Developer, Google Play                       | Registration/approval and relevant service funding when those surfaces are deliberately opened. These are not substitutes for core pilot evidence.                            |

Review CRM/calendar/commerce OAuth connections (Google, Microsoft, Yahoo, HubSpot, Salesforce,
Shopify, Square, Zoom, Slack, Meta, DocuSign) against the selected tenant's subscription and scopes.
Code support alone does not mean the founder needs to buy every vendor subscription.
Retired Vapi, LiveAvatar, and HeyGen runtime paths are not core launch funding targets.

For each current account check, retain the observation time, selected account, source,
actual amount/currency if visible, service impact, next action, and an explicit unknown when
access is unavailable. Never turn an unread balance into zero or a healthy status.

## Executable probes

- `npm run vendor:readiness` — non-billable provider/configuration snapshot. Treat its output as point-in-time evidence; product policy is defined by current source and this map.
- `npm run stripe:catalog:check` — static canonical Stripe contract.
- `npm run stripe:audit-live` — read-only Stripe account/product/catalog audit using the current host's injected key; run in the authorized Render production shell.
- `npm run dnc:probe` — federal DNC diagnostic after credentials exist.
- `/api/health`, `/api/health/launch-readiness`, and authenticated `/api/insights/voice-reliability?days=1` — deployed health evidence appropriate to each audience.

When an executable probe and current source disagree, fix the probe rather than weakening the product contract or documenting the stale result as truth.
