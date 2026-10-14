# Founder Launch Command Center

Updated: 2026-08-11  
Status: **Active owner go/no-go runbook**  
Primary authority: `docs/LAUNCH_SOURCE_OF_TRUTH_2026-08-11.md`

> September 27 launch boundary: [P0 Billing Ops](P0_BILLING_OPS_NOTE.md) supersedes earlier expansion and follow-up examples below. Start with one Calls-only Bot and verified inbound service. Email, SMS, additional Bots and outbound dialing remain separately held; a consented purpose alone does not clear the current outbound consent/funding implementation gates.

This file is deliberately short and state-light. Historical launch audits belong in Git history and `docs/AUDIT_INDEX.md`; provider balances, deployment SHAs, test totals, and temporary incident findings do **not** belong here as permanent operating truth.

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

BotBound uses one product and one workspace model. Customers start with a job or
role; a use case never creates a separate account mode, package, or onboarding
branch.

- Customer-facing copy uses **Bot**, **Phone Bot**, or a concrete role.
- Additional Bots add capacity or genuinely separate roles inside the same product.
- Technical APIs, routes, events, database fields, and legacy compatibility IDs may keep `agent`, `personal`, or `business` internally.

Do not use `AI employee` as the launch noun. Do not pair `AI` with `agent` in customer-facing copy.

Public marketing leads with capabilities, outcomes, and a clear signup action, without a setup-step list.

## Runtime decision

Keep customer-facing runtime provider-neutral. The current implementation and `docs/PRODUCTION_VOICE_RUNTIME_POLICY_2026-07-26.md` own exact provider routing.

Operational rules:

- production phone calls use the managed telephony/voice runtime;
- campaign audio is marketing/reference material, never the production call path;
- provider fallbacks must preserve billing, compliance, tenant binding, and observability;
- optional providers are continuity or feature choices, not competing product identities.

## Release evidence rule

A release is current only when evidence is collected against the exact `main` commit being promoted or already serving production.

For every release, verify rather than copy forward:

- exact Git SHA and verified source state;
- Render API, voice worker, and schedulers live on that exact source, with the intended production domain;
- release-boundary and full non-E2E test results;
- app, server, and audit-module TypeScript;
- zero-warning ESLint;
- production dependency security audit;
- migrations and semantic schema-effects verification;
- public health and authenticated voice-reliability evidence after promotion;
- fresh production error/fatal logs after promotion.

The build's integration-test fixtures intentionally strip selected environment variables; fixture stderr must not be mistaken for the real production environment gate.

Do not store a passing test count or deployment SHA in this runbook as though it were evergreen. The deployment and its logs are the evidence record.

## Current external dependencies

These are real external readiness items, not reasons to rewrite working product code.

### Resend delivery feedback

Verify signed delivery feedback through both controls:

1. Resend has a production webhook pointing at `https://botbound.app/api/webhooks/resend`;
2. `RESEND_WEBHOOK_SECRET` is set on the production Render API.

The receiver, schema, suppression semantics, and rollback path are already implemented. See `docs/RESEND_DELIVERY_FEEDBACK.md`.

### AgentMail managed Bot email

Verify paid Bot mailbox provisioning against all of these controls:

1. an organization-scoped `AGENTMAIL_API_KEY` has the required inbox, message, webhook, and domain-read permissions;
2. `AGENTMAIL_DEFAULT_DOMAIN` is `botbound.app` or a verified BotBound subdomain;
3. `npm run vendor:readiness` reports AgentMail ready; and
4. a controlled Bot passes outbound send, inbound receive, signed webhook, and reply proof on the
   configured verified BotBound domain.

Do not use `@agentmail.to` as a paid Bot identity or point the global default at a customer's
domain. Activation, DNS, reconciliation, customer-domain guidance, and rollback are in
`docs/AGENTMAIL_PRODUCTION_ACTIVATION.md`.

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

- **Supabase Auth leaked-password advisory:** BotBound customer passwords use the custom scrypt/HIBP-screened auth path, not Supabase Auth. Do not present the Supabase Auth toggle as a customer-auth control unless that architecture changes.
- **GitHub Actions disabled:** the founder chose to keep repository Actions disabled. Restore CI when that decision changes; until then, exact-head local verification and Render release certification in `docs/DEPLOYMENT_RUNBOOK.md` remain required. Do not treat an absent hosted run as a passing check.
- **Unused-index advisor notices on demo/test data:** do not delete indexes based on pre-customer statistics alone.

## First-customer gate

Before admitting a real customer, complete one controlled founder dogfood from a clean account:

1. sign up and enter the BotBound workspace;
2. build one focused Bot around a real job;
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
- lets the real Bot voice play at full level for a meaningful stretch when selling voice quality;
- matches current pricing, channel availability, and compliance posture;
- records the exact source commit in the release evidence.

The repaired historical derivatives remain QA/editing drafts until exact-production recapture.

## Daily founder go/no-go

**GO** only when:

- exact `main` is live on the required Render services;
- public health is healthy and authenticated voice-reliability evidence shows no material degradation;
- no new production error/fatal cluster is present;
- required production env gate passes;
- dependency/security and schema gates pass;
- the workflow being sold has been dogfooded end to end;
- the creative being published matches the deployed product;
- every public claim can be supported without pretending demo/test activity is customer evidence.

If one of those fails, fix the failing evidence domain. Do not broaden scope into unrelated refactors.
