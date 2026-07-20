# E2E Audit — Stripe Cadence + Vercel Env — 2026-07-20

Status: **Active** — live audit of Cadence AI Stripe reconnect, Vercel env parity, and
highest-leverage production integrity fixes.

## Verdict

**Cadence AI Stripe is correctly wired for Wireline billing.** Vercel Production / Preview /
Development price IDs match the live founder catalog (`acct_1TkyXL8e6If87QKm`). The previous
−$207 Stripe balance and `JohDtfy3Ik` price IDs belonged to the retired Stripe project.

The remaining hard launch blocker from this pass is **Federal DNCScrub credentials** (real
vendor `loginId`), not Stripe.

## Confirmed healthy

| Surface | Result |
| --- | --- |
| Stripe account | `acct_1TkyXL8e6If87QKm` Cadence AI — matches Stripe MCP + Vercel `STRIPE_SECRET_KEY` |
| Catalog | 14/14 canonical founder prices; live audit `findings: []` |
| Vercel price env parity | OK across production / preview / development |
| Webhook URL | `https://trywireline.com/api/stripe-webhook` enabled |
| Charges / payouts | Enabled; available USD **$0.00** |
| Core Vercel secrets | Postgres, JWT, Redis, Stripe, Vapi, Twilio, Resend present |
| Production `/api/health` | `ok: true` |
| Vendor readiness (non-DNC) | OpenAI/Gemini/Gateway/Vapi/Twilio/Stripe/Resend ready |

## Fixes applied this pass

### Live ops (no code deploy required for effect)

1. **Stripe webhook event alignment** via `npm run stripe:webhook:align`
   - Added: `charge.refunded`, `charge.dispute.created`, `customer.subscription.created`
   - Removed noise: `invoice.paid`, `invoice_payment.paid`
   - Now matches `src/routes/billing-routes.ts` exactly — Conversation Balance refund/dispute
     clawback can fire.
2. **Supabase migration `0104` applied live** — `GRANT … TO wireline_server` on MCP OAuth tables
   so GDPR purge/export under tenant role no longer hits permission denied.
3. **Supabase migration `0105` applied live** — dropped unused ElevenLabs
   `wireline_cloned_voices` / `wireline_pronunciation_dictionaries` tables.
4. **`HEALTH_MONITOR_TOKEN` created** on production/preview/development (encrypted) and
   production redeployed — `/api/health/launch-readiness` returns `overall_score: 100` with
   `compliance_ready` / `billing_ready` / `voice_ready` all ready.
5. **Removed stale `OPENAI_REALTIME_TRANSCRIBER=gpt-realtime-whisper` pin** so runtime uses the
   code default (`gpt-4o-mini-transcribe`).

### Code / docs

1. **Cadence price fallbacks** in `src/lib/plan-catalog.ts` + `.env.example` — retired
   `JohDtfy3Ik` IDs can no longer silently charge against the wrong Stripe account when an env
   var is missing.
2. **GDPR** — `wireline_recap_artifacts` added to `ACCOUNT_DELETION_TARGETS` so published
   recap/transcript content is purged and exported with the account.
3. **Contract test** `tests/cadence-stripe-gdpr-contract.test.ts` locks both invariants.
4. **Docs refreshed** — `VENDOR_LAUNCH_MAP`, `LAUNCH_GURU_PLAYBOOK`, `P0_BILLING_OPS_NOTE`,
   CEO checklist, pricing decision note — Cadence account + $0 balance + DNC blocker.

## Open ops items (need human credentials)

1. **Verify Federal DNCScrub end-to-end (not just env presence)**
   - Production `/api/health/launch-readiness` reports `compliance_ready` (URL+KEY present at
     runtime — Sensitive values are API-unreadable but set).
   - Development `FEDERAL_DNC_API_KEY` is a misplaced Vercel token (`vcp_…`); DNCScrub returns
     an HTML login page, not JSON. Fix development so local/vendor probes don't lie.
   - Still run one live scrub against DNCScrub with a test NANP number and confirm JSON
     `ResultCode` before scaling marketing outbound.
2. **Rotate the Vercel token pasted into this agent chat** after the session.
3. **Twilio balance ~$23** — fund before scaling dial volume (not a code issue).
4. **GitHub Actions phantom `BuildFailed` workflow** — still needs Settings/support (unchanged).

## Verification commands

```bash
VERCEL_TOKEN=… node scripts/run-stripe-audit-from-vercel.mjs
VERCEL_TOKEN=… node scripts/verify-stripe-vercel-parity.mjs
VERCEL_TOKEN=… npm run stripe:webhook:check
npx vitest run tests/cadence-stripe-gdpr-contract.test.ts src/lib/plan-catalog.test.ts
```
