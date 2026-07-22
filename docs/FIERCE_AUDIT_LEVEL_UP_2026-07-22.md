# Fierce Audit Level-Up — 2026-07-22

Status: **Active** — fresh audit off current `origin/main` with revenue,
compliance, CRM, and cost upgrades shipped in code.

## Overall grade: A- / launch-durable with ops gates

Prior July-22 passes left Wireline launch-ready architecturally. This pass
closed the largest **code-truth gaps** between docs/marketing and runnable
product: annual checkout was advertised but unreachable, TCPA quiet hours were
documented in the shared dial gate but unimplemented, CRM stage/contact writes
were stubs, and structured model routing ignored complexity.

## Facet grades (re-scored)

| Facet | Grade | Delta |
| --- | --- | --- |
| Billing / pricing / costs | A | Annual purchasable; sales copy honest; Runtime Balance naming |
| Runtime / compliance | A | TCPA 8am–9pm local hours in shared dial gate |
| Vendors / integrations | B+ | Salesforce createContact + deal stage; HubSpot stage; MMS mediaUrl |
| Agent models / cost | A- | simple/medium → GPT-5; complex → GPT-5.6 Terra |
| Video agents | C+ | Unchanged honesty gate (Presence Catalog still paused) |
| Security / backend | A- | No new P0s; accounts RLS healthy on probe |
| UI / UX / onboarding | A- | Pricing + in-product Monthly/Annual toggles |
| Docs / codebase | A | Dead lib cleanup + gateway-catalog authz registration (prior commit on branch) |

## Wins shipped

1. **Annual billing is purchasable** — Monthly/Annual toggle on public Pricing
   and authenticated `StripeBillingCard`; checkout posts `interval: "year"`;
   signup intent captures `interval=year`.
2. **TCPA calling hours** — `src/lib/tcpa-calling-hours.ts` + first check in
   `evaluateOutboundDialGate` (`outside_permitted_calling_hours`). Unknown
   NANP destinations use the continental intersection window (11:00–21:00 ET).
3. **Structured cost routing** — `selectModelForTask` maps simple/medium →
   `gpt-5`, complex → Terra (OpenAI primary lane; Gemini remains failover).
4. **CRM stubs closed** — Salesforce `createContact` + `updateOpportunityStage`;
   HubSpot `updateDealStage`; `CRMService` no longer stubs success.
5. **MMS** — optional `mediaUrl` on `sendTenantMessage`.
6. **Sales honesty** — Casey no longer promises inventable % coupons; quotes
   published annual savings instead.
7. **Runtime Balance** — Billing settings section title uses
   `CONVERSATION_BALANCE_COPY.title`.

## Ops still open (not code)

- Federal DNCScrub business registration → real `loginId` on all Vercel envs.
- Twilio / Stripe runway before paid volume.
- `WIRELINE_LIVE_VIDEO_CATALOG_READY` stays false until Presence Catalog is buyer-ready.
- Vercel author invite for squash-merge attribution (`laurenzomike`) if needed.
- GitHub Actions phantom workflow / spending limit (infra, not product).

## Verification

```bash
npx vitest run tests/tcpa-calling-hours.test.ts \
  tests/annual-billing-and-model-routing-contract.test.ts \
  tests/outbound-compliance-contract.test.ts
npm run design:check
npm run docs:check
```
