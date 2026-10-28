# Project: BotBound Launch Readiness

## Architecture
- **Backend**: Express 4 server (`server.ts`, `src/routes/`), WebSocket media streams (`ws`), background voice worker (`src/entrypoints/voice-worker.ts`), and Drizzle ORM on Supabase PostgreSQL.
- **Frontend**: React 19 + Vite 6 (`src/App.tsx`, `src/routes/AppRoutes.tsx`), Tailwind v4, Radix UI primitives, resizable panels (`WorkspaceResizablePanel`), unified Studio/Phone/Inbox/Computer workbench.
- **Voice & SMS Stack**: Twilio Voice (OpenAI Realtime SIP, xAI SIP failover, WebSocket media streams, ElevenLabs/Cartesia cloning) and Twilio SMS (Advanced Opt-Out, TCPA compliance, idempotent outbound sending, Toll-Free SMS verification).
- **Email & Automation Stack**: Resend transactional email (9 templates, Svix feedback webhook, bounce suppression), AgentMail bot mailboxes (`bots.botbound.app`, IMAP/SMTP, Svix webhooks), and Cloud Computer (Playwright over Browserbase WebSocket, SSRF network guard, owner takeover, agent tool loop).
- **Design System**: BotBound Design System: warm parchment light canvas (`#F7F7F3`), obsidian dark canvas (`#0A0A0E`), electric violet (`#A78BFA`), platinum wire accents (`#C7CCD6`), Inter Tight / Inter / IBM Plex Mono typography.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Twilio Inbound Voice & Webhooks | Inbound PSTN call bridging via SIP to OpenAI/xAI Realtime with HMAC authentication | M4 | survey |
| 2 | Twilio Outbound Voice Calling | Outbound call dispatch with AMD machine detection and TCPA compliance | M4 | survey |
| 3 | OpenAI Realtime SIP Bridging | Direct SIP URI trunking (`proj_...` at `sip.api.openai.com`) with TLS | M4 | survey |
| 4 | xAI Realtime SIP & Dial Failover | xAI voice with 10s connect timeout failover to OpenAI | M4 | survey |
| 5 | Twilio Media Streams & Cloned Voice | WebSocket media bridge (`/media/stream`) with ElevenLabs & Cartesia audio | M4 | survey |
| 6 | Twilio Inbound & Outbound SMS | Idempotent SMS replies, rate limit retry, and status callbacks | M4 | survey |
| 7 | Twilio Advanced Opt-Out & DNC | Carrier keyword handling (`STOP`/`START`/`HELP`) with PostgreSQL advisory locks | M4 | survey |
| 8 | Twilio Trust Hub Profile for EIN 43-2610447 | Trust Hub Customer Profile registration script, payload, and entity mapping | M1 | survey |
| 9 | Twilio Toll-Free SMS Verification for EIN 43-2610447 | Toll-Free profile registration payload, script, and webhook callback status tracking | M1 | survey |
| 10 | Voice/SMS Test Mock Hygiene | Fix `tests/openai-sip-long-call-behavior.test.ts` and `src/lib/twilio-webhook-auth.test.ts` | M1 | survey |
| 11 | Resend Outbound Transactional Email | 9 production email templates with suppression checks and retry logic | M2 | survey |
| 12 | Resend Delivery Feedback Receiver | Raw-body Svix webhook with permanent vs transient bounce classification | M2 | survey |
| 13 | AgentMail Managed Mailbox Provisioning | Managed bot mailboxes with deterministic client_id, metadata, and domain check | M2 | survey |
| 14 | AgentMail Inbound/Outbound Threading | Inbound Svix webhook processing, RFC 2822 threading headers, SMTP replies | M2 | survey |
| 15 | Cloud Computer Browserbase Sandboxing | Remote Playwright session with c-ares DNS check, SSRF protection, Worker isolation | M2 | survey |
| 16 | Cloud Computer Frame Streaming & Takeover | In-memory JPEG frames (`/tasks/:taskId/frame`) and interactive owner control | M2 | survey |
| 17 | Cloud Computer Messaging Intertwining | 4 agent tools (`start`, `check`, `reply`, `stop`) wired into Voice, SMS, Email | M2 | survey |
| 18 | Design System Tokens & Typography | Inter Tight, Inter, IBM Plex Mono, warm parchment & obsidian canvas tokens | M3 | survey |
| 19 | Workspace Shell & Workbench UX | Resizable desktop rail, `Cmd+K` command palette, keyboard navigation | M3 | survey |
| 20 | Workspace Aesthetic Unification | ChatGPT, Claude, Cursor, Antigravity visual polish across all views | M3 | survey |
| 21 | Dual Track E2E Test Suite | Comprehensive opaque-box test runner covering Tiers 1-4 requirements | E2E_TRACK | survey |
| 22 | Full Repository Automated Verification | Vitest test suites, zero regressions, type-check and production build clean | M4 | survey |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Carrier Compliance & Toll-Free Verification | Twilio Trust Hub & Toll-Free profile registration for EIN 43-2610447, verification webhook status handler, and test mock divergence fixes | none | IN_PROGRESS |
| M2 | Email & Cloud Computer Automation | Outbound transactional Resend delivery, AgentMail mailbox provisioning & thread sync, Cloud Computer Browserbase execution & messaging intertwining | none | DONE |
| M3 | Design System Polish & Workspace Experience | Unified typography, palette, spacing, clean minimal copy, and visual polish across all views (ChatGPT, Claude, Antigravity, Cursor aesthetic) | none | DONE |
| E2E | E2E Testing Suite Track | Independent requirement-driven opaque-box E2E test suite (Tiers 1-4) publishing TEST_READY.md | none | DONE |
| M4 | Final E2E Pass & Hardening | 100% pass of E2E test suite (Tiers 1-4), adversarial coverage hardening (Tier 5), Vitest suite run, type-check & production build | M1, M2, M3, E2E | PLANNED |

## Interface Contracts
### Carrier Compliance ↔ Twilio Services
- `scripts/submit-twilio-tollfree-verification.mjs`:
  - Input: `--dry-run` or `--apply`, `--phone-number <E.164>`, `--business-name "BotBound"`, `--ein "43-2610447"`, `--website "https://botbound.app"`
  - Output: JSON receipt with `tollfree_verification_sid` (`HH...`), `bundle_sid` (`BU...`), and status `PENDING`
- Webhook `POST /api/twilio-webhook/tollfree-verification-status`:
  - Request: Twilio signature verified, payload with `VerificationSid`, `Status`, `CustomerProfileSid`
  - Action: Update database verification state

### Email Services ↔ Agent Automation
- `sendTenantEmail(options)`: evaluated against `liveExternalActionPolicyForUser`
- `sendAgentMail(options)`: SMTP over SSL with `In-Reply-To` and `References` headers
- `processVerifiedAgentMailWebhook(accountId, body)`: inserts to `wireline_email_threads` / `wireline_email_messages`, triggers `email.received`

### Cloud Computer ↔ Agent Tool Dispatch
- Tools: `start_computer_task`, `check_computer_task`, `reply_computer_task`, `stop_computer_task`
- Dispatch: `dispatchAgentToolCall` -> proxy via `worker-client.ts` if running on voice worker -> executed by `TaskRunner` with Browserbase connection.

## Code Layout
- `src/routes/`: API endpoint definitions and Express route handlers
- `src/lib/`: Core backend domain logic, service clients, compliance checks
- `src/lib/voice/`: Twilio Voice, SIP bridging, media streams, AMD, recording
- `src/lib/cloud-computer/`: Browserbase Playwright sessions, network guard, task runner, agent loop
- `src/db/`: Drizzle schemas, migrations, tenant isolation policies
- `src/components/`: React component library (atoms, molecules, studio, phone, inbox, settings)
- `src/pages/`: Top-level view routes (Studio, Phone, Inbox, Computer, Settings, etc.)
- `src/styles/`: Design tokens, cascading stylesheets, responsive viewports
- `scripts/`: Operational tools, verification scripts, readiness checks
- `tests/`: Automated Vitest test suites, contract tests, security tests
