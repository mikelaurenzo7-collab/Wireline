# Channel pricing decision — September 27, 2026

Customers choose Calls, Email and SMS independently; channel and capacity selectors resolve 21 packages. Free Builder stays private. The current source prices and rollout availability are in [Billing operations](P0_BILLING_OPS_NOTE.md) and `src/lib/plan-catalog.ts`; live deployment and Stripe amounts require separate verification.

Light package IDs: `voice`, `email`, `sms`, `voice-email`, `voice-sms`, `email-sms`, `omnichannel`. Regular/High append `-regular` / `-high`. Catalog version `channel_plans_2026_09_v1`. Stripe keys use `{id}_{monthly|annual}_channels_2026_09_v1`. No old bundle is silently reinterpreted as a channel package.

## Economics

Voice reserve $0.128/minute; one local number $1.15/month where Calls or SMS is selected; one managed mailbox $2/month where Email is selected. Model all included managed and transport allowances independently. Commercial fees are 4.1% plus $0.30 per actual payment; annual fixed fee is spread over twelve months. Full-use contribution must reach 30%, expected-use contribution 45% at 70% ordinary variable utilization; fixed number/mailbox capacity stays fully reserved. Each Calls package also reserves the full cost of one unpaid 10-minute completion buffer ($1.28 normal; $1.40 stress), without probability discounting. Stress $0.14/minute must retain at least 25% full / 40% expected.

| Channels                  | Light monthly / annual | Regular monthly / annual | High monthly / annual |
| ------------------------- | ---------------------: | -----------------------: | --------------------: |
| Calls                     |             $15 / $150 |               $59 / $690 |         $219 / $2,499 |
| Email                     |               $9 / $90 |               $29 / $290 |            $69 / $690 |
| SMS (unavailable)         |             $12 / $120 |               $29 / $339 |            $79 / $899 |
| Calls + Email             |             $21 / $210 |               $79 / $899 |         $269 / $2,999 |
| Calls + SMS (unavailable) |             $20 / $200 |               $79 / $939 |         $279 / $3,199 |
| Email + SMS (unavailable) |             $18 / $180 |               $49 / $499 |         $129 / $1,399 |
| All three (unavailable)   |             $26 / $260 |             $99 / $1,109 |         $319 / $3,699 |

Capacity never increases Bot count or concurrency. Every package has one Bot; Calls/SMS share one local number and Email has one mailbox. Light / Regular / High Calls include 30 / 250 / 1,000 minutes monthly. Standalone managed allowances are Calls $1.50 / $3 / $5; Email $2.50 / $10 / $30; SMS $2.50 / $7 / $15. Combinations add only each channel's incremental allowance above the Calls/base amount, so Email+SMS and all three receive $3.50 / $14 / $40. SMS transport is $2 / $10 / $30, separately funded. Annual prices are explicit, not ten times monthly; savings vary by package and capacity. Daily Calls guardrails are 60 / 250 / 1,000 minutes, with the same durable wallet admission and one unsettled call per tenant. Monthly usage still resets on the UTC calendar month, independently of the subscription billing date.

All 21 cases pass the normal and stress floors above, on both intervals. Calls annual normal full / expected contribution: Light 33.54% / 46.36%; Regular 30.76% / 49.02%; High 30.86% / 50.02%. Stress annual full / expected: 29.70% / 43.38%; 25.33% / 45.16%; 25.04% / 45.92%. Regular $59 is cheaper than Light plus 220 top-up minutes ($63.40); High $219 is cheaper than Light plus 970 top-up minutes ($228.40). Each combined-channel package costs less than its same-capacity standalone sum. These are contribution floors, not net-profit claims.

Calls starts at $15/month or $150/year; Calls + Email is $21/$210, Calls + SMS $20/$200 and all three $26/$260. The latter two remain unavailable pending SMS readiness. Compared with a fully prepaid quote, these prices explicitly fund the bounded completion exposure. A new call must have at least one funded minute. Its allowed duration is funded minutes plus at most ten extra minutes, limited by the existing session ceiling. Admission stores one durable wallet hold and deadline per tenant; retries cannot reset that deadline. Settlement returns unused held funds or records the actual remaining charge. Debt pauses new calls and prepaid extras until paid; included Email/AI allowance and dashboard access continue. No automatic card charge or invoice is created. Confirmed unanswered or startup failures without Bot conversation are absorbed by the platform; ambiguous provider outcomes retain their hold until reconciled.

SMS rows exclude unknown per-tenant A2P charges and unbounded external incoming traffic. They are modeled quotes, with checkout disabled, not a claim of ready-to-sell SMS economics. Paid Lookup uses its own atomic reservation against managed provider allowance. The current outgoing-only transport debit is insufficient proof for receiving costs; completing that policy is mandatory before enabling SMS packages.

AgentMail is currently Developer $20 plus one $2 inbox add-on ($22/month, account observed September 27). Allocate mailbox capacity once; do not also subtract the same full provider invoice from plan contribution. The public $2/1,000 monthly-send add-on is flat purchased capacity, not usage-based invoicing. A conservative $0.002 per attempted send allocates that capacity against the pooled allowance. AI and delivery share the envelope, so there is no fixed count of AI-written emails.

Future Startup $200/month capacity may improve economics at measured scale; no upgrade is assumed or authorized. Public included capacity is 150 inboxes/150,000 monthly sends. Voice-only users consume no managed mailbox allocation. [AgentMail pricing](https://www.agentmail.to/pricing), [capacity terms](https://www.agentmail.to/blog/pay-as-you-go).

Current account evidence shows 10/11 inboxes occupied (September 27), leaving one spare. General Email checkout remains a capacity blocker despite the valid unit margin. The initial release can offer Calls only, with Email-containing interval price IDs unset; server resolution and UI checkout both require the explicit configured ID. No automated provider upgrade or new capacity-reservation engine is part of this release.

Provider expenses, company hosting/database/unused capacity, support, fraud, refunds and tax variance are distinct. These are contribution estimates, not net profit. Carrier invoices and actual voice mix still require reconciliation.

## Scope and compatibility

The user reports no real customers yet; existing accounts are demo/test. Retain historical IDs and allowance semantics for records and webhook replay, without treating old offers as available to new buyers. No automatic subscription migration, resource deletion or historical invoice rewrite. New modular plans have one Bot and do not use the historical extra-Bot bundle.

The managed Stripe portal remains payment/invoice/contact/cancellation-only. The in-app capacity endpoint supports only a higher capacity with identical channels and billing interval, scheduled at the next successful paid renewal (including the next annual renewal for annual customers). No immediate proration, quota reset, extra Bot, channel switch or cancellation/re-purchase. Runtime top-ups remain the immediate option. The authoritative paid base-plan invoice must match the subscription, customer, target price and effective period before higher capacity is projected. A Stripe phase change alone is insufficient. Failed payments keep the old capacity and ordinary subscription payment gates still apply.

GET/POST/DELETE `/api/billing/capacity-upgrade` provide status, scheduling and removal. The operation is serialized with deletion cleanup; durable provider metadata and stable per-generation Stripe keys recover interrupted attempts. An incomplete attempt is labelled unconfirmed, not scheduled. Removing a change releases only the exact owned schedule and keeps the current subscription. Stripe portal cancellation is unavailable while any schedule is attached, so the UI exposes removal before cancellation; a paid applied phase is detached automatically without reverting its price. Foreign schedules are never overwritten. No automatic usage invoice or extra card charge is introduced.

Actual Stripe products and Render environment IDs remain a separately verified release step. Setup creates no SMS prices and preserves historical objects. Stripe Tax remains off until actual registrations and the existing opt-in are verified; the cost model still reserves the 0.5% transaction component.
