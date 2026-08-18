# Vendor Launch Map

**Status:** Active canonical operating map.  
**Updated:** August 17, 2026.

This document records Wireline's intended production provider roles and the evidence required before a capability is treated as launch-ready. Historical balances, account screenshots, temporary tokens, and one-off audit results do not belong here; use executable probes and deployment logs for current evidence.

## Runtime stack

| Plane | Primary | Continuity / boundary |
| --- | --- | --- |
| Structured reasoning | xAI Grok 4.6 managed structured runtime | OpenAI, then Gemini, then Vercel AI Gateway |
| PSTN orchestration | Native Twilio + xAI Direct SIP | Provider-bound SIP session; xAI currently routes registered calls through Think Fast 2.0. Vapi is rollback-only. |
| Carrier + SMS | Twilio | Tenant registration and sender eligibility remain separate compliance gates |
| Managed speech | Native xAI voice roster for PSTN and browser conversations | ElevenLabs remains Studio TTS and authorized private-voice infrastructure, not the PSTN engine |
| Live browser voice | Direct xAI Speech-to-Speech pinned to `grok-voice-think-fast-2.0` | ChatGPT widget stays OpenAI Realtime; it is not a Studio backup |
| Public research | Perplexity when configured | Gemini grounded research fallback |
| Payments | Stripe | Webhook-owned entitlements and prepaid Runtime Balance |
| Database | Managed Postgres / Supabase infrastructure | Server-owned migrations and application authentication controls |
| Rate limiting / shared cache | Upstash Redis | Production must not rely on per-instance memory limits |
| Transactional email | Resend | Commercial mail additionally requires a valid postal address |
| Live Video | Retired | Identity badges stay. LiveAvatar and HeyGen sessions are not minted. Video files and substitute clip scripts are not offered. |

## Native voice model boundary

Studio browser sessions and production PSTN currently run the same Think Fast 2.0 release, but they have different stability contracts:

- Studio uses a direct xAI WebSocket with an explicit versioned model query, so Wireline controls the pin.
- PSTN joins an xAI phone session by `call_id`. xAI documents that `model` is ignored for this join; the registered SIP session is provider-bound.
- `grok-voice-latest` currently routes to Think Fast 2.0. Treat any future provider alias change as a release event that requires inbound/outbound recertification before promotion.
- Grok 4.6 is structured reasoning only. It is not the live-call model.

## Live Video - retired talking-head

Live talking-head sessions are retired. Identity badges remain the in-app visual. Video files and clip-script substitutes are not offered. A later vendor may own a real video product after consent, economics, fallback, and release evidence are rebuilt. Until then the agent focuses on phone, email, and text.

Leftover Stripe Live Video product and price IDs may remain inactive so historical webhook and entitlement records continue to resolve. New checkout, entitlement grants, and provider session minting stay closed.

- `isLiveVideoCatalogReady()` is always false.
- `POST /api/billing/live-video-checkout` fails closed.
- Session, avatar, and enable routes return `410 LIVE_VIDEO_RETIRED`.
- The live Stripe product is inactive and has no active default price.

## Billing and commercial truth

- Public paid plans are the canonical Founder catalog in `src/lib/plan-catalog.ts` and `scripts/lib/stripe-founder-catalog.mjs`.
- Public self-serve checkout exposes Starter, Starter Plus, and Pro. The larger Business entitlement remains non-public and Scale is sales-assisted.
- Voice overflow uses prepaid Runtime Balance; Wireline does not create surprise postpaid voice overage invoices.
- Live Video is not an active add-on. Historical identifiers remain compatibility data only.
- Stripe checkout, webhook, entitlement, portal, cancellation, refund/dispute, and add-on lifecycle must remain server-owned and idempotent.
- Exactly one enabled production webhook endpoint should point to `https://trywireline.com/api/stripe-webhook`, pinned to the server's Stripe API version and exact handled event set.
- Exactly one active Wireline-managed customer portal configuration should match the public plan fingerprint.
- Run `npm run stripe:catalog:check`, the read-only live Stripe audit, webhook alignment check, and portal verification before a billing release.

## Communications compliance

### Voice

Production voice inventory is not equivalent to compliance clearance. Before scaled outbound traffic, prove the responsible business identity, applicable caller-ID/attestation posture, consent basis, quiet-hour rules, DNC handling, and live transfer/handoff behavior.

### SMS

SMS sender inventory is not equivalent to carrier registration. US messaging must use the appropriate approved toll-free or A2P 10DLC registration and tenant isolation model before volume traffic is opened. STOP/HELP and consent behavior must be exercised end to end.

### Federal DNC

Marketing and campaign outbound must remain fail-closed while federal DNC registration or the screening vendor is unconfigured. Configure the real vendor endpoint and login identifier, run the non-billable probe, and persist screening evidence before opening marketing outbound. Never substitute a Vercel access token or unrelated credential.

### WhatsApp

WhatsApp remains optional/private until an approved sender, Meta/WABA posture, callback routing, consent, and template behavior are proven. Do not market it as generally available based on code support alone.

## Database and provider-ownership gates

- Production Drizzle migration state is authoritative for application schema. Supabase's separately named migration ledger may lag and must not be mistaken for proof that already-applied Drizzle migrations are missing.
- Native voice migrations `0152` and `0153` must exist before any xAI phone activation route is promoted.
- The xAI registration claim must acquire the number advisory lock and lock the assigned `wireline_phone_numbers` row before proving tenant/agent ownership or transferring a retired provider registration.
- One-time xAI webhook signing secrets stay encrypted and retained in the retired registration ledger because the current xAI phone-number API documents registration but no deletion endpoint.
- Twilio trunk detachment and carrier number release are separate operations and must remain in that order.

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
5. canonical Stripe catalog, webhook, and portal contracts green;
6. pending production migrations syntax-tested and then applied by the canonical production gate;
7. no unresolved regression introduced by the branch;
8. one inbound and one outbound native SIP call certified after migration;
9. production deployment READY after merge; and
10. current runtime-error and public-health checks clean.

GitHub Actions billing/startup failures that do not execute repository code are tracked separately and are not treated as code evidence. Exact-head Vercel certification remains the compensating release gate while that external billing condition persists.

## Executable probes

- `npm run vendor:readiness` - non-billable provider/configuration snapshot. Treat its output as point-in-time evidence; product policy is defined by current source and this map.
- `npm run stripe:catalog:check` - static canonical Stripe contract.
- `npm run stripe:audit-live` - read-only live Stripe/account/catalog audit.
- `npm run stripe:webhook:check` - enabled-event parity for the production billing webhook.
- `npm run stripe:portal:verify` - exact customer-portal catalog and policy verification.
- `npm run dnc:probe` - federal DNC diagnostic after credentials exist.
- `/api/health`, `/api/health/launch-readiness`, and `/api/health/voice-status` - deployed health evidence appropriate to each audience.

When an executable probe and current source disagree, fix the probe rather than weakening the product contract or documenting the stale result as truth.
