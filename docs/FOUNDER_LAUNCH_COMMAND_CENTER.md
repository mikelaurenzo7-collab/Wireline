# Founder Launch Command Center

Updated: 2026-08-11  
Status: **Active owner go/no-go runbook**  
Primary authority: `docs/LAUNCH_SOURCE_OF_TRUTH_2026-08-11.md`

This file is deliberately short. Historical launch audits belong in Git history and `docs/AUDIT_INDEX.md`; they are not current operating truth.

## Authority order

When documents disagree, use this order:

1. running code, production configuration, and current provider state;
2. `src/lib/plan-catalog.ts` for plan economics and entitlements;
3. `docs/CUSTOMER_TERMINOLOGY.md` for customer-facing nouns;
4. `docs/LAUNCH_SOURCE_OF_TRUTH_2026-08-11.md` for positioning, creative, proof, and pre-customer launch posture;
5. `docs/DEPLOYMENT_RUNBOOK.md` and vendor-specific runbooks for release operations;
6. this command center for the founder checklist.

Never keep an old audit finding alive simply because it once appeared here.

## Product decision

Wireline keeps Personal and Business workspaces because they change defaults and customer intent.

- Personal creates a **personal agent**.
- Business creates a **business voice agent**.
- Broad public copy uses **voice agent**.
- Technical APIs, routes, events, and database fields keep `agent`.

Do not use `AI employee` as the launch noun. Do not pair `AI` with `agent` in customer-facing copy.

The public operating loop is **Build -> Train -> Launch -> Improve**.

## Runtime decision

Keep customer-facing runtime provider-neutral. The current implementation and `docs/PRODUCTION_VOICE_RUNTIME_POLICY_2026-07-26.md` own exact provider routing.

Operational rules:

- production phone calls use the managed telephony/voice runtime;
- campaign audio is marketing/reference material, never the production call path;
- provider fallbacks must preserve billing, compliance, tenant binding, and observability;
- optional providers are continuity or feature choices, not competing product identities.

## Verified production baseline — 2026-08-11

Production commit: `0622a5497a9d75c21ca1239d5b1b861708f19474`.

Verified on the exact production deployment:

- Vercel production is READY and aliases `trywireline.com`;
- public health is `operational` for voice runtime, voice fallback, and reasoning;
- voice-status is `healthy`;
- 75/75 release-boundary files and 517/517 release-boundary tests passed;
- 358/358 non-E2E test files and 2,049/2,049 tests passed;
- app, server, and audit-module TypeScript checks passed;
- ESLint passed with zero warnings;
- production dependency audit found 0 unaccepted high/critical advisories;
- migrations and the production semantic schema-effects verifier passed;
- fresh error/fatal runtime-log query for the deployment returned no events.

The build's integration-test fixtures intentionally strip selected environment variables; fixture stderr must not be mistaken for the real production environment gate.

## Current external dependencies

These are real external readiness items, not reasons to rewrite working product code.

### Resend delivery feedback

Production sending is configured, but signed delivery feedback is not active until both are true:

1. Resend has a production webhook pointing at `https://trywireline.com/api/webhooks/resend`;
2. `RESEND_WEBHOOK_SECRET` is set in production Vercel.

The receiver, schema, suppression semantics, and rollback path are already implemented. See `docs/RESEND_DELIVERY_FEEDBACK.md`.

### Federal marketing DNC

`FEDERAL_DNC_API_KEY` remains unconfigured pending the external business/vendor credential. Marketing/campaign outbound therefore stays fail-closed.

This does **not** block the first design partners: begin with inbound calls, missed-call recovery, follow-up, appointments, support, and consented non-marketing flows.

### Carrier and payment account state

Before the first real customer charge or production SMS dependence, verify the live provider dashboards rather than trusting an old snapshot:

- Stripe merchant-facing identity and first real checkout -> webhook -> entitlement -> portal loop;
- Twilio funding, number configuration, retry behavior, toll-free/A2P status, and STOP/HELP handling;
- provider budgets and alerts for the managed runtime.

Record current evidence after verification; do not copy old dollar balances or carrier statuses forward.

## Not launch blockers by themselves

- **Supabase Auth leaked-password advisory:** Wireline customer passwords use the custom scrypt/HIBP-screened auth path, not Supabase Auth. Do not present the Supabase Auth toggle as a customer-auth control unless that architecture changes.
- **GitHub hosted-runner billing failure:** restore CI when the account permits it, but do not call a runner-startup/billing failure a code regression. Exact-head Vercel deep certification remains the release gate while that external condition persists.
- **Unused-index advisor notices on demo/test data:** do not delete indexes based on pre-customer statistics alone.

## First-customer gate

Before admitting a real customer, complete one controlled founder dogfood from a clean account:

1. sign up and create the intended Personal or Business workspace;
2. build one focused agent;
3. train it on real facts, rules, voice, and handoff posture;
4. pass a private test call;
5. complete the paid checkout path and verify entitlement state;
6. claim or connect the live number;
7. handle one real inbound call or permitted consented call;
8. continue the workflow through text, email, booking, approval, or handoff where useful;
9. verify the transcript/outcome/log is correct;
10. verify cancellation/portal behavior and support recovery paths.

Use a disposable founder/demo account until a real customer exists. Never manufacture customer proof from that data.

## GTM gate

The first motion is **3–5 founder-led design partners**, not scaled acquisition.

Choose businesses with an obvious missed-call, inbound-response, scheduling, support, or follow-up problem. Prove one useful workflow end to end within seven days. Depth beats logo count.

Do not depend on cold marketing outbound for the first evidence.

## Creative gate

No historical walkthrough is a launch master merely because it is already rendered.

Publish only when the finished cut:

- uses picture captured from the exact production source commit being promoted;
- contains no 404, auth wall, loading hold, dead route, or stale UI;
- keeps the real product legible after reframing;
- uses no fabricated product UI or fake customer proof;
- lets the real agent voice play at full level for a meaningful stretch when selling voice quality;
- matches current pricing, channel availability, and compliance posture;
- records the exact source commit in the release evidence.

The repaired historical derivatives remain QA/editing drafts until exact-production recapture.

## Daily founder go/no-go

**GO** only when:

- exact `main` is deployed READY;
- public health and voice-status are healthy;
- no new production error/fatal cluster is present;
- required production env gate passes;
- dependency/security and schema gates pass;
- the workflow being sold has been dogfooded end to end;
- the creative being published matches the deployed product;
- every public claim can be supported without pretending demo/test activity is customer evidence.

If one of those fails, fix the failing evidence domain. Do not broaden scope into unrelated refactors.
