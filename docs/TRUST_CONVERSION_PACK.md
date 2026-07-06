# Wireline Trust Conversion Pack

Status: **Active canonical trust pack**. This document turns Wireline's internal security, compliance, and reliability posture into truthful customer-facing proof without inventing certifications, logos, or metrics.

## Customer-facing promise

Wireline can answer and automate communication only because the server owns identity, tenant isolation, provider credentials, billing gates, compliance checks, and audit trails. Customers should understand that safety model before they trust an agent with live calls.

## Trust pillars

| Pillar | What Wireline can truthfully say | Source posture |
| --- | --- | --- |
| Tenant isolation | Customer data is scoped to the authenticated account and server-side tenant context. | RLS/GUC model, `src/lib/server-context.ts`, `DATABASE_SETUP.md`. |
| Server-owned secrets | Provider keys, OAuth secrets, billing, webhooks, and launch controls stay server-side. | `ARCHITECTURE.md`, route/middleware boundaries. |
| Browser privacy | Wireline Command only sends page context by explicit user action. | `apps/browser-extension/README.md`, extension scripts. |
| Native control | iOS and Android are Bearer-authenticated control surfaces, not prompt/billing owners. | `docs/CLIENT_SURFACES.md`, `/api/mobile/*`. |
| Call compliance | DNC/TCPA and handoff controls are enforced before costly or regulated call actions. | Compliance libraries and mobile/outbound routes. |
| Billing safety | Conversation Balance, Stripe plans, spend controls, and usage checks protect accounts and margin. | Billing/catalog/ledger code. |
| Auditability | Security and spend events are durable evidence for reviews and incidents. | Audit routes, SOC2 evidence, incident docs. |
| Honest proof | Public trust surfaces must not use placeholder logos, fake metrics, or implied certifications. | `docs/AURORA_MASTERPLAN.md`, marketing review rule. |

## Public trust-page checklist

Before paid traffic scales, every public trust claim should answer:

1. Is this already implemented, configured, and verified?
2. Is the proof customer-safe to disclose?
3. Is a certification or vendor relationship implied? If yes, is it actually complete?
4. Does the page explain what the browser extension sends and what it never collects?
5. Does the page explain how calls, transcripts, billing, and account deletion are handled?
6. Does the page avoid vendor names where customer copy should stay Wireline-owned?

## Sales enablement

The sales-ready trust pack should include one URL with:

- Data isolation summary.
- Subprocessor/vendor overview.
- Call recording/transcript summary.
- TCPA/DNC posture.
- Browser extension privacy posture.
- Mobile/native data handling summary.
- Incident response and support commitments.
- Billing/spend-control explanation.
- Contact path for security review.

## Non-negotiables

- Do not claim SOC 2 certification unless complete.
- Do not show customer logos or metrics without written permission and current evidence.
- Do not imply the browser extension harvests pages automatically.
- Do not imply agents can perform external actions unless Wireline actually performed the action through a server-owned workflow.
