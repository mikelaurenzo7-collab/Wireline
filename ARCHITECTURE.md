# BotBound Architecture

BotBound is one Bot product and workspace across calls, texts, email, tools, and
outcomes. Its technical operating loop is **Create -> Train -> Wire -> Run**.
Public messaging leads with concrete Bot capabilities, outcomes, and signup rather than a setup-step list.

A customer configures a Bot with durable knowledge and policy, connects it to numbers and tools, then runs work through Studio. After create, customers see **Train -> Rehearse -> Launch**. Calls, texts, follow-up, approvals, handoffs, transcripts, and outcomes remain available for optional review and later refinements. Ongoing review is not an additional setup step.

## Product boundary

1. A person creates a focused Bot.
2. They train the Bot with instructions, knowledge, tone, voice, escalation policy, and workflow behavior.
3. They wire calendars, email, contacts, CRM, numbers, billing, routing, approvals, and other launch controls when useful.
4. Voice, messaging, browser context, email, and automation execution use the saved Bot profile.
5. Live talking-head video is retired. Compatibility presenter code may support identity badges and fail-closed legacy webhooks, but it must not mint sessions or create a separate product surface.
6. Outcomes feed review, coaching, analytics, and retraining.

Historic workspace URLs should redirect into the active Bot workflow rather than maintaining parallel management surfaces.

## Frontend surfaces

| Concern              | Source                                                                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entry                | `src/main.tsx`                                                                                                                                                                        |
| Routing              | `src/App.tsx`, `src/routes/AppRoutes.tsx`                                                                                                                                             |
| Session boundary     | `src/components/layout/AppShell.tsx`, `src/components/WorkspaceShell.tsx`                                                                                                             |
| Home / Studio        | `src/pages/AgentStudioHome.tsx`, `src/components/StudioWorkspaceV2.tsx`; `/` and retired `/overview` resolve to `/studio`                                                             |
| Create               | `src/pages/AgentStudioHome.tsx`, `src/components/CreateAgentDialog.tsx`                                                                                                               |
| Train                | `src/pages/KnowledgePage.tsx`, `src/components/KnowledgeBaseClaude.tsx`, `src/components/training/ReportingPreferences.tsx`, `src/components/training/RecentCallArtifactRequests.tsx` |
| Launch / Connections | `src/pages/ConnectionsPage.tsx`, `src/pages/SalesforceIntegrationPage.tsx`                                                                                                            |
| Run / Studio         | `src/components/StudioWorkspaceV2.tsx`, `src/components/StudioWorkroom.tsx`                                                                                                           |
| Bot roster/state     | `src/contexts/AgentsContext.tsx`                                                                                                                                                      |
| Shared visual system | `design-tokens/wireline.tokens.json`, `src/constants/brand-colors.ts`, `src/styles/design-system.css`, `src/lib/wireline-design-vision.ts`                                            |

The visual layer is intentionally restrained: the BotBound Design System uses dark/ink surfaces, a near-black canvas, electric-violet action, a platinum-silver wire accent, and accessible focus states. Dark is the first-visit appearance; saved light, dark, or system preferences take precedence. Both appearances share one component and interaction system.

## Core API flow

### Bot creation

`POST /api/agents`

- Requires an authenticated user.
- Enforces account entitlement and agent-cap rules.
- Creates a Bot and starting personality in one transaction.
- Records an audit event and invalidates account caches.
- Queues durable identity setup after the Bot record commits. Free Builder allocates no live identity. Paid channel entitlements independently authorize the customer-selected number and/or managed mailbox; Email-only has no carrier dependency, and Calls-only has no mailbox dependency. SMS activation also requires carrier readiness. Connected-client drafts remain private until explicitly activated in BotBound. Private rehearsal and workflow review still precede customer traffic.

### Bot training

Training endpoints extract clear user instructions into durable Bot configuration.

- Require an authenticated user and an owned agent ID.
- Convert instructions, files, and source material into directives, knowledge, personality, and tool configuration.
- Persist extracted configuration against the selected Bot.
- Return human-readable confirmation for the Studio conversation.

### Wiring and integrations

OAuth, CRM, telephony, billing, and connected-tool endpoints own authorization, callback validation, and provider-specific state. Studio reads connection state and sends users into the relevant connection flow; provider secrets never belong in browser state.

### Runtime execution

Runtime execution reads the saved Bot profile, selected model/voice posture, connected tools, balance/entitlement state, and provider configuration. Calls, texts, follow-up, approvals, and handoffs must emit durable events and remain tenant-scoped.

## Runtime services

- **Auth and authorization:** BotBound-owned session middleware, scrypt password hashes, HIBP k-anonymous password screening, and user-scoped ownership checks. Supabase Auth is not the authentication authority.
- **Launch readiness API:** the launch-readiness health endpoint is protected by a server-owned monitor credential rather than tenant session authentication; it exposes capability levels for operational monitors.
- **Database:** Drizzle schema and migrations in `src/db` and `drizzle/migrations`, hosted on Supabase Postgres.
- **Billing:** Stripe-backed entitlements, plan catalog, Runtime Balance (Conversation Balance API/module path retained), checkout, portal, webhooks, and ledger-style reconciliation stay server-owned.
- **Voice and telephony:**
  - Every authenticated browser rehearsal and production phone conversation uses OpenAI Realtime (`gpt-realtime-2.1`). Founder-owned internal Bot profiles and customer Bots share the same runtime authority and have no alternate call provider.
  - Customers can choose any of the 10 built-in OpenAI Realtime voices: Alloy, Ash, Ballad, Coral, Echo, Sage, Shimmer, Verse, Marin, or Cedar. The saved voice is fixed for an active session and may be changed between sessions. Authenticated Studio rehearsals and phone calls resolve the same saved OpenAI voice, including the phone fallback for legacy presenter records.
  - Twilio owns numbers, PSTN transport, signed voice/SMS callbacks, opt-out enforcement, delivery callbacks, and the two-way messaging inbox. Inbound calls reach a signed BotBound TwiML webhook and bridge to `sip:<OPENAI_PROJECT_ID>@sip.api.openai.com;transport=tls`; outbound calls ring the customer through Twilio before the same OpenAI SIP bridge.
  - OpenAI signs `realtime.call.incoming` at `/api/webhooks/openai/realtime`; BotBound accepts the call with the selected Bot runtime and maintains the server-side sideband tool session.
  - The public Render API webhook verifies and forwards the untouched signed event to a separate persistent Node 22 worker. The worker verifies both service authentication and the original provider signature before admission; it owns the sideband WebSocket, tools, rolling spend estimate and terminal persistence. Full telephone conversations default to 60 minutes; private rehearsals remain five minutes. Web and worker ship from the same reviewed source and require separate deployment verification and graceful worker drain. See `docs/OPENAI_REALTIME_VOICE.md` and `docs/DEPLOYMENT_RUNBOOK.md`.
  - Authenticated Studio rehearsals and hosted ChatGPT/MCP private simulations use server-mediated OpenAI Realtime WebRTC. Public and guest audio/call demos are retired. The server exchanges SDP and returns only a session-bound answer; provider credentials never reach the browser.
  - BotBound has no external voice-cloning provider or customer voice-upload path. Historical provider tables are removed by migration; only OpenAI's built-in voice roster is selectable.
- **LLM / structured reasoning:**
  - Central policy and catalog: `src/lib/ai-models.ts`.
  - Primary: direct OpenAI Responses API using GPT-5.6 Terra by default (`WIRELINE_OPENAI_STRUCTURED_MODEL` overrides).
  - Continuity on Render: direct Gemini. The legacy Vercel deployment may use AI Gateway before Gemini; Render disables that transport.
  - Every Bot and call direction shares this same managed chain; roles and use cases change configuration, not the provider default or product mode.
  - Speech generation and live-call voice remain OpenAI-owned; structured continuity never changes the selected speaker.
- **Video presenters:** Live talking-head video is retired. `src/lib/video-presenter/` remains compatibility infrastructure for identity badges and fail-closed legacy paths; customer surfaces must not offer presenter checkout or session minting.
- **Browser extension:** BotBound Command only sends active page context by explicit user action. No broad host permissions, background harvesting, token storage, or silent browsing collection.
- **Cloud computer:** `/computer` gives each Bot owner-assigned web tasks in an isolated hosted browser. The owner can view the live screen and activity, take direct control during a handoff, then return the browser to the Bot. `src/lib/cloud-computer/` uses the shared `OPENAI_API_KEY` with the OpenAI Responses computer tool and an isolated hosted browser reached by `CLOUD_COMPUTER_BROWSER_WS_URL` (wss in production; local Chromium is development-only). Every request is DNS-checked to public addresses; scripts, uploads, downloads, console, and network reads are disabled. The Bot never types passwords or payment details; direct owner-entered browser text stays in memory for redaction, is not stored in task history or sent as separate text to the model, and is masked from the screen shared with OpenAI after hand-back. Each model turn reserves and settles against the account's AI allowance (`computer.browse`), tasks require a paid plan, ownership, live-action policy, and Upstash limits, and `wireline_computer_tasks` keeps only the goal, a bounded activity log, and the report. Live frames stay in process memory and are never stored.
- **ChatGPT App:** OAuth-connected MCP surface for account-bound private actions and simulations.
- **Webhooks:** signature verification and idempotent handling remain server-side.

## Data and security invariants

- Tenant-owned queries and writes are scoped to the authenticated user.
- Provider credentials are environment variables or server-side secrets.
- Owner-entered cloud-browser text is transmitted only to the currently open website through the isolated browser session; it is not written to BotBound logs, task history, or the model prompt. The owner explicitly starts and ends that control period.
- Billing, webhooks, account deletion, provider callbacks, and connected-tool writes are server-owned workflows.
- Browser/mobile clients may initiate intent but must not own authorization decisions.
- Outbound marketing dials run tenant DNC + federal DNC (when configured) + TCPA consent gates before PSTN spend.
- CSP policy checks, authorization checks, product-doc checks, and functional tests remain in the full verification path.
- Supabase Auth advisor findings must not be represented as BotBound auth blockers unless BotBound adopts Supabase Auth. BotBound's custom password and HIBP controls remain the authoritative launch gate.

## Source-of-truth discipline

| Concern                                       | Canonical source                                                                                      |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Product language                              | `src/lib/product-copy.ts`, `docs/README.md`                                                           |
| Pricing                                       | `docs/business-usage-pricing-decision.md`, `src/lib/plan-catalog.ts`                                  |
| Runtime Balance (Conversation Balance module) | `src/lib/conversation-balance.ts`                                                                     |
| Design                                        | `design-tokens/wireline.tokens.json`, `src/constants/brand-colors.ts`, `src/styles/design-system.css` |
| Models                                        | `src/lib/ai-models.ts`                                                                                |
| Retired presenter compatibility               | `docs/PRODUCT_SHOWCASE_MATRIX.md`, `src/lib/video-presenter/copy.ts`                                  |
| Repo hygiene                                  | `CODEBASE_HEALTH.md`                                                                                  |

## Verification

- `npm run verify` — design, source-control hygiene, route registry, docs index, OpenAPI, design-token parity, Stripe catalog contract, production build, and bundled-server import smoke.
- `npm run verify:full` — type check, a second audit-modules-scoped type check, server lint, ESLint, everything in `verify`, plus authorization coverage, server bootstrap, tsconfig-exclude hygiene, CSP policy consistency, runtime policy, API error shape, `npm audit`, tests, and the browser-extension packaging check.
- `npm run verify:contracts` — product voice, metadata, static metadata, and event taxonomy contracts.
- `node apps/browser-extension/scripts/build.mjs --check` — browser extension packaging and policy check.
- `GET /api/health` — public production health probe.
