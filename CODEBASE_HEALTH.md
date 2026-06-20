# Codebase Health

## Active product boundary

Wireline's authenticated product starts at `/agents`.

- Agent Studio creates a draft agent, saves instructions against the selected agent, and starts approved integration connections.
- Historic dashboard, operations, command-center, chat, and manager URLs redirect into Agent Studio.
- Active product source: `src/pages/AgentStudioHome.tsx`, `src/routes/AppRoutes.tsx`, `src/components/layout/AppShell.tsx`, `src/index.css`, and `src/styles/foundation.css`.
- The authenticated app does not mount account-switching or branding providers. Those old providers were producing unnecessary account/settings fetches from every active session.

## Guardrails

- Do not add visual contracts, screenshot baselines, token aliases, hotfix sheets, AI-session artifacts, or tracked QA output.
- Do not reintroduce automatic phone-number provisioning at agent creation. A Studio agent begins as a draft.
- Keep tenant reads/writes scoped to the authenticated user. Keep auth, authorization, billing, webhooks, rate limits, and CSP policy checks intact.

## Database posture

- Wireline uses the server Postgres connection and does not use `supabase-js` from the browser.
- Migration `0045_lockdown_public_supabase_grants.sql` revokes public `anon` and `authenticated` role grants from public tables, sequences, and functions, and changes default privileges so future objects remain server-only.
- RLS-without-policy notices on server-only tables are fail-closed after grants are revoked; do not create permissive policies merely to silence a linter.
- Supabase still reports leaked-password protection disabled. Enable it in Supabase Auth settings before public launch.

## Verification

- `npm run verify` — production build and bundled-server import smoke.
- `npm run verify:full` — type check, authorization coverage, CSP policy, docs/pricing, tests, build, and smoke.
- `GET /api/health` — production health probe.
- Review Vercel runtime errors after each deployment; a broken legacy account route was found from this pass and corrected.
