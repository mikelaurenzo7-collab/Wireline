# BotBound operating-cost map

**Updated:** August 31, 2026

**Note:** The dated filename is retained for documentation-link stability. The
former Wireline/Vapi/video/voice-cloning snapshot is superseded by this launch
map.

This is a dependency and billing-control inventory, not an invoice. Dollar
amounts and plan tiers must be refreshed from the vendor billing pages before a
finance decision.

## Fixed and semi-fixed infrastructure

| Vendor | Production role | Cost shape | Launch action |
| --- | --- | --- | --- |
| Vercel | Web, API functions, deployment, edge delivery | Base plan plus usage | Keep one canonical BotBound production project; audit seats, bandwidth, functions, and build minutes monthly |
| Supabase | Managed Postgres, backups, connection pooler | Base plan plus compute/storage | Treat as shared production data; use append-only Drizzle migrations and verify schema objects after promotion |
| GitHub | Source control and review | Plan, seats, Actions, storage | Reconcile plan/billing; a job that runs and finds a defect remains a release blocker |
| Domain/DNS | `botbound.me` and required sender domains | Annual renewal | Record registrar, owner, renewal, DNS, and recovery access |
| Upstash | Distributed rate limits and spend controls | Usage/plan | Required for production safety; never rely on per-instance memory limits |
| Resend / AgentMail | Platform transactional email / managed Bot mailboxes | Usage/plan | Monitor deliverability, suppressions, webhook health, and mailbox inventory |

## Usage-metered production services

| Vendor | Production role | Cost boundary |
| --- | --- | --- |
| OpenAI | Primary structured inference, every interactive browser/phone voice session, transcription, and approved campaign TTS | Enforce tenant admission, prepaid Runtime Balance, duration/token accounting, and account-level spend limits |
| Twilio | One carrier for phone numbers, PSTN/SIP, inbound and outbound calls, SMS, status callbacks, and opt-out controls | Audit unused numbers monthly; reserve SMS/voice cost before provider work; preserve exact sender and at-most-once carrier attempts |
| Vercel AI Gateway | Governed structured-runtime continuity and observability | Budget independently; it never changes the customer-selected speech voice |
| Google Gemini | Structured continuity and grounded-search fallback | Optional/configured; keep behind the managed policy and spend controls |
| Perplexity | Optional public web research | Enable only when the feature and customer economics justify it |
| Stripe | Payments, tax, entitlements, and prepaid Runtime Balance funding | Transaction fees; webhook and ledger reconciliation remain server-owned |

## Explicitly outside the launch cost base

- No alternate live-call orchestrator or speech provider.
- No external voice catalog, cloning subscription, or customer voice-upload
  workflow.
- No live talking-head video vendor, video checkout, or session minting.
- No duplicate Neon database unless a separately documented staging or recovery
  purpose is approved.
- Customer-connected Google, Microsoft, CRM, calendar, commerce, and team tools
  should remain customer-owned unless BotBound intentionally buys internal
  seats or credits.

## Required operating ledger

Maintain one private owner ledger with: vendor, account owner, billing email,
plan, fixed base, usage unit, monthly cap, renewal date, payment method owner,
production dependency, cancellation/recovery path, and last reconciliation
date. Never store credentials in that ledger or in the repository.

## Monthly controls

1. Reconcile OpenAI and Twilio usage to BotBound's internal usage ledger and
   customer-funded Runtime Balance.
2. Review Twilio number inventory and release only numbers whose product and
   compliance obligations have been closed safely.
3. Review OpenAI project limits, service-account ownership, and unexpected model
   or endpoint usage.
4. Reconcile Vercel, Supabase, Upstash, email, GitHub, and domain invoices.
5. Confirm optional providers are either intentionally configured and funded or
   absent from production environment variables.
6. Investigate every provider-accepted/local-reconciliation-pending event; do
   not fund a duplicate carrier or model attempt when the first result is
   ambiguous.

## Planning principle

The launch base is infrastructure-led; growth is usage-led. Paid plan economics
must cover OpenAI and Twilio variable cost, support, payment fees, taxes, and a
margin buffer. Do not publish a fixed monthly operating total from this file:
refresh actual invoices and current vendor prices first.
