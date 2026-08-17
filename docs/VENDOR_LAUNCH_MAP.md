# Vendor Launch Map

**Status:** Active canonical operating map.  
**Updated:** August 17, 2026.

This document records Wireline's intended production provider roles and the evidence required before a capability is treated as launch-ready. Historical balances, account screenshots, temporary tokens, and one-off audit results do not belong here; use the executable probes and deployment logs for current evidence.

## Runtime stack

| Plane | Primary | Continuity / boundary |
| --- | --- | --- |
| Structured reasoning | xAI Grok 4.6 managed structured runtime | OpenAI, then Gemini, then Vercel AI Gateway |
| PSTN orchestration | Vapi | xAI Grok 4.3 call model and xAI voices; OpenAI application-layer fallback |
| Carrier + SMS | Twilio | Tenant registration and sender eligibility remain separate compliance gates |
| Managed speech | ElevenLabs / managed Vapi voices | Curated Vapi fallback per voice |
| Live browser voice | Vapi web, same xAI Grok 4.3 + xAI voices as PSTN | OpenAI Realtime automatic backup; ChatGPT widget stays OpenAI |
| Public research | Perplexity when configured | Gemini grounded research fallback |
| Payments | Stripe | Webhook-owned entitlements and prepaid Runtime Balance |
| Database | Managed Postgres / Supabase infrastructure | Server-owned migrations and application auth controls |
| Rate limiting / shared cache | Upstash Redis | Production must not rely on per-instance memory limits |
| Transactional email | Resend | Commercial mail additionally requires a valid postal address |
| Live Video | Retired | Identity badges stay. Work companions draft clip scripts. LiveAvatar/HeyGen are not minted. Imagine files are not generated. |

## Live Video — retired talking-head

Live talking-head sessions are retired. Identity badges remain the in-app visual. Work companions draft clip scripts. Imagine file generation is not offered (Grok watermark cannot be turned off; AUP forbids stripping it).

Leftover Stripe Live Video price IDs may still exist so webhooks do not brick billing. App checkout and session mint stay closed.

- `isLiveVideoCatalogReady()` is always false.
- `POST /api/billing/live-video-checkout` fails closed.
- Session, avatar, and enable routes return `410 LIVE_VIDEO_RETIRED`.


## Billing and commercial truth

- Public paid plans are the canonical Founder catalog in `src/lib/plan-catalog.ts` and `scripts/lib/stripe-founder-catalog.mjs`.
- Voice overflow uses prepaid Runtime Balance; Wireline does not create surprise postpaid voice overage invoices.
- Live Video is a separate fixed recurring add-on and does not use Stripe usage metering.
- Stripe checkout, webhook, entitlement, portal, cancellation, refund/dispute, and add-on lifecycle must remain server-owned and idempotent.
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
- Keep Vapi managed-call artifacts transcript-only unless a future explicit, auditable recording feature is introduced.
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

## Executable probes

- `npm run vendor:readiness` — non-billable provider/configuration snapshot. Treat its output as point-in-time evidence; product policy is defined by current source and this map.
- `npm run stripe:catalog:check` — static canonical Stripe contract.
- `npm run stripe:audit-live` — read-only live Stripe/account/catalog audit.
- `npm run dnc:probe` — federal DNC diagnostic after credentials exist.
- `/api/health`, `/api/health/launch-readiness`, and `/api/health/voice-status` — deployed health evidence appropriate to each audience.

When an executable probe and current source disagree, fix the probe rather than weakening the product contract or documenting the stale result as truth.