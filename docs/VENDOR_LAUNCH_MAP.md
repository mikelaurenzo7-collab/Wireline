# Vendor Launch Map

**Status:** Active canonical operating map.  
**Updated:** August 10, 2026.

This document records Wireline's intended production provider roles and the evidence required before a capability is treated as launch-ready. Historical balances, account screenshots, temporary tokens, and one-off audit results do not belong here; use the executable probes and deployment logs for current evidence.

## Runtime stack

| Plane | Primary | Continuity / boundary |
| --- | --- | --- |
| Structured reasoning | OpenAI managed structured runtime | Gemini, then Vercel AI Gateway; optional xAI experiment only when explicitly enabled |
| PSTN orchestration | Vapi | Provider/model fallbacks defined by the managed voice runtime |
| Carrier + SMS | Twilio | Tenant registration and sender eligibility remain separate compliance gates |
| Managed speech | ElevenLabs / managed Vapi voices | Curated Vapi fallback per voice |
| Live browser voice | OpenAI Realtime | Separate from production PSTN orchestration |
| Public research | Perplexity when configured | Gemini grounded research fallback |
| Payments | Stripe | Webhook-owned entitlements and prepaid Runtime Balance |
| Database | Managed Postgres / Supabase infrastructure | Server-owned migrations and application auth controls |
| Rate limiting / shared cache | Upstash Redis | Production must not rely on per-instance memory limits |
| Transactional email | Resend | Commercial mail additionally requires a valid postal address |
| Live Video | LiveAvatar LITE | Wireline owns the agent brain/voice; LiveAvatar is the visual streaming renderer |

## Live Video — launch-active add-on

Live Video is no longer a paused catalog experiment. The product contract is:

- **$19/month** recurring add-on on an active paid Wireline workspace.
- **60 reserved Live Video minutes per UTC month.**
- Each minted session reserves **5 minutes** atomically before provider token creation.
- Provider sessions are capped at **300 seconds**.
- **No automatic overage.** New sessions pause when fewer than five reserved minutes remain.
- Business agents choose a public presenter through Wireline's authenticated catalog; provider credentials never reach the browser.
- The Wireline identity badge remains the deterministic fallback outside Live Video.
- Users can explicitly end a session; the client stops the provider session immediately.
- `WIRELINE_LIVE_VIDEO_DISABLED=true` is the emergency operator kill switch. The old `WIRELINE_LIVE_VIDEO_CATALOG_READY` launch gate is retired.

Required production configuration to offer the add-on:

- `LIVEAVATAR_API_KEY`
- `STRIPE_LIVE_VIDEO_ADDON_PRICE_ID` (or the supported monthly alias)
- active Stripe webhook synchronization
- an active paid base subscription for the tenant

`HEYGEN_API_KEY` is optional for presenter voice-preview features; LiveAvatar session creation is authenticated by `LIVEAVATAR_API_KEY`.

Provider/account proof is distinct from code readiness. Before advertising Live Video as generally available, verify the production LiveAvatar credential, public avatar inventory, one real five-minute-or-less session, explicit end-session behavior, lip-sync audio, allowance decrement, Stripe checkout → webhook entitlement, cancellation behavior, and the production kill switch.

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
- `/api/health`, `/api/health/launch-readiness`, and `/api/voice/status` — deployed health evidence appropriate to each audience.

When an executable probe and current source disagree, fix the probe rather than weakening the product contract or documenting the stale result as truth.
