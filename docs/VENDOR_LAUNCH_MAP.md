# Vendor Launch Map

**Status:** Active canonical operating map.  
**Updated:** August 30, 2026.

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

### SMS

SMS sender inventory is not equivalent to carrier registration. US messaging must use the appropriate approved toll-free or A2P 10DLC registration and tenant isolation model before volume traffic is opened. STOP/HELP and consent behavior must be exercised end to end.

### Federal DNC

Marketing/campaign outbound must remain fail-closed while the federal DNC vendor is unconfigured. Configure the real vendor endpoint/login identifier, run the non-billable probe, and persist screening evidence before opening scaled marketing outbound. Never substitute a Vercel access token or other unrelated credential.

### WhatsApp

WhatsApp remains optional/private until an approved sender, Meta/WABA posture, callback routing, consent, and template behavior are proven. Do not market it as generally available based on code support alone.

## Security and operations

- Keep production secrets server-side and target-scoped in Vercel.
- Use Upstash-backed distributed limits for production abuse controls.
- Keep call artifacts transcript-only unless a future explicit, auditable recording feature is introduced.
- Public trust copy must match deployed retention, recording, and monitoring behavior.
- Production health/status endpoints are evidence surfaces, not contractual uptime guarantees.
- Rotate personal access tokens after use; never commit them or document them here.

## Release evidence

Before production merge, require:

1. exact-head Vercel preview build READY;
2. TypeScript application/server/audit-module checks green;
3. ESLint green;
4. full Vitest suite green;
5. canonical Stripe catalog/static billing contracts green;
6. no unresolved regression introduced by the branch;
7. production deployment READY after merge; and
8. current runtime-error and public-health checks clean.

GitHub Actions billing/startup failures that do not execute repository code are tracked separately and are not treated as code evidence. Exact-head Vercel certification remains the compensating release gate while that external billing condition persists.

## Funding review order

Treat balances and invoice amounts as dated evidence, never as permanent facts in this map.
A readable API key, a READY build, or an empty error log does not prove funded service.

| Priority | Account | Verify before allocating money |
| --- | --- | --- |
| Restore availability | Vercel | Open invoices, project pause, deployment limits, and canonical health. Restore the canonical project; do not duplicate it. |
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
- `npm run stripe:audit-live` — read-only live Stripe/account/catalog audit.
- `npm run dnc:probe` — federal DNC diagnostic after credentials exist.
- `/api/health`, `/api/health/launch-readiness`, and authenticated `/api/insights/voice-reliability?days=1` — deployed health evidence appropriate to each audience.

When an executable probe and current source disagree, fix the probe rather than weakening the product contract or documenting the stale result as truth.
