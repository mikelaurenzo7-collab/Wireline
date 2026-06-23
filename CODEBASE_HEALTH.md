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

## Deletion & Cleanup Rules (New — Ametrine Precision Era)

- **No thin re-export wrappers**: Any file whose sole purpose is `export { default } from "./*-v2"` or similar re-exports of migration artifacts must be deleted. Migration debt of this form is forbidden.
- **Legacy path handling**: Old redirect components or routes for retired surfaces (e.g., Director workspace, old /activity paths) must be removed once the new surface is stable. Use 410 Gone responses only when necessary for external clients.
- **Admin-migrate scripts**: These are historical one-time migration tools. Do not delete individual migration files unless they are confirmed obsolete and have no audit value. Prefer moving completed migrations to an `archive/migrations/` folder if they clutter the active routes.
- **Module size discipline**: No new file should exceed ~15-20k lines without a clear plan to split. Existing large monoliths (AgentFlowComposer, StudioWorkspaceV2, AgentBusinessProfile, AgentTraining, heavy billing and vapi files) must be progressively split by responsibility.
- **Ametrine Precision supremacy**: All new styling, tokens, class names, and visual components must derive from the single source of truth in `src/constants/brand-colors.ts` and `src/styles/design-system.css`. No new "signal", legacy purple, or ad-hoc color tokens.
- **Stale artifacts**: Generated files (test-results, screens_list.json from visual QA) belong in .gitignore or CI cleanup, not committed long-term.

## Verification

- `npm run verify` — production build and bundled-server import smoke.
- `npm run verify:full` — type check, authorization coverage, CSP policy, docs/pricing, tests, build, and smoke.
- `GET /api/health` — production health probe.
- Review Vercel runtime errors after each deployment; a broken legacy account route was found from this pass and corrected.

## Recent Health Actions (Ametrine Precision Standardization)

- Deleted all identified thin v1/v2 re-export wrappers (server.ts, agent-routes.ts, qa-routes.ts).
- Purged LegacyRedirects.tsx and retired Director workspace redirect logic.
- Deprecated legacy "signal blue" branding entirely in favor of Ametrine Precision as single source of truth.
- Initiated aggressive split plan for largest monolithic files.
- Full scan of admin-migrate confirmed as intentional historical tools (kept with guardrail note).
