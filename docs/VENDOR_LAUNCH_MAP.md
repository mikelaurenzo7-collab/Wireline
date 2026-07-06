# Vendor Launch Map

Status: **Active**. Single launch-ready inventory for Wireline surfaces, vendors, and connectors.

| Vendor / surface | Role | State | Notes |
| --- | --- | --- | --- |
| Supabase Postgres | Tenant data plane | **live** | Drizzle + RLS; custom auth with HIBP screening |
| Vercel | Web hosting + serverless API | **live** | Production deploy path; monitor via deployment checks |
| Stripe | Plans, Conversation Balance, add-ons | **live** | Catalog contract in `scripts/setup-stripe-catalog.mjs`; legacy products retired in reconciler — confirm before deactivating live objects |
| OpenAI | Managed reasoning + voice runtime | **live** | Primary structured + Vapi voice model |
| Google Gemini | AI fallback + grounded search | **live** | Automatic failure fallback |
| OpenRouter | Per-agent custom models | **beta** | Opt-in breadth; pass-through metering |
| Vapi | PSTN orchestration | **live** | Inbound/outbound call runtime |
| Twilio | SMS, WhatsApp, number import | **live** | Platform-backed messaging tools |
| Deepgram Flux | Transcription / turn-taking via Vapi | **live** | Production voice path |
| ElevenLabs | Branded + cloned voices | **live** | Default agent voice library |
| OpenAI Realtime | Low-latency voice experiments | **beta** | Gated runtime paths |
| LiveAvatar | Live video presenter | **beta** | Business-agent add-on; Wireline-owned customer copy |
| HeyGen | Catalog avatar / presenter fallback | **beta** | Operator-only; no vendor names in customer UI |
| Resend | Transactional email | **live** | Support + product email |
| Upstash Redis | Rate limits + spend controls | **live** | Required in production |
| DocuSign | E-sign actions | **beta** | Envelope flows; finish template UX before expansion |
| Have I Been Pwned | Breached-password screening | **live** | Custom auth path; Supabase Auth leaked-password advisor N/A |
| ChatGPT App (MCP) | Account-bound drafting + simulation | **beta** | OAuth MCP; cannot bypass Wireline auth |
| Browser extension | Page-context handoff to Studio | **live** | Explicit user action only |
| iOS native | Command center + calls | **beta** | `/api/mobile/*` adapter |
| Android native | Command center + calls | **beta** | `/api/mobile/*` adapter; AGP 9.0.1 / Compose 2.3.20 |
| X / X Ads | Social engagement + ads stats | **beta** | Approval queues before deeper automation |
| Meta ads | Paid media connector | **beta** | Diagnostics before scale |
| Yahoo Mail | IMAP carrier | **beta** | Finish XOAUTH2 before full mail parity |
| Shopify / Square | Commerce actions | **beta** | Policy-aware refunds and inventory |
| Google Workspace | Mail, calendar, sheets | **live** | Primary workspace connector |
| Microsoft 365 | Outlook, Teams, Excel | **live** | Primary Microsoft connector |
| HubSpot / Salesforce | CRM writeback | **live** | OAuth per tenant |
| Apollo | Enrichment | **beta** | Platform + OAuth hybrid |
| Slack / Zoom | Notifications + meetings | **beta** | OAuth per tenant |
| Tavus / alternate video APIs | Future conversational video | **planned** | Evaluate only after LiveAvatar quality/cost review |
| Zendesk / Intercom | Support desk | **planned** | After CRM + email writeback maturity |
| ServiceTitan / Housecall Pro | Home-services vertical | **planned** | After repeatable local-service wedge |

## Stripe legacy cleanup

Before deactivating any Stripe product or price:

1. Run `node scripts/audit-stripe-catalog-live.mjs` (read-only).
2. Confirm **zero** active subscriptions, payment links, and open checkout sessions reference legacy objects.
3. Present the exact product/price ids to the owner for one object-level approval.
4. Only then run catalog reconciler writes (`npm run stripe:setup`).

## Source checks

- Runtime registry: `src/lib/runtime-integrations-registry.ts`
- Workspace catalog: `src/lib/workspace-integration-catalog.ts`
- Showcase matrix: `docs/PRODUCT_SHOWCASE_MATRIX.md`
- Integration audit: `docs/INTEGRATION_VENDOR_AUDIT.md`
