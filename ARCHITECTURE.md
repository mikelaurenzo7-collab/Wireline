# BotBound Architecture

BotBound is one Bot product and workspace. Public pages showcase inbound and outbound
calls, SMS, email, and Computer, including sales and customer-service workflows.
Executing a workflow still requires its applicable entitlement, verified sender,
recipient permission, funding, screening and provider readiness. Public positioning
does not certify those gates; reviewed service calls and marketing calls retain
distinct runtime controls. Its technical operating loop is **Create -> Train -> Wire -> Run**.
Public messaging leads with concrete Bot capabilities, outcomes, and signup rather than a setup-step list.

A customer configures a Bot with durable knowledge and policy, connects it to numbers and tools, then runs work through Studio. After create, customers see **Train -> Rehearse -> Launch**. Calls, texts, follow-up, approvals, handoffs, transcripts, and outcomes remain available for optional review and later refinements. Ongoing review is not an additional setup step.

## Product boundary

1. A person creates a focused Bot.
2. They train the Bot with instructions, knowledge, tone, voice, escalation policy, and workflow behavior.
3. They wire calendars, email, contacts, CRM, numbers, billing, routing, approvals, and other launch controls when useful.
4. Calling, SMS, email, Computer, and connected-client execution use the saved Bot profile. Each channel retains its own activation and execution gates.
5. Live talking-head video is retired. Compatibility presenter code may support identity badges and fail-closed legacy webhooks, but it must not mint sessions or create a separate product surface.
6. Outcomes feed review, coaching, analytics, and retraining.

Historic workspace URLs should redirect into the active Bot workflow rather than maintaining parallel management surfaces.

## Conversation workspace

Start with one Bot. Additional customer-facing Bots represent separate identities, roles, numbers, or inboxes under the existing plan capacity rules. The left rail selects the Bot; its conversation header opens Phone, Email, Knowledge, Memory, Computer, Automations, and Setup. No dedicated roster-management page is required for everyday work.

Private messages and the selected Bot's computer task records share one chronological canvas. Message and Computer task are explicit composer choices with separate retained drafts; changing modes never starts work. The private planner receives the three most recent task summaries as bounded reference data. Rehearsal remains separate from live work.

Owner-managed memory uses `wireline_agent_lessons.source = 'owner_memory'`. Only the authenticated owner can save or forget notes through `/api/agents/:id/workspace/memory`; writes lock the owned Bot row, cap at 20 notes of 500 characters, and repeated identical saves are idempotent. Reads and deletes filter owner, Bot, and source. These notes are loaded into private chat and new computer tasks, excluded from learning review/digests and fleet activity, and never added to customer-facing knowledge or voice/email prompts. Bot deletion cascades; account export/deletion retain their existing lesson-table coverage. Forgetting a note does not remove copies already present in chat or task history.

Computer tasks may delegate up to two bounded analysis, drafting, or planning requests to internal text-only specialists. Each call uses the existing spend reservation and usage settlement, no tools or browser, no separate Bot row or identity, and no independent authority to act. Spend failures terminate the task through the existing runner. Stop and owner takeover are checked before and after helper work; takeover discards the stale result and plan.

Automations links to the existing account-level post-call output and daily/weekly report controls. A general per-Bot recurring computer-task scheduler is not implemented. It requires durable schedule/occurrence records, idempotent task admission, pause/delete fencing, timezone handling, quota enforcement, and isolated database/worker certification before activation.

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

The visual layer is intentionally restrained: the BotBound Design System uses a warm light canvas, neutral surfaces, violet actions, generous space, and accessible focus states. Warm light is the first-visit appearance; saved light, dark, or system preferences take precedence. Both appearances share one component and interaction system. Titles and controls use Title Case or uppercase; generated conversation prose remains naturally cased.

## Core API flow

### Bot creation

`POST /api/agents`

- Requires an authenticated user.
- Enforces account entitlement and agent-cap rules.
- Creates a Bot and starting personality in one transaction.
- Records an audit event and invalidates account caches.
- Queues durable identity setup after the Bot record commits. Unpaid draft accounts allocate no live identity. BotBound Personal is a paid plan with a number and connected existing inbox; historical Free Builder labels and compatibility plan slugs do not grant paid entitlements. Paid channel entitlements independently authorize the customer-selected number and/or managed mailbox; Email-only has no carrier dependency, and Calls-only has no mailbox dependency. SMS activation also requires carrier readiness. Connected-client drafts remain private until explicitly activated in BotBound. Private microphone rehearsal and workflow review still precede customer traffic; a real-call test can execute enabled live actions.

### Bot training

Training endpoints extract clear user instructions into durable Bot configuration.

- Require an authenticated user and an owned agent ID.
- Convert instructions, files, and source material into directives, knowledge, personality, and tool configuration.
- Persist extracted configuration against the selected Bot.
- Return human-readable confirmation for the Studio conversation.

### Wiring and integrations

OAuth, CRM, telephony, billing, and connected-tool endpoints own authorization, callback validation, and provider-specific state. Studio reads connection state and sends users into the relevant connection flow; provider secrets never belong in browser state.

Customer email uses each customer's verified business identity and signature.
Customer-owned domains require their own setup and DNS verification; a managed
mailbox allocation is a separate fact from a verified customer-owned domain.

### Runtime execution

Runtime execution reads the saved Bot profile, selected model/voice posture, connected tools, balance/entitlement state, and provider configuration. Calls, texts, follow-up, approvals, and handoffs must emit durable events and remain tenant-scoped.

## Runtime services

- **Auth and authorization:** BotBound-owned session middleware, scrypt password hashes, HIBP k-anonymous password screening, and user-scoped ownership checks. Supabase Auth is not the authentication authority.
- **Launch readiness API:** the launch-readiness health endpoint is protected by a server-owned monitor credential rather than tenant session authentication; it exposes capability levels for operational monitors.
- **Database:** Drizzle schema and migrations in `src/db` and `drizzle/migrations`, hosted on Supabase Postgres.
- **Billing:** Stripe-backed entitlements, plan catalog, Runtime Balance (Conversation Balance API/module path retained), checkout, portal, webhooks, and ledger-style reconciliation stay server-owned.
- **Voice and telephony:**
  - Authenticated browser rehearsals use OpenAI Realtime (`gpt-realtime-2.1`). Stock telephone calls default to xAI voice (`grok-voice-3.0`) on registered numbers (`src/lib/voice/xai-voice-config.ts`, `wireline_xai_phone_registrations`); unregistered numbers use OpenAI. `WIRELINE_PHONE_VOICE_PROVIDER=openai` explicitly selects OpenAI for stock calls. Eligible inbound xAI calls can recover through OpenAI during the same phone call; outbound and owner-test calls do not use that recovery path. Founder-owned internal Bot profiles and customer Bots share the same runtime authority, with provider identity recorded per call and updated on recovery.
  - Customers can choose any of the 10 built-in voices: Alloy, Ash, Ballad, Coral, Echo, Sage, Shimmer, Verse, Marin, or Cedar. The saved voice is fixed for an active session and may be changed between sessions. Authenticated Studio rehearsals resolve the saved OpenAI voice; when phone calls run on xAI, the saved choice maps to the closest xAI voice, the voice picker names that phone voice, and a play button speaks a short sample in it (`src/lib/voice/voice-sample.ts`).
  - Twilio owns numbers, PSTN transport, signed voice/SMS callbacks, opt-out enforcement, delivery callbacks, and the two-way messaging inbox. Signed TwiML webhooks select the registered xAI or OpenAI SIP bridge for stock calls. ElevenLabs cloned calls instead use a signed Twilio Media Stream to the voice worker, OpenAI Realtime for input and reasoning, ElevenLabs for speech, and OpenAI stock speech for recovery. Model completion and usage survive playback interruption; playback marks establish what the caller actually heard.
  - OpenAI signs `realtime.call.incoming` at `/api/webhooks/openai/realtime`; BotBound accepts the call with the selected Bot runtime and maintains the server-side sideband tool session.
  - The public Render API webhook verifies and forwards the untouched signed event to a separate persistent Node 22 worker. The worker verifies both service authentication and the original provider signature before admission; it owns the sideband WebSocket, tools, rolling spend estimate and terminal persistence. Full telephone conversations default to 60 minutes; private rehearsals remain five minutes. Web and worker ship from the same reviewed source and require separate deployment verification and graceful worker drain. See `docs/OPENAI_REALTIME_VOICE.md` and `docs/DEPLOYMENT_RUNBOOK.md`.
  - Authenticated Studio rehearsals and hosted ChatGPT/MCP private simulations use server-mediated OpenAI Realtime WebRTC. Public and guest audio/call demos are retired. The server exchanges SDP and returns only a session-bound answer; provider credentials never reach the browser.
  - Customer live cloning uses the separate `wireline_live_voices` registry and requires `LIVE_VOICE_CLONE_ENABLED=true`, provider configuration, current consent, and a ready, unexpired voice owned by the Bot's account. Credentials alone do not enable cloning. Studio readiness distinguishes a saved voice from verified phone playback. Revocation disables local use before provider cleanup. The older voice-reference pilot retains its separate encrypted upload, review, and private-preview controls (`docs/VOICE_CLONING_PILOT.md`, `src/lib/voice/voice-asset-service.ts`); those assets do not assign live voices. Retention cleanup runs even when creation and use are disabled.
- **LLM / structured reasoning:**
  - Central policy and catalog: `src/lib/ai-models.ts`.
  - Primary: direct xAI Responses API using `grok-4.7` by default (`WIRELINE_XAI_STRUCTURED_MODEL` overrides). Backup: direct OpenAI Responses API using GPT-5.6 Terra (`WIRELINE_OPENAI_STRUCTURED_MODEL` overrides). Gemini is retired; its ids remain only to price historical audit rows. The legacy Vercel deployment may still use AI Gateway as a final lane; Render disables that transport.
  - Every Bot and call direction shares this same managed chain; roles and use cases change configuration, not the provider default or product mode. Customer surfaces show BotBound tier names, never vendor model ids.
  - Each Bot also has a meaning-based knowledge index (`src/lib/knowledge-index.ts`, `src/lib/knowledge-index-search.ts`): the jobs sweep compiles the Bot's rules and facts into one document and indexes it with xAI (`XAI_API_KEY` plus `XAI_MANAGEMENT_API_KEY`); knowledge search merges up to three meaning matches beside keyword matches and degrades to keyword-only when the index is unavailable. The index is deleted with the Bot's account.
  - Live public research runs Perplexity first when configured, otherwise the primary provider's built-in web search (`src/lib/live-web-research.ts`).
  - Live-call voice is owned by the call's voice provider; structured continuity never changes the selected speaker.
- **Video presenters:** Live talking-head video is retired. `src/lib/video-presenter/` remains compatibility infrastructure for identity badges and fail-closed legacy paths; customer surfaces must not offer presenter checkout or session minting.
- **Browser extension:** BotBound Command only sends active page context by explicit user action. No broad host permissions, background harvesting, token storage, or silent browsing collection.
- **Cloud computer:** `/computer` gives each Bot owner-assigned web tasks in an isolated hosted browser. The owner can view the live screen and activity, take direct control during a handoff, then return the browser to the Bot. `src/lib/cloud-computer/` uses the shared `OPENAI_API_KEY` with the OpenAI Responses computer tool and an isolated hosted browser reached by `CLOUD_COMPUTER_BROWSER_WS_URL` (wss in production; local Chromium is development-only). Every request is DNS-checked to public addresses; Bot scripts, uploads, downloads, console, and network reads are disabled. Owner-only browser tools add real tabs/navigation, bounded private history, cookie import/clear, explicit origin-bound session-login save/fill, screenshots, and bounded download retrieval. Browser data and files are ephemeral, never task-ledger or model content. Persistent passwords and extension installation require additional provider/storage isolation; see [Computer browser capabilities](docs/CLOUD_COMPUTER_BROWSER.md). The Bot never types passwords or payment details; direct owner-entered browser text stays in memory for redaction, is not stored in task history or sent as separate text to the model, and is masked from the screen shared with OpenAI after hand-back. Each model turn reserves and settles against the account's AI allowance (`computer.browse`), tasks require a paid plan, ownership, live-action policy, and Upstash limits, and `wireline_computer_tasks` keeps only the goal, a bounded activity log, and the report. Live frames stay in process memory and are never stored.
- **ChatGPT App:** OAuth-connected MCP surface for account-bound private actions and simulations.
- **Webhooks:** signature verification and idempotent handling remain server-side.

## Data and security invariants

- Tenant-owned queries and writes are scoped to the authenticated user.
- Provider credentials are environment variables or server-side secrets.
- Owner-entered cloud-browser text is transmitted only to the currently open website through the isolated browser session; it is not written to BotBound logs, task history, or the model prompt. The owner explicitly starts and ends that control period.
- Owners can request Computer control while a task is running. The executor finishes its in-flight step before publishing an owner checkpoint; Stop takes precedence. Returning control supplies a masked current screen and discards unexecuted actions from the earlier plan. The existing task deadline, owner-wait budget and metering still apply.
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
