# Wireline Architecture

Wireline is an AI communications product with one operating loop: **Create -> Train -> Wire -> Run**.

A customer builds an agent, trains it with durable knowledge and policy, wires it to numbers and tools, then runs work through Studio. Calls, texts, follow-up, approvals, handoffs, transcripts, and outcomes feed review and continued training.

## Product boundary

1. A person creates a focused agent.
2. They train the agent with instructions, knowledge, tone, voice, escalation policy, and workflow behavior.
3. They wire calendars, email, contacts, CRM, numbers, billing, routing, approvals, and other launch controls when useful.
4. Voice, messaging, browser context, email, and automation execution use the saved agent profile.
5. Optional video presenter support gives business agents a live visual face while preserving a Wireline-owned fallback.
6. Outcomes feed review, coaching, analytics, and retraining.

Historic workspace URLs should redirect into the active agent workflow rather than maintaining parallel management surfaces.

## Frontend surfaces

| Concern | Source |
| --- | --- |
| Entry | `src/main.tsx` |
| Routing | `src/App.tsx`, `src/routes/AppRoutes.tsx` |
| Session boundary | `src/components/layout/AppShell.tsx`, `src/components/WorkspaceShell.tsx` |
| Overview | `src/pages/OverviewPage.tsx` |
| Create | `src/pages/AgentStudioHome.tsx`, `src/components/CreateAgentDialog.tsx` |
| Train | `src/pages/KnowledgePage.tsx`, `src/components/KnowledgeBaseClaude.tsx`, `src/components/training/ReportingPreferences.tsx`, `src/components/training/RecentCallArtifactRequests.tsx` |
| Wire | `src/pages/ConnectionsPage.tsx`, `src/pages/SalesforceIntegrationPage.tsx` |
| Run / Studio | `src/components/StudioWorkspaceV2.tsx`, `src/components/StudioWorkroom.tsx` |
| Agent roster/state | `src/contexts/AgentsContext.tsx` |
| Shared visual system | `design-tokens/wireline.tokens.json`, `src/constants/brand-colors.ts`, `src/styles/design-system.css`, `src/lib/wireline-design-vision.ts` |

The visual layer is intentionally restrained: Wireline Letterpress (Aurora palette), dark/ink surfaces, a cool obsidian canvas, electric-violet action, a platinum-silver wire accent, accessible focus states, and no parallel palettes.

## Core API flow

### Agent creation

`POST /api/agents`

- Requires an authenticated user.
- Enforces account entitlement and agent-cap rules.
- Creates an agent and starting personality in one transaction.
- Records an audit event and invalidates account caches.
- Does not silently provision phone numbers. Wiring happens deliberately after creation.

### Agent training

Training endpoints extract clear user instructions into durable agent configuration.

- Require an authenticated user and an owned agent ID.
- Convert instructions, files, and source material into directives, knowledge, personality, and tool configuration.
- Persist extracted configuration against the selected agent.
- Return human-readable confirmation for the Studio conversation.

### Wiring and integrations

OAuth, CRM, telephony, billing, and connected-tool endpoints own authorization, callback validation, and provider-specific state. Studio reads connection state and sends users into the relevant connection flow; provider secrets never belong in browser state.

### Runtime execution

Runtime execution reads the saved agent profile, selected model/voice posture, connected tools, balance/entitlement state, and provider configuration. Calls, texts, follow-up, approvals, and handoffs must emit durable events and remain tenant-scoped.

## Runtime services

- **Auth and authorization:** session middleware plus user-scoped ownership checks.
- **Launch readiness API:** the launch-readiness health endpoint is protected by a server-owned monitor credential rather than tenant session authentication; it exposes capability levels for operational monitors.
- **Database:** Drizzle schema and migrations in `src/db` and `drizzle/migrations`.
- **Billing:** Stripe-backed entitlements, plan catalog, Conversation Balance, checkout, portal, webhooks, and ledger-style reconciliation stay server-owned.
- **Voice:**
  - Production PSTN calls: Twilio + Vapi-backed execution configured from agent profiles.
  - Authenticated realtime/live tests: dedicated xAI Grok voice path with server-provisioned short-lived sessions and safety-scoped tools. See `docs/GROK_LIVE_VOICE.md` and `src/lib/voice/grok-voice-*`.
- **LLM / reasoning:**
  - Central policy and catalog: `src/lib/ai-models.ts`.
  - Primary structured and many voice paths: OpenAI with Gemini fallback.
  - Custom multi-model routing: Vercel AI Gateway (last-resort in the managed chain).
  - Live Grok remains separate from Vapi production calls.
- **Video presenters:**
  - `src/lib/video-presenter/` wraps provider details behind Wireline-owned copy, status, consent, metering, and fallback language.
  - Customer surfaces should say presenter, face, or live video add-on, not vendor names.
- **Browser extension:** Wireline Command only sends active page context by explicit user action. No broad host permissions, background harvesting, token storage, or silent browsing collection.
- **ChatGPT App:** OAuth-connected MCP surface for account-bound private actions and simulations.
- **Webhooks:** signature verification and idempotent handling remain server-side.

## Data and security invariants

- Tenant-owned queries and writes are scoped to the authenticated user.
- Provider credentials are environment variables or server-side secrets.
- Billing, webhooks, account deletion, provider callbacks, and connected-tool writes are server-owned workflows.
- Browser/mobile clients may initiate intent but must not own authorization decisions.
- Outbound marketing dials run tenant DNC + federal DNC (when configured) + TCPA consent gates before PSTN spend.
- CSP policy checks, authorization checks, product-doc checks, and functional tests remain in the full verification path.
- Supabase leaked-password protection must be enabled before public launch if it remains disabled in project settings.

## Source-of-truth discipline

| Concern | Canonical source |
| --- | --- |
| Product language | `src/lib/product-copy.ts`, `docs/README.md` |
| Pricing | `docs/business-usage-pricing-decision.md`, `src/lib/plan-catalog.ts` |
| Conversation Balance | `src/lib/conversation-balance.ts` |
| Design | `design-tokens/wireline.tokens.json`, `src/constants/brand-colors.ts`, `src/styles/design-system.css` |
| Models | `src/lib/ai-models.ts` |
| Video presenter copy | `src/lib/video-presenter/copy.ts` |
| Repo hygiene | `CODEBASE_HEALTH.md` |

## Verification

- `npm run verify` — design, source-control hygiene, route registry, docs index, OpenAPI, design-token parity, Stripe catalog contract, production build, and bundled-server import smoke.
- `npm run verify:full` — type check, a second audit-modules-scoped type check, server lint, ESLint, everything in `verify`, plus authorization coverage, server bootstrap, tsconfig-exclude hygiene, CSP policy consistency, runtime policy, API error shape, `npm audit`, tests, and the browser-extension packaging check.
- `npm run verify:contracts` — product voice, metadata, static metadata, and event taxonomy contracts.
- `node apps/browser-extension/scripts/build.mjs --check` — browser extension packaging and policy check.
- `GET /api/health` — public production health probe.
