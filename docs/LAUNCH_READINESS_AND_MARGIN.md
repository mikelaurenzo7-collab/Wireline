# Launch Readiness and Margin Cockpit Plan

Status: **Active canonical operating plan**. This is the owner/founder view Wireline needs before scaling paid traffic and live usage.

## Goal

Answer one question quickly: **Is Wireline safe, reliable, and profitable to sell today?**

## Launch readiness scorecard

| Area | Green means | Red/yellow examples |
| --- | --- | --- |
| Auth/session | Web uses httpOnly cookies; native uses Bearer; no browser JWT fallback. | Stale localStorage tokens, JWT secret conflict, session refresh failures. |
| Database/RLS | Shared Supabase schema is healthy; tenant GUC/RLS paths are verified. | Drift, missing columns, role/GUC failures, pooler issues. |
| Stripe/billing | Catalog, webhooks, plans, add-ons, and Conversation Balance agree. | Missing price envs, webhook secret drift, failed ledger reconciliation. |
| Voice/telephony | Vapi/Twilio/OpenAI/Gemini runtime health is green and webhooks are flowing. | Failed call webhooks, high latency, unavailable provider keys. |
| Rate limiting | Upstash Redis is configured in production. | Per-invocation fallback in serverless. |
| Email/support | Resend and support paths are configured. | Ticket delivery failures or unverified sending domain. |
| Error reporting | Production errors reach the owner dashboard or external reporter. | Silent 5xx, missing Sentry/alert sink. |
| Trust/legal | Public proof is truthful and current. | Placeholder logos, implied certification, stale privacy copy. |

## Margin cockpit

Wireline should track contribution margin at the account level.

| Cost/revenue lane | Inputs | Required output |
| --- | --- | --- |
| Plan revenue | Stripe subscription, add-ons, extra agents. | Monthly recurring revenue by account. |
| Conversation Balance | Credit wallet and ledger deltas. | Prepaid balance, burn rate, and top-up events. |
| Voice | Vapi minutes, Twilio numbers/SMS/calls, voice provider pass-through. | Cost per call, cost per account, unused-number inventory. |
| AI | OpenAI/Gemini/OpenRouter/xAI usage. | Token/audio cost by account and feature. |
| Video presenters | Live video add-on sessions and provider usage. | Paid add-on margin. |
| Email/support | Resend volume and support ticket volume. | Cost per account and alert thresholds. |

## Alert thresholds

Start with conservative alerts:

- Account daily usage exceeds expected plan economics.
- Voice/webhook failure rate rises above launch threshold.
- Any paid add-on uses an unconfigured price or missing entitlement.
- Twilio number inventory contains unused paid numbers.
- Production rate limiting falls back to memory.
- Any launch readiness scorecard item is red for more than one business day.

## Implementation map

Candidate code surfaces:

- `src/components/FounderOperatingCockpit.tsx`
- `src/components/analytics/ObservabilityDashboard.tsx`
- `src/routes/health-routes.ts`
- `src/routes/voice-observability-routes.ts`
- `src/lib/conversation-balance.ts`
- `src/lib/credit-wallet.ts`
- `src/lib/daily-spend-accumulator.ts`
- `src/lib/plan-catalog.ts`
- `docs/RUNNING_COSTS_AUDIT_2026-07-06.md`
