# Founder Launch Command Center

Updated: 2026-10-22

Status: **Active owner go/no-go runbook**  
Primary authority: `docs/LAUNCH_SOURCE_OF_TRUTH_2026-08-11.md`

> Current launch boundary: lead with voice Bots with a computer, phone number, and email address. Start with one focused Bot and a verified incoming call workflow. Free covers building and private rehearsal; live channels and Computer require the appropriate paid access. Email requires completed setup and activation proof. SMS and outbound are outside launch marketing. Existing reviewed calling retains the eligibility controls in [the Deployment Runbook](DEPLOYMENT_RUNBOOK.md#current-launch-posture). [P0 Billing Ops](P0_BILLING_OPS_NOTE.md) and the catalog govern package limits and availability.

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
- Current channel packages include one Bot. Higher capacity increases usage allowances, not Bot count; new extra Bot sales remain deferred.
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

### Reviewed calling and future messaging

`FEDERAL_DNC_API_KEY` remains unconfigured pending the external business/vendor credential. Marketing/campaign outbound therefore stays fail-closed.

Reviewed service, coordination and requested callback calls for personal and business Bots have a separate runtime switch, `BOTBOUND_NON_MARKETING_OUTBOUND_ENABLED`. They require paid voice, ownership of the line, captured recipient permission, supported Illinois jurisdiction, quiet hours, funding and duplicate suppression. The hosted permission capture is the current supported evidence path. An existing client relationship or an unverified checkbox does not bypass these controls. MCP proposals remain private until the owner reviews and places the call. See [the current deployment policy](DEPLOYMENT_RUNBOOK.md#current-launch-posture); this description does not assert that a production switch is enabled.

The founder's EIN and SMS sender verification remain pending. Keep SMS and campaign calling out of the launch offer. Completing those registrations alone does not enable calling or messaging, and their pending status is separate from the proof required for voice, email and Computer.

Begin the first design partners with verified incoming calls, useful answers, request capture, approved email and supervised Computer work. Offer booking only where the configured calendar workflow has been proven; otherwise capture the appointment request for the owner.

### Carrier and payment account state

Before the first real customer charge, verify the live provider state rather than trusting an old snapshot:

- Stripe merchant-facing identity and first real checkout -> webhook -> entitlement -> portal loop;
- Twilio funding, number ownership and routing, callback configuration and retry behavior for the offered voice workflow;
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
8. continue through configured email, Computer work, booking, approval or owner handoff where useful;
9. verify the transcript/outcome/log is correct;
10. verify cancellation/portal behavior and support recovery paths.

Use a disposable founder/demo account until a real customer exists. Never manufacture customer proof from that data.

### Open launch proofs and founder decisions

- [ ] Complete acceptance and deployment of the reviewed release, then verify the API, voice service and both scheduled services against the same source. A successful schedule run is not notification delivery proof.
- [ ] Confirm the intended Stripe settlement account and the founder subscription's cancellation choice. Prove an ordinary account's purchase, entitlement, usage and portal flow; owner access is not that evidence.
- [ ] Verify current mailbox capacity and the offered Bot's incoming email, reply and delivery history before opening Email activation. A purchased slot is not a completed delivery check.
- [ ] Complete the deferred owned phone and email retest: confirm the recipient receives one message, its links are correct, and the Bot describes the actual send result accurately. Preserve the earlier successful send evidence without treating it as proof of this deferred check.
- [ ] Assign a support owner and manual fallback, confirm runtime funding and provider alerts, and cap the assisted cohort to available capacity. Record current observations in the release evidence rather than treating old balances as live limits.

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
