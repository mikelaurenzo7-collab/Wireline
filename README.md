# BotBound

BotBound gives **your Bot calling, email, and a Computer**. Start with a focused job: answer incoming calls, handle requested email, or complete supervised web work with visible proof and an owner handoff. Connected browser and ChatGPT surfaces use the same account and Bot. Native clients and additional channels retain their own release gates.

Public pages present calls, SMS, email, and Computer. Activation still requires the applicable entitlement, verified sender, recipient permission, funding, and provider readiness. Reviewed service calls remain a separate workflow; campaign calling and unverified integrations are not certified by the public design release.

Public marketing leads with capabilities, outcomes, and a clear signup action. Inside the product, customers create a Bot, set it up, and rehearse privately before activating live work. Product architecture supports these steps through Create, Training, and Wire:

1. **Create** a focused Bot for a specific job.
2. **Set Up** its facts, sources, policies, voice, tone, tools, and workflows.
3. **Rehearse** customer conversations privately and refine the setup.
4. **Connect and activate** a number, integrations, routing, approvals, and billing when ready.

**Studio / Operations** brings calls, email, Computer work, follow-up, approvals, handoffs, and logged outcomes together. Conversation review and later refinements remain available after launch; they are not another setup step.

Studio rehearsal opens with Voice and starts the microphone only after an explicit
Start action. Text rehearsal remains available with its drafts preserved. A connected
phone has a separate real-call test; enabled live actions can run there. Human Handoff
in Bot settings lets owners save notification contacts, escalation triggers, and an
optional live-transfer destination without using setup chat.

## Product surface

- **Web/API - core product:** canonical Create, Training, Wire, Studio, billing, provider, and account runtime. Availability and pilot admission depend on the release gates in `docs/DEPLOYMENT_RUNBOOK.md`.
- **BotBound Command - early access:** explicit-action Manifest V3 browser handoff for page context, calls, texts, follow-up, and tasks. Technical package paths retain the `wireline` namespace for compatibility.
- **ChatGPT / Claude / Cursor - early access:** OAuth-connected, account-bound MCP tools. Cursor Directory packaging is `.mcp.json` at the repo root. Create an account, draft the first Bot, privately rehearse, then continue in BotBound.
- **iOS - planned:** native calls, Siri, widgets, CallKit, push, and urgent owner controls; TestFlight and App Store release remain gated.
- **Android - internal beta:** native calls, notifications, widgets, Telecom, FCM, and urgent owner controls; Play release remains gated.
- **Identity - retired live talking-head:** identity badges stay on every Bot. Video files and clip-script substitutes are not offered. LiveAvatar / HeyGen sessions are not minted.

### Current Shared Work Offer

New enrollment offers Lite at $12/month with $4 of shared work, Starter at $24/month with $14, and Plus at $49/month with $36. Lite and Starter each include one local number and one managed email address; Plus includes two of each. Inbound and outbound calls cost $0.25/minute, sent US SMS $0.04/segment, sent email replies $0.02 each, and Computer $0.20/minute, all using the same monthly allowance without rollover. Additional numbers are $3/month and email addresses $4/month. The default monthly pretax cap is $100. Usage, provider processing, identity capacity, and activation remain bounded; see `docs/USAGE_BILLING.md` and `src/lib/usage-billing-catalog.ts`. Existing subscriptions are not automatically migrated.

### Legacy Package Compatibility

The following packages describe preserved subscriptions and historical catalog compatibility, not the default new offer. Paid packages include one Bot. **BotBound Personal is a paid plan**, historically $12/month or $120/year, with 20 monthly call minutes, one local number, Computer access metered against its managed AI allowance, and a connection to the customer's existing Gmail or Outlook inbox. It does not include a managed mailbox. Historical Free Builder references and `free`/`builder` plan slugs do not make Personal free; account signup and a private draft do not authorize live work.

Channel packages include the Calls and/or Email selected at checkout. Calls includes a local number; Email includes a managed mailbox. Customers choose an available US area code and exact number in Phone setup. Email-only activation does not require Twilio, and Calls-only does not allocate an AgentMail mailbox. SMS activation still requires carrier, consent, funding, and cost checks. Background identity repair reuses an owned line and never chooses a new number for the customer. Unpaid draft Bots receive no live identity; unused capacity does not pre-provision carrier numbers. See `src/lib/plan-catalog.ts` and server-owned entitlements for the commercial contract.

Every customer's email must use that customer's verified business identity and signature. Customer-owned domains require their own setup and DNS verification; an included managed mailbox does not prove a customer domain is configured.

Calls Light / Regular / High include 50 / 250 / 500 minutes per month, respectively, with one Bot and one call at a time at every capacity. Higher usage capacity does not add Bots, numbers or mailboxes. Extra-Bot subscriptions are not available for new channel packages. Each included phone slot permits one new carrier number every 31 days; releasing a number does not reset replacement eligibility. Reassigning an existing line does not consume a new acquisition.

Channel-plan call minutes and managed AI allowances reset on the paid monthly subscription anniversary, including monthly slices of annual plans. Unused included usage does not roll over. Billing and Activity show the next reset date; legacy plans and unpaid draft allowances retain their separate accounting rules.

Calendar owns appointments, weekly availability, timezone, and booking rules at `/calendar`. Save availability to enable native booking; appointments then confirm automatically unless the owner selects approval mode. Requested appointments hold their time until confirmed or cancelled. Google and Outlook connections are optional busy-time imports refreshed by calendar sync; new native bookings are not exported to those providers. Pausing native booking does not silently fall back to them. Existing `/phone?tab=appointments` links redirect to Calendar.

## Technology and ownership

- **Web/API:** React 19, Vite, Express, TypeScript, Tailwind, Drizzle ORM, Supabase Postgres, and Node 22 on Render. The Vercel bundle remains a legacy rollback path.
- **Design:** the **BotBound Design System**, generated from shared semantic tokens for web, browser, iOS, and Android. Warm light is the first-visit web appearance; saved appearance preferences take precedence. Technical token filenames retain the `wireline` namespace.
- **Managed reasoning:** xAI first (`grok-4.7`) with OpenAI GPT-5.6 Terra as the backup, as defined in `src/lib/ai-models.ts`. Gemini is retired; the legacy Vercel AI Gateway route is disabled on Render; routing policy remains server-owned and customer surfaces never name the vendor.
- **Voice/PSTN:** OpenAI Realtime owns authenticated Studio/ChatGPT rehearsals. Stock phone calls default to xAI voice (`grok-voice-3.0`) on registered numbers; unregistered numbers use OpenAI. `WIRELINE_PHONE_VOICE_PROVIDER=openai` explicitly selects OpenAI. Eligible inbound xAI calls can recover through OpenAI during the same call; outbound and owner-test calls do not use that recovery path. Provider identity is recorded per call and updated on recovery. ElevenLabs clones and prepared catalog phone voices use the persistent media bridge described in `ARCHITECTURE.md`; supported xAI clones use its native realtime engine. Public voice previews are retired. Twilio owns carrier transport, numbers, SIP, and SMS.
- **Persistent phone worker:** production SIP calls require a separate always-on Node 22 service built from `src/entrypoints/voice-worker.ts`. The web/API service forwards verified webhooks; the worker maintains calls for up to 60 minutes and drains before replacement. The Render migration uses separate API and voice services in `render.yaml`; source deployment alone does not complete the traffic cutover. See `deploy/voice-worker/` and `docs/OPENAI_REALTIME_VOICE.md`.
- **Browser:** explicit-user-action context handoff only. No broad host permissions, silent browsing, token storage, or background page harvesting.
- **Cloud computer:** each Bot can work in an isolated hosted browser, show its live screen and activity, and pause for its owner at account or decision checkpoints. Owners can also request control while the Bot is working; it pauses after its current step and re-plans from the owner-updated screen when control is returned. BotBound keeps browser access, AI usage, and external actions behind server-side controls.
- **Native:** SwiftUI/XcodeGen for iOS and Kotlin/Compose for Android. Clients remain thin adapters over server-owned policy.
- **Security:** server-owned authorization, provider credentials, billing, webhooks, tenant-scoped data access, CSP checks, rate limits, and verification gates.

## Getting started

```bash
npm install
npm run dev          # Vite + Express on http://localhost:3000
```

### BotBound Command

```bash
node apps/browser-extension/scripts/build.mjs --check
node apps/browser-extension/scripts/build.mjs
```

Load `apps/browser-extension/dist/chromium` or `apps/browser-extension/dist/firefox` for local testing. See `apps/browser-extension/README.md`.

## Verification

```bash
npm run check-prod-env
npm run source-control:check
npm run docs:check
npm run verify
npm run verify:full
npm run verify:contracts
node apps/browser-extension/scripts/build.mjs --check
node scripts/check-chatgpt-app-release.mjs --url https://botbound.app
```

Use `npm run verify` for focused implementation branches. Use `npm run verify:full` before merge/release or any change touching auth, billing, CSP, routes, data access, provider integrations, shared runtime contracts, migrations, or production environment shape.

Phone-worker releases additionally require `npm run build:voice-worker`, container/runtime verification and the two-service release sequence in [docs/DEPLOYMENT_RUNBOOK.md](./docs/DEPLOYMENT_RUNBOOK.md). Founder funding, workflow proof and publication steps live in [docs/LAUNCH_GURU_PLAYBOOK_2026-07-20.md](./docs/LAUNCH_GURU_PLAYBOOK_2026-07-20.md).

## Repository map

| Concern                               | Source of truth                                                                                                                                      |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contribution workflow                 | [CONTRIBUTING.md](./CONTRIBUTING.md)                                                                                                                 |
| Repository health                     | [CODEBASE_HEALTH.md](./CODEBASE_HEALTH.md)                                                                                                           |
| Architecture                          | [ARCHITECTURE.md](./ARCHITECTURE.md)                                                                                                                 |
| Public positioning and creative proof | [docs/LAUNCH_SOURCE_OF_TRUTH_2026-08-11.md](./docs/LAUNCH_SOURCE_OF_TRUTH_2026-08-11.md)                                                             |
| Documentation map                     | [docs/README.md](./docs/README.md)                                                                                                                   |
| Audit evidence                        | [docs/AUDIT_INDEX.md](./docs/AUDIT_INDEX.md)                                                                                                         |
| Client/release boundaries             | [docs/CLIENT_SURFACES.md](./docs/CLIENT_SURFACES.md)                                                                                                 |
| Pricing and billing                   | `src/lib/plan-catalog.ts`, `src/lib/conversation-balance.ts`, [docs/business-usage-pricing-decision.md](./docs/business-usage-pricing-decision.md)   |
| Design system                         | `design-tokens/wireline.tokens.json`, `src/constants/brand-colors.ts`, `src/styles/design-system.css`                                                |
| Voice and model policy                | `src/lib/ai-models.ts`, `src/lib/voice/`, [docs/PRODUCTION_VOICE_RUNTIME_POLICY_2026-07-26.md](./docs/PRODUCTION_VOICE_RUNTIME_POLICY_2026-07-26.md) |
| Browser extension                     | `apps/browser-extension/`                                                                                                                            |
| Native clients                        | `ios/`, `android/`                                                                                                                                   |
| ChatGPT App                           | `src/routes/chatgpt-mcp-*`, `src/lib/chatgpt-mcp-*`, `api/mcp.ts`, [docs/CHATGPT_APP.md](./docs/CHATGPT_APP.md)                                      |
| Cursor Directory                      | `.mcp.json`, `plugin.json`, `mcp.json`, [docs/CURSOR_PLUGIN.md](./docs/CURSOR_PLUGIN.md)                                                             |
| Tests and checks                      | `tests/`, `scripts/check-*.mjs`, `scripts/generate-authz-matrix.ts`                                                                                  |

## Repository hygiene

- Do not commit generated screenshots, visual-QA output, local agent artifacts, exported environments, provider payloads, temporary patches, coverage, Playwright output, build output, or asset bundles.
- Link every durable `docs/**/*.md` file from exactly one documentation index.
- Do not create parallel design systems, duplicate source-of-truth files, or temporary `*-v2` migration wrappers.
- Keep credentials, user data, billing, webhook validation, authorization, and tenant-scoped reads server-owned.

## License

Proprietary. Copyright BotBound.
