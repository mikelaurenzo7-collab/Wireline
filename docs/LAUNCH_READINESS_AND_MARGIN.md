# Launch Readiness and Margin Plan

Status: **Active canonical operating plan**. BotBound's ops scorecard for scaling paid traffic and
live usage.

Last reconciled: **September 13, 2026**. The [Deployment Runbook](./DEPLOYMENT_RUNBOOK.md#current-launch-posture)
owns cohort approval: controlled design-partner pilot only until the evidence below is recorded.
Paid media, broad invitations, cold outbound, and regulated-data onboarding remain closed.

## Goal

Answer one question quickly: **Is BotBound safe, reliable, and profitable to sell today?**

Launch is not a vibe check. Treat it as four proofs that must stay current:

1. A real user can build, configure, launch, and run a Bot.
2. A controlled live Stripe lifecycle, a consented non-demo inbound call, support handling, and
   repeat usage are verified against the production release. Outbound proof additionally requires
   the relevant consent, DNC, quiet-hour, and carrier gates; never dial solely to fill a checklist.
3. Public claims only describe surfaces that are live or clearly marked beta/gated.
4. Account-level usage economics are measured from real usage before spend scales.

Keep configuration, deployment certification, and customer proof separate. The health API's
legacy `campaign_ready` field describes platform configuration, not acquisition approval.
`outbound_campaign_ready` also does not replace per-campaign consent or carrier clearance.
Sandbox checkout, demo/manual entitlements, empty error logs, and a READY deployment do not
prove a paid lifecycle, successful calls, support response, or observed contribution margin.

## Launch readiness scorecard

| Area            | Green means                                                                                                                                                        | Red/yellow examples                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Auth/session    | Signup, verification, sign-in, reset, expiry, and sign-out work; web uses httpOnly cookies, native uses Bearer, and custom HIBP screening is enforced.             | Stale browser tokens, refresh failures, or missing real account-flow evidence.                  |
| Database/RLS    | Shared Supabase schema is healthy; tenant GUC/RLS paths are verified.                                                                                              | Drift, missing columns, role/GUC failures, pooler issues.                                       |
| Stripe/billing  | Live checkout, signed webhook, account ownership, entitlement, Runtime Allowance, portal, cancellation, and reversal reconcile with Stripe.                        | Correct catalog but no paid lifecycle, demo grants mistaken for customers, or ledger drift.     |
| Voice/telephony | A consented non-demo inbound call completes on a tenant-owned number with transcript, outcome, cost, and handoff proof; permitted outbound is verified separately. | No real call evidence, failed callbacks, missing carrier clearance, or provider errors.         |
| Compliance      | TCPA/DNC, consent, opt-out, unsubscribe, calling hours, and carrier registration posture are explicit.                                                             | Marketing dials without DNC scrub, unclear consent, unsupported brand-calling claims.           |
| Rate limiting   | Upstash Redis is configured in production.                                                                                                                         | Per-invocation fallback in serverless.                                                          |
| Email/support   | Verified DNS and feedback webhooks plus demonstrated inbound, support reply, unsubscribe, and failure handling.                                                    | An inbox exists but response handling is unproven; delivery or suppression failures.            |
| Error reporting | Redacted production errors reach a verified owner alert destination, with response ownership exercised.                                                            | Silent failures, query tokens in logs, or an untested alert sink.                               |
| Creative/GTM    | Approved-cohort materials use the current plan catalog and release status; product footage and claims have source-current proof.                                   | Old pricing, stale footage, invented metrics, or generally-live claims for beta/gated surfaces. |
| Trust/legal     | Public proof is truthful and current.                                                                                                                              | Placeholder logos, implied certification, stale privacy copy.                                   |

## Margin tracking

BotBound should track contribution margin at the account level.

| Cost/revenue lane | Inputs                                                                     | Required output                                           |
| ----------------- | -------------------------------------------------------------------------- | --------------------------------------------------------- |
| Plan revenue      | Stripe subscription, add-ons, extra Bots.                                  | Monthly recurring revenue by account.                     |
| Runtime Balance   | Credit wallet and ledger deltas.                                           | Prepaid balance, burn rate, and top-up events.            |
| Voice             | Twilio numbers/SMS/carrier minutes plus OpenAI Realtime audio usage.       | Cost per call, cost per account, unused-number inventory. |
| AI                | Server-owned direct xAI/OpenAI usage on Render; Gemini is retired.         | Token/audio cost by account and feature.                  |
| Video presenters  | Retired talking-head add-on. Leftover Stripe price IDs stay webhook-only.  | Do not sell Live Video.                                   |
| Email/support     | AgentMail subscription/mailbox/message costs, Resend volume, support time. | Cost per account and alert thresholds.                    |

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

1. Verify Render production services are live on the exact reviewed source and runtime logs show no new 5xx cluster, using the deployment runbook's release proof requirements.
2. Review read-only provider configuration, then exercise the approved controlled live billing
   lifecycle in the deployment runbook. Retain sandbox regression coverage separately; do not
   create charges or subscriptions merely to produce an audit result.
3. Complete a consented non-demo inbound call on a current tenant-owned number. Verify transcript,
   outcome, metered cost, and handoff. Public/guest voice previews and the old demo-line canary
   are retired. Verify outbound only when its separate permissions and compliance gates are met.
4. Prove support receipt and reply, unsubscribe handling, and a second real customer session.
5. Check the live Drizzle ledger, concrete schema, tenant controls, and Supabase advisors. Do not
   treat Supabase Auth warnings as custom-auth evidence or delete unused indexes based on sparse
   pilot traffic.
6. Compare observed account contribution with the catalog's expected-use and full-use floors.
   Record missing usage as insufficient evidence, not zero cost or a passing margin.
7. Review public copy, creative, desktop/mobile journeys, and account empty/error states against
   `plan-catalog.ts` and [the launch source of truth](./LAUNCH_SOURCE_OF_TRUTH_2026-08-11.md).
   Historical footage and partial frame samples do not certify a final promotional edit.

## Evidence required to expand the pilot

The release owner maintains one dated record with the exact production SHA, approved cohort,
checks performed, and unresolved gates. Use redacted references; never store credentials,
customer contact details, transcripts, or payment data in this record.

| Gate                       | Evidence to retain                                                                                                    | Approval owner   |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Account and Bot activation | Signup-to-private-test-to-activation result, account recovery, empty/error states, desktop and mobile checks.         | Product owner    |
| Paid lifecycle             | Live price, webhook processing, ownership/entitlement/ledger reconciliation, portal/cancellation and reversal result. | Billing owner    |
| Real conversation          | Date, source SHA, consent basis, tenant-owned number assignment, call outcome, metered cost, and handoff result.      | Runtime owner    |
| Support and retention      | Receipt/reply/unsubscribe result, second real session, and customer feedback.                                         | Support owner    |
| Operations and recovery    | Alert receipt, responder, rollback result, and isolated backup-restore evidence.                                      | Platform owner   |
| Economics                  | Observed per-account revenue and all variable costs, with measurement window and sample size.                         | Commercial owner |
| Acquisition                | Current final creative, valid claims, consent/carrier posture, and explicit cohort expansion decision.                | Launch owner     |

One person may own several gates, but each needs an explicit result. A missing, stale, skipped,
or inaccessible check remains pending; do not silently convert it to green.
