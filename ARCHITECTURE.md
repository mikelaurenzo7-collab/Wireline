# Wireline Architecture

Wireline is an AI communications product with one core loop: build an agent, train it, run it, and review outcomes.

## Product boundary

The authenticated product begins in Agent Studio.

1. A person creates an agent.
2. They define instructions, knowledge, tone, and workflow behavior.
3. They connect calendars, email, contacts, or CRM services when useful.
4. Voice, messaging, and automation execution use the saved agent profile.
5. Call and message outcomes feed review and training.

Historic workspace URLs redirect into the active agent workflow rather than maintaining parallel management surfaces.

## Frontend

| Concern | Source |
| --- | --- |
| Entry | `src/main.tsx` |
| Routing | `src/App.tsx`, `src/routes/AppRoutes.tsx` |
| Session boundary | `src/components/layout/AppShell.tsx` |
| Agent Studio | `src/pages/AgentStudioHome.tsx` |
| Agent roster | `src/contexts/AgentsContext.tsx` |
| Shared visual system | `src/index.css`, `src/styles/foundation.css` |

The visual layer is intentionally small: warm off-white surfaces, graphite controls, neutral borders, system fonts, and a high readability floor.

## Core API flow

### Agent creation

`POST /api/agents`

- Requires an authenticated user.
- Enforces account entitlement and agent-cap rules.
- Creates an agent and starting personality in one transaction.
- Records an audit event and invalidates account caches.

### Agent training

`POST /api/train/extract`

- Requires an authenticated user and an owned agent ID.
- Converts clear user instructions into directives, knowledge, and personality updates.
- Persists extracted configuration against the selected agent.
- Returns a human-readable confirmation for the Studio conversation.

### Integrations

OAuth and CRM endpoints own authorization and callback validation. Studio reads connection state and sends the user into the relevant connection flow; provider secrets never belong in browser state.

## Runtime services

- **Auth and authorization:** session middleware plus user-scoped ownership checks.
- **Database:** Drizzle schema and migrations in `src/db` and `drizzle/migrations`.
- **Voice:** Twilio/Vapi-backed execution paths configured from saved agent profiles.
- **LLM:** OpenAI is the managed primary; Gemini is the automatic fallback; OpenRouter is explicit only.
- **Billing:** Stripe-backed entitlement checks remain server-side.
- **Webhooks:** signature verification and idempotent handling remain server-side.

## Security invariants

- Tenant-owned queries and writes are scoped to the authenticated user.
- Provider credentials are environment variables.
- Billing, webhooks, and account deletion are server-owned workflows.
- CSP policy checks, authorization checks, and functional tests remain in the full verification path.

## Verification

- `npm run verify` — production build and bundled-server import smoke.
- `npm run verify:full` — type check, authorization coverage, CSP policy consistency, tests, build, and smoke.
- `GET /api/health` — public production health probe.
