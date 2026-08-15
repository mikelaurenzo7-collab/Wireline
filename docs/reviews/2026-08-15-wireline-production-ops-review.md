# Wireline production operations review

Date: 2026-08-15  
Anchor: `f95537a480579a6b7121c7cdd49cea946e201a35`  
Launch merge: `69af285c8a3ec2d0af6e179e91ea8bd9173183c8`  
Scope: Claude's marketing changes, application architecture, security, billing, data, product truth, unit economics, launch strategy, and live production posture.

## Executive decision

Wireline is technically capable of a controlled real-customer release. It is not yet evidence-ready for broad self-serve acquisition or scaled outbound.

The correct next operating mode is a founder-led cohort of **3–5 consented design partners** around one narrow job: answer an inbound call, capture intent, complete an approved follow-up, and leave a reviewable outcome. Self-serve billing and acquisition scale remain gated until the first paid lifecycle and non-demo production workflow are proven end to end.

## Post-review production verification

The reviewed launch work was squash-merged to `main` as signed commit `69af285c8a3ec2d0af6e179e91ea8bd9173183c8` and deployed through the canonical `revaluate/wireline` production target.

- Vercel deployment `dpl_ChXJncaZhBT2p5Yn7WrejXsSQyGf` finished `READY` with no alias error and owns `trywireline.com`.
- The production build applied and checked the migration/schema boundary, completed the deep launch audit, built the client/server and ChatGPT MCP bundles, prerendered 29 public routes, passed the no-database import smoke, and reconciled the managed Stripe Customer Portal.
- `GET https://trywireline.com/api/health` returned `200 {"ok":true}` with the expected HSTS, CSP, frame-denial, MIME, permissions, and distributed rate-limit headers.
- No runtime errors were present after promotion at the time of verification.
- A pre-auth checkout probe reached authentication and returned `401`, proving that the two coarse project-level billing controls were open even though Stripe had no completed live lifecycle. Exact-head release authorization is therefore a required follow-up before controlled customers: paid checkout must also require `WIRELINE_SELF_SERVE_BILLING_RELEASE_SHA` to match Vercel's full `VERCEL_GIT_COMMIT_SHA`.

## Review of the anchored work

Claude's visual direction is strong and should ship:

- responsive marketing alignment now respects split-layout intent;
- repeated headings and nested cards were removed;
- card-title scale is more consistent across public grids;
- the social card is designed for actual preview size rather than a 1200 px artboard;
- status green is reserved for real status instead of decorative wires;
- Live Video now reads as a metered product session rather than an abstract avatar concept.

The review found four release defects in that work and corrected them:

1. The public Live Video timer restarted after the real five-minute ceiling. It now stops at zero and renders a terminal paused state.
2. The visible countdown value was not exposed to assistive technology. The timer now publishes the current value and paused state.
3. Public copy claimed cross-channel history that the Live Video browser runtime does not load.
4. Marketing E2E asserted that an intentional `sr-only` document-outline heading was visible. It now tests semantic presence rather than false visual rendering.

A deeper product-truth review found another unsupported claim in campaign copy: Live Video was described as writing the same logged outcome as a phone call. The current browser path settles allowance usage but does not persist its transcript or call-style outcome. Marketing now claims only the shared agent identity, Training, operating rules, and approved knowledge that the runtime actually loads.

## Code and architecture judgment

The codebase is unusually complete for a pre-revenue communications product. Strong launch-critical properties include:

- explicit tenant identity and authorization boundaries;
- signed, idempotent Stripe webhook handling;
- durable subscription, allowance, usage, refund, dispute, and checkout-operation records;
- fail-closed self-serve billing and provider-spend gates;
- RLS on every public Supabase table;
- scrypt password hashing and k-anonymous breached-password screening on the custom auth path;
- session-generation rotation after password reset;
- rate limiting, degraded startup behavior, security headers, and public health checks;
- consent, DNC, quiet-hour, disclosure, opt-out, and communications-compliance controls;
- exact-production source verification for publishable marketing capture;
- a prepaid-only overflow model that avoids hidden postpaid liability.

The principal engineering risk is breadth. Secondary connectors, outbound automation, Live Video, and multi-surface clients must not become launch-critical before the core phone-and-follow-up loop earns repeated customer use.

## Live infrastructure evidence

### Stripe

Verified in the live account:

- customer-facing name, website, support details, address, branding, and statement descriptor are aligned to Try Wireline;
- charges and payouts are enabled;
- the active Founder Early Access v6 product and price topology is present;
- one active production webhook targets `https://trywireline.com/api/webhooks/stripe` with checkout, subscription, invoice, refund, and dispute events;
- the active customer portal supports payment methods, invoices, plan changes, period-end cancellation, cancellation reasons, legal links, and return to Wireline;
- retired duplicate webhook endpoints are disabled.

There are **zero live Stripe subscriptions**, completed Checkout sessions, PaymentIntents, or invoices. Configuration is ready; transaction-grounded production proof is still missing. The two observed live-mode Checkout sessions were expired and unpaid, and the newer one predates the completed Try Wireline branding update. A fresh post-branding session must be exercised as part of the controlled lifecycle.

### Supabase

The live project is healthy on PostgreSQL 17.6.

- Every public table has RLS enabled and at least one policy.
- The production Drizzle ledger contains 49 migrations and exactly matches the committed journal through `0150_post_call_digest_job_idempotency`.
- Aggregate snapshot: 136 users, 137 workspaces, 49 agents, 17 assigned provider-bound phone numbers, and 114 calls.
- All 114 calls are marked demo; non-demo calls are zero.
- Stripe-bound subscriptions and checkout operations are zero.
- Connected email accounts and voice-usage events are zero.
- The seven local subscription rows reconcile to six explicit demo grants and one manual customer-binding shell; none contains a Stripe subscription or price ID.
- The sole stored Stripe event is a webhook-rotation probe, not a billing lifecycle event.

The Supabase Auth leaked-password advisor does not describe Wireline's active authentication architecture. Wireline uses its own user table, scrypt hashes, internal session tokens, and the HIBP range API. Production screening is configured to fail closed.

### Vercel

The exact merged SHA completed the full launch audit, production build, 29-route marketing prerender, no-database server import smoke, managed Stripe Customer Portal reconciliation, canonical alias promotion, public health probe, and post-promotion runtime-error review successfully.

### Telephony

Repository controls are strong, but the installed connectors do not expose authoritative live Twilio/Vapi funding, sender approval, A2P/toll-free posture, callback delivery, or usage alerts. Those remain operator proof gates. Do not infer readiness from configured database phone-number rows alone.

## Economics and pricing judgment

The live catalog is coherent and launch-safe:

- Starter: $19 monthly / $190 annual, 50 included voice minutes;
- Starter Plus: $39 / $390, 100 minutes;
- Pro: $79 / $790, 190 minutes;
- hidden Business: $159 / $1,590, 350 minutes;
- Runtime Balance overflow is prepaid at $0.22 per minute;
- independent Runtime Allowance and managed-AI pools are reserved in the margin model;
- every paid interval clears the 30% full-use contribution floor;
- Live Video is $19 monthly for 60 reserved minutes, with five-minute session reservations and no automatic overage.

The pricing risk is not reachable negative unit economics. It is activation, support burden, and retention before the first paying workflow is proven.

## Business and product judgment

Wireline's durable wedge is not generic automation breadth. It is a dependable communication loop:

1. build one voice agent around a costly missed-call or follow-up problem;
2. train it on approved facts and operating rules;
3. launch it on a controlled inbound or consented workflow;
4. capture the call, next action, and human exception;
5. improve it from reviewed outcomes.

The best first segment is appointment-driven and service-oriented businesses where one missed call has visible economic value: home services, clinics that do not send PHI through Wireline, professional services, property operations, and local sales teams.

Until real evidence exists, do not claim customer adoption, ROI, guaranteed bookings, fully autonomous operation, Live Video history, or Live Video outcome persistence. Demo and fixture activity are engineering evidence, not demand, revenue, activation, or retention.

## Required production proof sequence

1. Deploy and verify the exact merged source SHA on the production alias. **Completed for `69af285c8a3ec2d0af6e179e91ea8bd9173183c8`.**
2. Deploy the exact-head billing authorization guard and verify pre-auth paid routes fail closed with `BILLING_LAUNCH_NOT_APPROVED` while the release SHA is absent or mismatched.
3. Prove Twilio/Vapi funding, number state, callbacks, and usage alerts.
4. Authorize only the verified production SHA for a founder-controlled billing certification window while invitations, paid media, and non-founder onboarding remain off.
5. Complete one real $19 lifecycle: checkout -> signed webhook -> entitlement -> allowances -> portal -> cancellation -> refund or reversal.
6. Confirm billing, checkout-operation, subscription, allowance, usage, and reversal ledgers reconcile after that lifecycle.
7. Revoke the exact-head authorization immediately on any failure; on success, retain it only for the bounded design-partner cohort and preserve redacted evidence.
8. Complete one non-demo production inbound call with disclosure, transcript, outcome, and follow-up.
9. Onboard 3–5 consented design partners into one bounded workflow each.
10. Review activation, useful-call rate, repeated use, follow-up completion, support minutes, gross contribution, and churn reason weekly.
11. Enable broader self-serve acquisition only after repeat use and positive observed contribution are demonstrated.

## Release posture

**Approved:** controlled design-partner production release after the exact-head guard, founder billing certification, and remaining live telephony proof.  
**Not approved:** scaled cold outbound, broad paid acquisition, OOH, commissioned hero-film spend, or traction claims.

No code change can substitute for the remaining real transaction and carrier proofs. They must be executed against production and retained as redacted operator evidence.
