# Wireline launch decision and production review

Date: 2026-08-13  
Inspected branch: `claude/wireline-review-build-2mvcj8` at `27ce405f0a39786bbd86b3e013a00ea40a51680b` before this review's release commit  
Scope: code, architecture, security, billing, data, unit economics, product, design, market, compliance, vendors, and deployment readiness

## Executive summary

Wireline is a serious, unusually complete communications operating product—not a thin voice demo. The reviewed branch has a strong tenant boundary, durable billing and usage ledgers, defensive webhook handling, consent/DNC/quiet-hour controls, production-grade public surfaces, and a coherent Aurora Letterpress design language. The full application suite, strict TypeScript targets, zero-warning ESLint, security gates, production build, marketing prerender, and no-database startup smoke all pass.

The review found and fixed three verified launch issues:

1. **Reachable negative unit economics.** Voice, Runtime Allowance, and managed AI spend were independent meters, but the margin gate reserved only the first two. A legitimate heavy customer could drive annual contribution to **-21.2% to -26.4%**. The catalog now reserves every independently consumable pool, exposes the AI allowance explicitly, and uses launch-safe included voice capacities. Every monthly and annual paid plan now clears the 30% hard floor at simultaneous full utilization.
2. **Unsafe Automatic Tax posture.** Checkout enabled Stripe Automatic Tax even though the live account had no active tax registration. Checkout now enables Automatic Tax only after an explicit operator flag and documented registration prerequisite. Address collection remains ready for activation.
3. **Delayed-payment fulfillment gap.** Some checkout flows pinned payment methods to card/Link because the webhook did not handle delayed settlement. Checkout now uses Stripe's eligible dynamic payment methods; async success reuses the same idempotent fulfillment path and async failure releases only the correctly owned active plan operation.

The commercial evidence is not yet sufficient for an unconditional broad launch. The audited database contains **135 test/demo accounts and zero production accounts**, while Stripe contains **zero Stripe-sourced active subscriptions**. This means product quality is substantially ahead of demonstrated demand. The correct launch is a controlled, consent-led design-partner cohort with a real paid lifecycle proof, not scaled cold outbound or claims of traction.

## Release evidence

| Gate | Result |
| --- | --- |
| Strict application TypeScript | Pass |
| Application, server, and audit-module TypeScript | Pass |
| ESLint with zero warnings | Pass |
| Non-E2E unit and contract suite | **377 files / 2,158 tests pass** |
| Design system and token parity | Pass |
| Route registry and security precedence | Pass |
| AuthZ matrix | 382 routes scanned; 313 protected, 69 explicitly public, 0 violations |
| OpenAPI implementation parity | 23 operations pass |
| Stripe catalog contract | 8 products, 14 prices, 8 environment targets pass |
| Production Vite/server build and marketing prerender | Pass; 29 route shells |
| Server import smoke without database configuration | Pass with intended degraded posture |
| Production security advisory gate | 0 unaccepted high/critical advisories |
| Browser-extension policy checks | Pass |
| Economics report | Every paid plan and interval clears the 30% reachable full-use floor |

The reproducible aggregate analysis is in [2026-08-13-wireline-launch-analysis.ipynb](./2026-08-13-wireline-launch-analysis.ipynb). It contains no credentials or user-level records and executes top to bottom with the primary runtime.

## Code and architecture review

### What is strong

- Tenant identity is carried through the request/runtime context and enforced in billing, usage, webhooks, provider work, and data access.
- The public API route surface is explicitly mounted and audited rather than relying on accidental framework discovery.
- Stripe operations use signed webhooks, durable event claims, deterministic idempotency, subscription projection, credit-ledger grants/reversals, refund/dispute accounting, and tenant-scoped checkout operations.
- Voice usage and prepaid overflow use durable, idempotent events. Active calls finish; depleted capacity blocks the next new paid action instead of creating hidden postpaid debt.
- Platform model, research, and enrichment costs are recorded in the same account spend pipeline; missing or malformed hard-cap state fails provider-funded work closed.
- Destructive account actions and data-retention work are represented as durable state transitions rather than optimistic UI-only promises.
- The application has explicit degraded startup behavior, operational health surfaces, vendor-readiness checks, and release contracts for historically fragile billing paths.

### Remaining engineering risk

- The codebase is broad for a pre-revenue product. The core launch wedge should remain voice + follow-up + outcome logging; secondary connectors should not become launch-critical unless a paying design partner proves the workflow.
- The repository's global Prettier check reports historical formatting drift across many files. This is hygiene debt, not a runtime failure; a dedicated mechanical formatting PR is safer than mixing 141 unrelated file rewrites into this launch correction.
- GitHub-hosted CI is currently blocked by billing rather than code. Local release gates provide strong evidence, but hosted CI should be restored before a team begins parallel development.

## Billing and unit economics

### Corrected commercial contract

| Plan | Monthly / annual | Voice minutes | Runtime Allowance | Managed AI allowance | Annual full-use margin |
| --- | ---: | ---: | ---: | ---: | ---: |
| Starter | $19 / $190 | 50 | $1 | $1.50 | 32.3% |
| Starter Plus | $39 / $390 | 100 | $3 | $3 | 30.9% |
| Pro | $79 / $790 | 190 | $6 | $6 | 32.0% |
| Business | $159 / $1,590 | 350 | $12 | $12 | 30.9% |

Full-use means every included voice minute, number slot, Runtime Allowance dollar, managed AI dollar, and Payments/Billing/future-Tax fee reserve is consumed in the same month. It is deliberately stricter than expected usage. Runtime Balance remains customer-controlled and prepaid, with no automatic postpaid overage.

The entry price remains compelling relative to current usage-priced voice infrastructure and managed-agent offers. Retell publishes component-based usage pricing, Vapi publishes usage-based pricing with provider costs passed through, and Bland publishes plans beginning at $0.14/min with higher tiers carrying $299/$499 platform fees. Wireline's durable differentiation is not the cheapest minute; it is the complete operating loop—training, calling/texting, connected actions, follow-up, outcomes, approvals, and workspace memory. Sources: [Retell pricing](https://www.retellai.com/pricing), [Vapi pricing](https://vapi.ai/pricing), [Bland billing documentation](https://docs.bland.ai/platform/billing).

### Stripe live-account posture

- Charges, payouts, and account details are enabled.
- The active product/price topology matches the intended eight-product, fourteen-price launch catalog before metadata reconciliation.
- Automatic Tax must remain off until at least one relevant tax registration is active and tax obligations are confirmed.
- The account's customer-facing business profile still carries legacy identity fields and an old deployment URL even though the dashboard display name is Wireline. Public name, statement descriptor, website, support URL/email, and branding must be reconciled in Stripe Dashboard before accepting the first payment.
- No active customer-portal configuration was present during the audit. Wireline can bootstrap it, but the real paid lifecycle must prove portal creation and cancellation before broad launch.

## Data, security, and operations

### Supabase

- Project health is active on PostgreSQL 17.6.
- **82 of 82 public tables have RLS enabled.**
- Read-only integrity checks returned zero active/expired checkout-operation conflicts, unprocessed/abandoned Stripe events, pending orphan carrier resources, overdue deletion-queue items, duplicate Stripe subscription IDs, and subscriptions missing an entitlement source.
- Recent Postgres/API logs showed normal checkpoints and successful API traffic with no material database/auth error signal.
- The only security-advisor warning is leaked-password protection being disabled. Enable it before inviting external accounts: [Supabase password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- The unused-index advisor returns informational findings across a low-traffic, pre-launch database. Do not delete those indexes from zero-production usage statistics; many protect rare billing, auth, compliance, and deletion paths. Reassess after representative production traffic.

### Vercel

- The audited production deployment was healthy with no recent production error events.
- Recent runtime traffic was overwhelmingly 200 responses, with expected auth-related 401s and one isolated 404 rather than an error trend.
- Production was behind the review branch at audit time. The release must be verified by exact commit SHA before catalog or webhook mutations are considered complete.

### Twilio and voice operations

Repository controls cover signed webhook validation, delivery status, tenant consent, DNC checks, quiet hours, AI/recording disclosure evidence, opt-out persistence, and fail-closed federal-DNC behavior. Live Twilio inventory, funding, A2P/toll-free approval, callbacks, and usage alerts could not be inspected through the installed connector. The first external cohort therefore remains blocked until the vendor-readiness script proves the funded number and messaging posture in production.

## Product and design review

### Product judgment

Wireline serves a durable real-world demand: small service businesses miss calls, fail to follow up, lose context between channels, and cannot justify a full operations team. The product's strongest promise is not “AI employees” in the abstract; it is a dependable communication loop:

1. train an agent on the business and its playbook;
2. answer or place a lawful call/text;
3. capture the outcome and next action;
4. follow through in the connected system;
5. surface exceptions to a human.

That loop is coherent across the landing page, pricing, signup, agent setup, voice, inbox, outcomes, billing, and trust surfaces. The design language is distinctive and professional, with restrained violet/silver hierarchy, strong spacing rhythm, readable limits, and purposeful interaction states.

### Verified product correction

The landing-page fallback previously called itself a “Live browser demo” while its CTA opened a phone call. It now states “Live voice demo,” tells the visitor that browser voice is unavailable, uses a phone icon, and emits the demo funnel event with `mode: phone`. This removes a trust-breaking mismatch at the highest-intent point in the funnel.

### Focus recommendation

The primary launch segment should be appointment-driven and service-oriented businesses where one missed call is visibly expensive: home services, clinics, professional services, property operations, and local sales teams. Start with inbound/consented follow-up and measurable outcomes—answered calls, qualified intent, booked appointments, follow-up completion—not generic automation breadth.

## Lawful communications posture

The FCC has confirmed that AI-generated voices fall under the TCPA's artificial/prerecorded-voice restrictions. Marketing robocalls generally require the appropriate prior consent, identification, and opt-out handling; federal and state rules still apply. The FTC's Telemarketing Sales Rule adds Do Not Call, calling-time, disclosure, and recordkeeping obligations, and federal DNC data must be refreshed at least every 31 days for covered campaigns. Sources: [FCC AI voice ruling](https://www.fcc.gov/document/fcc-confirms-tcpa-applies-ai-technologies-generate-human-voices), [FCC consumer guide](https://www.fcc.gov/consumers/guides/stop-unwanted-robocalls-and-texts), [FTC TSR compliance guide](https://www.ftc.gov/business-guidance/resources/complying-telemarketing-sales-rule), [FTC recordkeeping update](https://www.ftc.gov/business-guidance/blog/2024/10/mark-your-calendars-telemarketers-sellers-october-15-telemarketing-sales-rules-record-store-day).

Wireline's code supports a strong baseline, but it is not legal advice and cannot turn an unlawful list into a lawful campaign. Scaled outbound marketing should remain disabled until the account has a federal-DNC vendor, provable consent source, approved sender/number posture, and counsel-reviewed state-specific policy. The launch wedge should be inbound, existing-customer service, or prospect-requested follow-up.

## Launch decision

**Decision: approve a controlled production launch after the operational gates below; do not approve an unconditional scaled launch yet.**

### Must close before the first external paid customer

1. Reconcile Stripe's customer-facing business identity and activate a customer portal configuration.
2. Deploy the reviewed release and verify the exact SHA on the production alias.
3. Align the Stripe webhook endpoint with async checkout success/failure only after the handler is live.
4. Apply the managed-AI budget migration and prove no unexpected production rows changed.
5. Enable Supabase leaked-password protection.
6. Prove Twilio/Vapi funding, approved sender/number state, callbacks, usage triggers, and one clean production call.
7. Run one real $19 lifecycle: checkout → signed webhook → entitlement → allowance → portal → cancel → refund/reversal.
8. Start with 3–5 consented design partners and instrument activation, successful calls, booked/qualified outcomes, follow-up completion, gross contribution, support minutes, and churn reason.

### Scale gate

Do not scale acquisition until at least one cohort proves that customers reach a useful production call, repeat the workflow, and retain with positive observed contribution. Test/demo records are valuable engineering evidence but not demand, revenue, activation, or retention.

## Caveats

- This is a point-in-time review of the specified branch, live aggregate state, and available connectors.
- No user-level or credential-bearing production data is included in this evidence.
- Formal screenshot-diff certification was unavailable because the browser connector could inspect the page but could not persist screenshots to the workspace. Interactive browser checks and code-level design contracts were used; this limitation must not be described as screenshot-backed QA.
- Stripe business-profile edits, Supabase password-protection settings, and live Twilio account posture require operator/vendor surfaces not exposed by the installed connectors.

