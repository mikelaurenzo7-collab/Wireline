# Wireline Architecture

Wireline is an AI communications product with one operating loop: **Create -> Train -> Wire -> Run**.

A customer builds an agent, trains it with durable knowledge and policy, wires it to numbers and tools, then runs work through Studio. Calls, texts, follow-up, approvals, handoffs, transcripts, and outcomes feed review and continued training.

## Product boundary

1. A person creates a focused agent.
2. They train the agent with instructions, knowledge, tone, voice, escalation policy, and workflow behavior.
3. They wire calendars, email, contacts, CRM, numbers, billing, routing, approvals, and other launch controls when useful.
4. Voice, messaging, browser context, email, and automation execution use the saved agent profile.
5. Every agent keeps an identity badge. Live talking-head video is retired; new presenter sessions, video files, and substitute clip scripts are not offered.
6. Outcomes feed review, coaching, analytics, and retraining.

Historic workspace URLs should redirect into the active agent workflow rather than maintaining parallel management surfaces.

## Frontend surfaces

| Concern              | Source                                                                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entry                | `src/main.tsx`                                                                                                                                                                        |
| Routing              | `src/App.tsx`, `src/routes/AppRoutes.tsx`                                                                                                                                             |
| Session boundary     | `src/components/layout/AppShell.tsx`, `src/components/WorkspaceShell.tsx`                                                                                                             |
| Overview             | `src/pages/OverviewPage.tsx`                                                                                                                                                          |
| Create               | `src/pages/AgentStudioHome.tsx`, `src/components/CreateAgentDialog.tsx`                                                                                                               |
| Train                | `src/pages/KnowledgePage.tsx`, `src/components/KnowledgeBaseClaude.tsx`, `src/components/training/ReportingPreferences.tsx`, `src/components/training/RecentCallArtifactRequests.tsx` |
| Wire                 | `src/pages/ConnectionsPage.tsx`, `src/pages/SalesforceIntegrationPage.tsx`                                                                                                            |
| Run / Studio         | `src/components/StudioWorkspaceV2.tsx`, `src/components/StudioWorkroom.tsx`                                                                                                           |
| Agent roster/state   | `src/contexts/AgentsContext.tsx`                                                                                                                                                      |
| Shared visual system | `design-tokens/wireline.tokens.json`, `src/constants/brand-colors.ts`, `src/styles/design-system.css`, `src/lib/wireline-design-vision.ts`                                            |

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

- **Auth and authorization:** Wireline-owned session middleware, scrypt password hashes, HIBP k-anonymous password screening, and user-scoped ownership checks. Supabase Auth is not the authentication authority.
- **Launch readiness API:** the launch-readiness health endpoint is protected by a server-owned monitor credential rather than tenant session authentication; it exposes capability levels for operational monitors.
- **Database:** Drizzle schema and migrations in `src/db` and `drizzle/migrations`, hosted on Supabase Postgres.
- **Billing:** Stripe-backed entitlements, plan catalog, Runtime Balance (Conversation Balance API/module path retained), checkout, portal, webhooks, and ledger-style reconciliation stay server-owned.
- **Voice and telephony:**
  - Production PSTN calls: Twilio buys and owns the number, then registers it with xAI Direct SIP (`sip.voice.x.ai`). Inbound `realtime.call.incoming` webhooks and outbound Twilio `<Sip>` bridges join `wss://api.x.ai/v1/realtime?call_id=...`.
  - xAI currently routes registered SIP calls through Think Fast 2.0. The SIP `call_id` join is provider-bound and cannot be version-pinned by Wireline; a future provider alias change requires recertification.
  - Studio live tests use a direct xAI WebSocket pinned to `grok-voice-think-fast-2.0`, with the same Wireline instructions, tools, voice mapping, and safety policies used on phone calls.
  - Grok 4.6 is the structured-reasoning model, not a live-call model ID. OpenAI Realtime is limited to ChatGPT private simulation. Vapi remains rollback-only and is not on the production launch path.
  - Twilio remains authoritative for numbers, signed inbound SMS, opt-out enforcement, delivery callbacks, and the two-way messaging inbox.
  - Direct `/v1/tts` is preview and marketing-audio only. It is not the PSTN engine.
  - Neither OpenAI Realtime nor Vapi is automatic failover for customer PSTN calls.
- **LLM / structured reasoning:**
  - Central policy and catalog: `src/lib/ai-models.ts`.
  - Primary: direct xAI Responses API using Grok 4.6 by default (`WIRELINE_XAI_STRUCTURED_MODEL` overrides).
  - Continuity: OpenAI GPT-5.6 Terra, then Gemini, then Vercel AI Gateway as the governed final multi-model route. Direct xAI can be disabled via `WIRELINE_ENABLE_XAI_STRUCTURED_FALLBACK=false`.
  - Personal agents, business agents, and hybrid direction all share this same managed chain; posture changes tools and workflow behavior, not the provider default.
  - ElevenLabs is optional Studio TTS, authorized private-voice, and historical showcase infrastructure. It is not a reasoning runtime or tenant PSTN default.
- **Retired video presenter boundary:**
  - Historical `src/lib/video-presenter/` and billing fields remain only for migration, settlement, and explicit retirement responses.
  - Public checkout and provider session minting stay closed. Customer surfaces show identity badges and must not imply that live talking-head video or generated clips are available.
- **Browser extension:** Wireline Command only sends active page context by explicit user action. No broad host permissions, background harvesting, token storage, or silent browsing collection.
- **ChatGPT App:** OAuth-connected MCP surface for account-bound private actions and simulations.
- **Webhooks:** signature verification and idempotent handling remain server-side.

## Data and security invariants

- Tenant-owned queries and writes are scoped to the authenticated user.
- Provider credentials are environment variables or server-side secrets.
- Billing, webhooks, account deletion, provider callbacks, and connected-tool writes are server-owned workflows.
- Browser/mobile clients may initiate intent but must not own authorization decisions.
- Outbound marketing dials run tenant DNC, federal DNC, TCPA consent, duplicate-dial, and calling-hours gates before PSTN spend. Marketing and campaign outbound remain fail-closed while federal DNC registration is incomplete.
- CSP policy checks, authorization checks, product-doc checks, and functional tests remain in the full verification path.
- Supabase Auth advisor findings must not be represented as Wireline auth blockers unless Wireline adopts Supabase Auth. Wireline's custom password and HIBP controls remain the authoritative launch gate.

## Source-of-truth discipline

| Concern                    | Canonical source                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------- |
| Product language           | `src/lib/product-copy.ts`, `src/data/wireline-knowledge.ts`, `docs/README.md`                         |
| Pricing                    | `docs/business-usage-pricing-decision.md`, `src/lib/plan-catalog.ts`                                  |
| Runtime Balance            | `src/lib/conversation-balance.ts`                                                                     |
| Design                     | `design-tokens/wireline.tokens.json`, `src/constants/brand-colors.ts`, `src/styles/design-system.css` |
| Models                     | `src/lib/ai-models.ts`, `src/lib/voice/grok-voice-config.ts`                                          |
| Native PSTN / SIP behavior | `src/lib/voice/xai-sip-*`, `docs/GROK_LIVE_VOICE.md`                                                  |
| Retired video boundary     | `src/lib/video-presenter/copy.ts`, `docs/VENDOR_LAUNCH_MAP.md`                                        |
| Repo hygiene               | `CODEBASE_HEALTH.md`                                                                                  |

## Verification

- `npm run verify` - design, source-control hygiene, route registry, docs index, OpenAPI, design-token parity, Stripe catalog contract, production build, and bundled-server import smoke.
- `npm run verify:full` - type check, audit-module and server checks, ESLint, everything in `verify`, authorization coverage, server bootstrap, tsconfig-exclude hygiene, CSP policy consistency, runtime policy, API error shape, security audit, tests, and browser-extension packaging.
- `npm run verify:contracts` - product voice, metadata, static metadata, event taxonomy, billing, and provider-boundary contracts.
- `node apps/browser-extension/scripts/build.mjs --check` - browser extension packaging and policy check.
- `GET /api/health` - public production health probe.
