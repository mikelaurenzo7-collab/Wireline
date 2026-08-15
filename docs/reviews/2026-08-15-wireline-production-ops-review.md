# Wireline production operations review

Date: 2026-08-15  
Anchor: `f95537a480579a6b7121c7cdd49cea946e201a35`  
Hardening branch: `codex/launch-production-hardening-20260815`  
Scope: Claude's marketing changes, application architecture, security, billing, data, product truth, unit economics, launch strategy, and live production posture.

## Executive decision

Wireline is technically capable of a controlled real-customer release. It is not yet evidence-ready for broad self-serve acquisition or scaled outbound.

The correct next operating mode is a founder-led cohort of **3–5 consented design partners** around one narrow job: answer an inbound call, capture intent, complete an approved follow-up, and leave a reviewable outcome. Self-serve billing and acquisition scale remain gated until the first paid lifecycle and non-demo production workflow are proven end to end.

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
- one active production webhook targets `https://trywireline.com/api/stripe-webhook` with checkout, subscription, invoice, refund, and dispute events;
- the active customer portal supports payment methods, invoices, plan changes, period-end cancellation, cancellation reasons, legal links, and return to Wireline;
- retired duplicate webhook endpoints are disabled.

There are **zero live Stripe subscriptions**. Configuration is ready; transaction-grounded production proof is still missing.

### Supabase

The live project is healthy on PostgreSQL 17.6.

- 82 of 82 public tables have RLS enabled.
- Aggregate snapshot: 136 users, 137 workspaces, 49 agents, 17 assigned provider-bound phone numbers, and 114 calls.
- All 114 calls are marked demo; non-demo calls are zero.
- Stripe-bound subscriptions and checkout operations are zero.
- Connected email accounts and voice-usage events are zero.

The Supabase Auth leaked-password advisor does not describe Wireline's active authentication architecture. Wireline uses its own user table, scrypt hashes, internal session tokens, and the HIBP range API. Production screening is configured to fail closed.

### Vercel

The hardening SHA completed the full launch audit, production build, 29-route marketing prerender, no-database server import smoke, and preview deployment successfully.

The public health endpoint returns a healthy database posture and the expected CSP, HSTS, cross-origin isolation, permissions, and rate-limit headers. Production must still be verified by exact merged SHA after promotion.

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

1. Deploy and verify the exact merged source SHA on the production alias.
2. Prove Twilio/Vapi funding, number state, callbacks, and usage alerts.
3. Complete one non-demo production inbound call with disclosure, transcript, outcome, and follow-up.
4. Complete one real $19 lifecycle: checkout -> signed webhook -> entitlement -> allowances -> portal -> cancellation -> refund or reversal.
5. Confirm billing and usage ledgers reconcile after that lifecycle.
6. Onboard 3–5 consented design partners into one bounded workflow each.
7. Review activation, useful-call rate, repeated use, follow-up completion, support minutes, gross contribution, and churn reason weekly.
8. Enable broader self-serve acquisition only after repeat use and positive observed contribution are demonstrated.

## Release posture

**Approved:** controlled design-partner production release after the remaining live telephony and paid-lifecycle proofs.  
**Not approved:** scaled cold outbound, broad paid acquisition, OOH, commissioned hero-film spend, or traction claims.

No code change can substitute for the remaining real transaction and carrier proofs. They must be executed against production and retained as redacted operator evidence.
