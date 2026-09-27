# Vendor Launch Map

**Status:** Active canonical operating map.  
**Updated:** September 27, 2026.

This document records BotBound's intended production provider roles and the evidence required before a capability is treated as launch-ready. Historical balances, account screenshots, temporary tokens, and one-off audit results do not belong here; use the executable probes and deployment logs for current evidence.

## Runtime stack

| Plane | Primary | Continuity / boundary |
| --- | --- | --- |
| Structured reasoning | OpenAI GPT-5.6 Terra managed structured runtime | Vercel AI Gateway, then Gemini |
| PSTN orchestration | OpenAI Realtime (`gpt-realtime-2.1`) over Twilio SIP | One runtime for founder and customer Bots; no alternate provider fallback |
| Carrier + SMS | Twilio | Tenant registration and sender eligibility remain separate compliance gates |
| Managed speech | OpenAI Realtime documented voice roster; OpenAI TTS for approved campaign narration | No alternate speech catalog or voice-cloning provider |
| Live browser voice | OpenAI Realtime (`gpt-realtime-2.1`) over authenticated WebRTC | Authenticated Studio and ChatGPT rehearsals use server-owned policy; public voice previews are retired |
| Public research | Perplexity when configured | Gemini grounded research fallback |
| Payments | Stripe | Webhook-owned entitlements and prepaid Runtime Balance |
| Database | Managed Postgres / Supabase infrastructure | Server-owned migrations and application auth controls |
| Rate limiting / shared cache | Upstash Redis | Production must not rely on per-instance memory limits |
| Transactional email | Resend | Commercial mail additionally requires a valid postal address |
| Live Video | Retired | Identity badges stay. LiveAvatar/HeyGen are not minted. Video files are not generated. |

## Live Video — retired talking-head

Live talking-head sessions are retired. Identity badges remain the in-app visual. Video files and clip-script substitutes are not offered. A later vendor may own real clips. Until then the Bot focuses on phone, email, and text.

Leftover Stripe Live Video price IDs may still exist so webhooks do not brick billing. App checkout and session mint stay closed.

- `isLiveVideoCatalogReady()` is always false.
- `POST /api/billing/live-video-checkout` fails closed.
- Session, avatar, and enable routes return `410 LIVE_VIDEO_RETIRED`.


## Billing and commercial truth

- Public paid plans are the canonical Founder catalog in `src/lib/plan-catalog.ts` and `scripts/lib/stripe-founder-catalog.mjs`.
- Voice overflow uses prepaid Runtime Balance; BotBound does not create surprise postpaid voice overage invoices.
- Leftover Live Video price IDs are reconciliation-only legacy records. No checkout, entitlement, or session can be created.
- Stripe checkout, webhook, entitlement, portal, cancellation, and refund/dispute handling must remain server-owned and idempotent.
- Run `npm run stripe:catalog:check` before any catalog mutation and the read-only live Stripe audit before a billing release.

## Communications compliance

### Voice

Production voice inventory is not equivalent to compliance clearance. Before scaled outbound traffic, prove the responsible business identity, applicable caller-ID/attestation posture, consent basis, quiet-hour rules, DNC handling, and live transfer/handoff behavior.

The call's purpose and recipient permission are separate from the area code a customer chooses for their business number. A customer choosing a local number does not grant permission to call people in that area. Customer attestations also do not replace BotBound's server-owned consent and suppression checks.

| Flow | Current launch boundary |
| --- | --- |
| Private Studio Build/Test | No recipient is dialed; keep external actions disabled and provider spend capped. |
| Inbound customer call | A caller reaches the business voluntarily; verify routing, paid coverage, identification, and applicable recording/transcription policy. Federal outbound screening is not a prerequisite to receiving the call. |
| Requested callback | Require the existing server-recorded callback request, destination, purpose and one-time execution controls. Keep suppression, calling-hour and coverage checks. A generic form submission is not interchangeable with that request. |
| Appointment, support, recruiting, payment or other service call | Do not infer consent from a purpose label or an existing relationship. Applicable artificial-voice consent and state rules still matter. Keep direct dialing closed until the required auditable recipient permission and the supported workflow exist. |
| Marketing/campaign call | Require auditable recipient permission, applicable written consent, current screening, internal suppression, calling hours, identification and working opt-out. Fail closed when the required evidence or screening service is unavailable. |

FCC 24-17 treats AI-generated voices as artificial/prerecorded voices under the TCPA; it does not make nonmarketing AI calls universally exempt. Explicit AI identification is BotBound policy. FCC 24-84 proposed additional AI-specific disclosures and is not itself a final disclosure rule. The January 2025 court decision vacated the FCC's new one-to-one consent restriction; do not describe that vacated rule as an operative January 2025 requirement. Existing applicable consent obligations remain. [FCC 24-17](https://docs.fcc.gov/public/attachments/FCC-24-17A1.pdf), [current calling rules](https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-64/subpart-L/section-64.1200), [FCC proposal](https://docs.fcc.gov/public/attachments/FCC-24-84A1_Rcd.pdf), [court decision](https://media.ca11.uscourts.gov/opinions/pub/files/202410277.pdf).

State recording consent is a separate question. A notice, area-code inference, or continued conversation is not universal proof of all required consent. Do not market the product as eliminating legal exposure. For example, Illinois regulates surreptitious recording/transmission of private conversations; its rule is not simply a notice checkbox. [Illinois statute](https://ilga.gov/documents/legislation/ilcs/documents/072000050K14-2.htm).

### SMS

SMS sender inventory is not equivalent to carrier registration. US messaging must use the appropriate approved toll-free or A2P 10DLC registration and tenant isolation model before volume traffic is opened. STOP/HELP and consent behavior must be exercised end to end.

### Federal DNC

Marketing/campaign outbound must remain fail-closed while the federal DNC vendor is unconfigured. Configure the real vendor endpoint/login identifier, run the non-billable probe, and persist screening evidence before opening scaled marketing outbound. Never substitute a Vercel access token or other unrelated credential.

### WhatsApp

WhatsApp remains optional/private until an approved sender, Meta/WABA posture, callback routing, consent, and template behavior are proven. Do not market it as generally available based on code support alone.

## Security and operations

- Keep production secrets server-side in Render's production secret store. Local development and previews use dedicated sandbox values.
- Use Upstash-backed distributed limits for production abuse controls.
- Keep call artifacts transcript-only unless a future explicit, auditable recording feature is introduced.
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

| Priority | Account | Verify before allocating money |
| --- | --- | --- |
| Restore availability | Render | Open invoices, API/voice service state, scheduler execution, deployment source parity, and canonical health. Restore the existing production services; do not duplicate them. |
| Protect phone continuity | Twilio | Actual balance/currency, recharge failures, recurring number inventory, and carrier eligibility. Reuse detached owned numbers before automatic purchase. |
| Protect Bot runtime | OpenAI API | Correct organization/project, credit or billing status, usage limits, and Realtime access. An enabled model key alone does not prove funded usage. |
| Preserve infrastructure | Supabase, Upstash, domain registrar | Active plan, invoices, usage limits, renewal date and payment method. Check the selected account before paying. |
| Deliver email | Resend, AgentMail | Plan/quota, verified BotBound domain, signed callbacks, and sending/receiving proof. A domain being verified does not certify callback delivery. |
| Collect customer payments | Stripe | Account requirements, payout eligibility, negative balances or failed debits, and a controlled checkout lifecycle. Do not add funds just to manufacture test evidence. |
| Restore release automation | GitHub | Billing/spending limits and whether jobs actually executed. Never classify a test failure as a billing failure. |
| Optional paid features | Vercel AI Gateway, Gemini, Perplexity, Apollo, X | Only fund the route or integration actually enabled and needed by the approved cohort. Track its quota separately from the primary runtime. |
| Later launch gates | Federal DNC, Apple Developer, Google Play | Registration/approval and relevant service funding when those surfaces are deliberately opened. These are not substitutes for core pilot evidence. |

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
