# Wireline Architecture

Wireline is an AI call assistant with one authenticated home: **Agent Studio**.

## Product boundary

The product starts at `/agents`.

1. A person creates an agent.
2. They explain what it should do in the Studio conversation.
3. Wireline saves clear instructions, knowledge, and tone updates to that agent.
4. They connect calendars, email, contacts, or CRM services when useful.
5. Voice and messaging execution use the saved agent profile.

Historic workspace URLs redirect to Agent Studio. The active product has no operations dashboard or separate manager workspace.

## Frontend

| Concern | Source |
| --- | --- |
| Entry | `src/main.tsx` |
| Routing | `src/App.tsx`, `src/routes/AppRoutes.tsx` |
| Session boundary | `src/components/layout/AppShell.tsx` |
| Agent Studio | `src/pages/AgentStudioHome.tsx` |
| Agent roster | `src/contexts/AgentsContext.tsx` |
| Tokens and primitives | `src/index.css`, `src/styles/foundation.css` |

The visual layer is deliberately small: warm off-white surfaces, near-black controls, neutral borders, and system fonts. Do not add visual contracts, extra token layers, or override sheets.

## Core API flow

### Agent creation

`POST /api/agents`

- Requires an authenticated user.
- Enforces account entitlement and agent-cap rules.
- Creates the agent and starting personality in one transaction.
- Records an audit event and invalidates account caches.

### Agent instruction conversation

`POST /api/train/extract`

- Requires an authenticated user and an owned agent ID.
- Converts clear user instructions into directives, knowledge, and personality updates.
- Persists the extracted configuration against the selected agent.
- Returns a human-readable confirmation for the Studio conversation.

### Integrations

OAuth and CRM endpoints own authorization and callback validation. Studio reads connection state and points the user to the connection flow; provider secrets never belong in browser state.

## Runtime services

- Auth and authorization: session middleware plus user-scoped ownership checks.
- Database: Drizzle schema and migrations in `src/db` and `drizzle/migrations`.
- Voice: Twilio/Vapi-backed execution paths configured from saved agent profiles.
- LLM work: provider routing and model catalog live in runtime modules.
- Billing: Stripe-backed entitlement checks stay server-side.
- Webhooks: signature verification and idempotent handling stay server-side.

## Security invariants

- Tenant-owned queries and writes must be scoped to the authenticated user.
- Provider credentials remain environment variables.
- Billing, webhooks, and account deletion are server-owned workflows.
- CSP policy checks, authorization coverage checks, and functional tests remain part of the full verification path.

## Verification

- `npm run verify` — production build and bundled-server import smoke.
- `npm run verify:full` — type check, authorization coverage, CSP policy consistency, docs/pricing check, tests, build, and smoke.
- `GET /api/health` — public production health probe.
