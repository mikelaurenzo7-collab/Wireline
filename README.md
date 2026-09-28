# BotBound

BotBound is the operating layer for **your Bot across calls, texts, and email**. Start with one trained Bot or build a coordinated roster that can book appointments, revive leads, promote offers, recover opportunities, answer demand, text outcomes, draft follow-up, and surface the right work across web, mobile, browser, and ChatGPT.

Public marketing leads with capabilities, outcomes, and a clear signup action. Operational guidance stays inside the product: after create, the setup guide is **Train -> Test -> Launch**. Product architecture supports this work through Create, Training, and Wire:

1. **Create / Build** a focused Bot quickly.
2. **Train** it with facts, sources, policies, voice, tone, tools, and workflows.
3. **Wire / Launch** it to an included number slot, integrations, routing, approvals, and billing controls.

**Studio / Operations** brings calls, texts, follow-up, approvals, handoffs, and logged outcomes together. Conversation review and later refinements remain available after launch; they are not another setup step.

## Product surface

- **Web/API - core product:** canonical Create, Training, Wire, Studio, billing, provider, and account runtime. Availability and pilot admission depend on the release gates in `docs/DEPLOYMENT_RUNBOOK.md`.
- **BotBound Command - early access:** explicit-action Manifest V3 browser handoff for page context, calls, texts, follow-up, and tasks. Technical package paths retain the `wireline` namespace for compatibility.
- **ChatGPT / Claude / Cursor - early access:** OAuth-connected, account-bound MCP tools. Cursor Directory packaging is `.mcp.json` at the repo root. Create an account, draft the first Bot, privately rehearse, then continue in BotBound.
- **iOS - planned:** native calls, Siri, widgets, CallKit, push, and urgent owner controls; TestFlight and App Store release remain gated.
- **Android - internal beta:** native calls, notifications, widgets, Telecom, FCM, and urgent owner controls; Play release remains gated.
- **Identity - retired live talking-head:** identity badges stay on every Bot. Video files and clip-script substitutes are not offered. LiveAvatar / HeyGen sessions are not minted.

Paid packages include one Bot and the **Calls, Email, or SMS channels selected at checkout**. Calls includes a local number; Email includes a managed mailbox. Customers choose an available US area code and exact number in Phone setup. Email-only activation does not require Twilio, and Calls-only does not allocate an AgentMail mailbox. SMS combinations remain unavailable to activate until carrier and cost checks pass. Background identity repair reuses an owned line and never chooses a new number for the customer. Free Builder Bots receive no live identity; unused capacity does not pre-provision carrier numbers. See `src/lib/plan-catalog.ts` for the commercial contract.

Calls Light / Regular / High include 50 / 250 / 500 minutes per month, respectively, with one Bot and one call at a time at every capacity. Higher usage capacity does not add Bots, numbers or mailboxes. Extra-Bot subscriptions are not available for new channel packages. Each included phone slot permits one new carrier number every 31 days; releasing a number does not reset replacement eligibility. Reassigning an existing line does not consume a new acquisition.

Channel-plan call minutes and managed AI allowances reset on the paid monthly subscription anniversary, including monthly slices of annual plans. Unused included usage does not roll over. Billing and Activity show the next reset date; legacy plans and Free Builder retain calendar-month accounting.

Calendar owns appointments, weekly availability, timezone, and booking rules at `/calendar`. Save availability to enable native booking; appointments then confirm automatically unless the owner selects approval mode. Requested appointments hold their time until confirmed or cancelled. Google and Outlook connections are optional busy-time imports refreshed by calendar sync; new native bookings are not exported to those providers. Pausing native booking does not silently fall back to them. Existing `/phone?tab=appointments` links redirect to Calendar.

## Technology and ownership

- **Web/API:** React 19, Vite, Express, TypeScript, Tailwind, Drizzle ORM, Supabase Postgres, and Node 22 on Render. The Vercel bundle remains a legacy rollback path.
- **Design:** the **BotBound Design System**, generated from shared semantic tokens for web, browser, iOS, and Android. Dark is the first-visit appearance; saved appearance preferences take precedence. Technical token filenames retain the `wireline` namespace.
- **Managed reasoning:** OpenAI GPT-5.6 Terra primary with Gemini continuity on Render, as defined in `src/lib/ai-models.ts`. The legacy Vercel AI Gateway route is disabled on Render; routing policy remains server-owned.
- **Voice/PSTN:** OpenAI Realtime owns authenticated Studio/ChatGPT rehearsals, founder-owned internal Bot profiles, and every customer phone conversation. Public voice previews are retired. Twilio owns carrier transport, numbers, SIP, and SMS. There is no alternate call runtime.
- **Persistent phone worker:** production SIP calls require a separate always-on Node 22 service built from `src/entrypoints/voice-worker.ts`. The web/API service forwards verified webhooks; the worker maintains calls for up to 60 minutes and drains before replacement. The Render migration uses separate API and voice services in `render.yaml`; source deployment alone does not complete the traffic cutover. See `deploy/voice-worker/` and `docs/OPENAI_REALTIME_VOICE.md`.
- **Browser:** explicit-user-action context handoff only. No broad host permissions, silent browsing, token storage, or background page harvesting.
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
