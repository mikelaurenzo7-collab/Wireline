# Launch Readiness and Margin Plan

Status: **Active canonical operating plan**. Ops scorecard Wireline needs before scaling paid
traffic and live usage.

## Goal

Answer one question quickly: **Is Wireline safe, reliable, and profitable to sell today?**

Launch is not a vibe check. Treat it as four proofs that must stay current:

1. A real user can create, train, wire, and run an AI employee.
2. One inbound call, one outbound call, Stripe test checkout, and Stripe webhook sync are verified
   after the active production deployment reaches READY.
3. Public claims only describe surfaces that are live or clearly marked beta/gated.
4. Account-level usage economics are visible before spend scales.

## Launch readiness scorecard

| Area | Green means | Red/yellow examples |
| --- | --- | --- |
| Auth/session | Web uses httpOnly cookies; native uses Bearer; no browser JWT fallback. | Stale localStorage tokens, JWT secret conflict, session refresh failures. |
| Database/RLS | Shared Supabase schema is healthy; tenant GUC/RLS paths are verified. | Drift, missing columns, role/GUC failures, pooler issues. |
| Stripe/billing | Catalog, webhooks, plans, add-ons, and Runtime Balance agree. | Missing price envs, webhook secret drift, failed ledger reconciliation. |
| Voice/telephony | Vapi/Twilio/OpenAI/Gemini paths are green; one inbound and one outbound proof call complete. | Failed call webhooks, high latency, unavailable provider keys. |
| Compliance | TCPA/DNC, consent, opt-out, unsubscribe, calling hours, and carrier registration posture are explicit. | Marketing dials without DNC scrub, unclear consent, unsupported brand-calling claims. |
| Rate limiting | Upstash Redis is configured in production. | Per-invocation fallback in serverless. |
| Email/support | Resend and support paths are configured. | Ticket delivery failures or unverified sending domain. |
| Error reporting | Production errors reach the owner dashboard or external reporter. | Silent 5xx, missing alert sink. |
| Creative/GTM | Ads use the current v6 price sheet, truthful launch status, and the AI-employee wedge. | Old $9 copy, invented metrics, or claims that beta/native/ChatGPT surfaces are generally live. |
| Trust/legal | Public proof is truthful and current. | Placeholder logos, implied certification, stale privacy copy. |

## Margin tracking

Wireline should track contribution margin at the account level.

| Cost/revenue lane | Inputs | Required output |
| --- | --- | --- |
| Plan revenue | Stripe subscription, add-ons, extra agents. | Monthly recurring revenue by account. |
| Runtime Balance | Credit wallet and ledger deltas. | Prepaid balance, burn rate, and top-up events. |
| Voice | Vapi minutes, Twilio numbers/SMS/calls, voice provider pass-through. | Cost per call, cost per account, unused-number inventory. |
| AI | OpenAI/Gemini/Vercel AI Gateway/optional xAI usage. | Token/audio cost by account and feature. |
| Video presenters | Live video add-on sessions and provider usage. | Paid add-on margin. |
| Email/support | Resend volume and support ticket volume. | Cost per account and alert thresholds. |

## Alert thresholds

Start with conservative alerts:

- Account daily usage exceeds expected plan economics.
- Voice/webhook failure rate rises above launch threshold.
- Any paid add-on uses an unconfigured price or missing entitlement.
- Twilio number inventory contains unused paid numbers.
- Production rate limiting falls back to memory.
- Runtime Balance drops below the next-action threshold during an active account workflow.
- Public ads or landing copy reference retired pricing, unverified metrics, or beta/gated surfaces without labeling them.
- Any launch readiness scorecard item is red for more than one business day.

## Implementation map

Candidate code surfaces:

- `src/routes/health-routes.ts`
- `src/routes/voice-observability-routes.ts`
- `src/lib/conversation-balance.ts`
- `src/lib/credit-wallet.ts`
- `src/lib/daily-spend-accumulator.ts`
- `src/lib/plan-catalog.ts`
- `docs/RUNNING_COSTS_AUDIT_2026-07-06.md`

## Launch proof cadence

Run this cadence before turning on paid traffic and again after each production deploy that touches
billing, auth, runtime providers, telephony, or public claims:

1. Verify the active Vercel production deployment is READY and runtime logs show no new 5xx cluster.
2. Run one Stripe test checkout, portal round trip, webhook delivery, and billing-status refresh.
3. Run one inbound demo call and one outbound proof call; confirm transcript, outcome, cost, and
   escalation behavior are logged.
4. Check Supabase advisors, migration status, and RLS-critical tables before assuming missing rows
   mean missing customer activity.
5. Review public marketing copy against the current `plan-catalog.ts` values and release-status
   guardrails.
