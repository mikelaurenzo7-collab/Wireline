# Codebase Health

## Active product boundary

Wireline's authenticated product starts at `/agents` and follows the Create → Train → Run model.

- Create Agent is short intake only: name, role, voice, personality, and starting brief.
- Training is the first-class detailed configuration surface for documents, sources, behavior, voice, policies, and evaluation.
- Run/Studio is chat-first execution for agent work, approvals, calls, texts, follow-up, and handoff.
- Historic dashboard, operations, command-center, chat, and manager URLs must either redirect into the current product model or be explicitly retired.
- Active product source: `src/pages/AgentStudioHome.tsx`, `src/routes/AppRoutes.tsx`, `src/components/WorkspaceShell.tsx`, `src/index.css`, `src/styles/foundation.css`, and `src/styles/design-system.css`.
- The authenticated app does not mount account-switching or branding providers unless a current route explicitly needs them. Old providers were producing unnecessary account/settings fetches from every active session.

## Guardrails

- Do not add visual contracts, screenshot baselines, token aliases, hotfix sheets, AI-session artifacts, or tracked QA output.
- Do not reintroduce automatic phone-number provisioning at agent creation. An agent begins as a draft, then gets trained and wired deliberately.
- Keep tenant reads/writes scoped to the authenticated user. Keep auth, authorization, billing, webhooks, rate limits, and CSP policy checks intact.
- Keep browser extension behavior explicit-user-action only: no broad host permissions, no page harvesting, no token storage, no silent browsing activity collection.

## Database posture

- Wireline uses the server Postgres connection and does not use `supabase-js` from the browser.
- Migration `0045_lockdown_public_supabase_grants.sql` revokes public `anon` and `authenticated` role grants from public tables, sequences, and functions, and changes default privileges so future objects remain server-only.
- RLS-without-policy notices on server-only tables are fail-closed after grants are revoked; do not create permissive policies merely to silence a linter.
- Supabase still reports leaked-password protection disabled. Enable it in Supabase Auth settings before public launch.

## Deletion & cleanup rules — Wireline Mono era

- **No thin re-export wrappers**: Any file whose sole purpose is `export { default } from "./*-v2"` or similar re-exports of migration artifacts must be deleted. Migration debt of this form is forbidden.
- **Legacy path handling**: Old redirect components or routes for retired surfaces must be removed once the new surface is stable. Use 410 Gone responses only when necessary for external clients.
- **Admin-migrate scripts**: These are historical one-time migration tools. Do not delete individual migration files unless they are confirmed obsolete and have no audit value. Prefer moving completed migrations to an `archive/migrations/` folder if they clutter the active routes.
- **Module size discipline**: No new file should exceed ~15-20k lines without a clear plan to split. Existing large monoliths must be progressively split by responsibility.
- **Wireline Mono supremacy**: All new styling, tokens, class names, and visual components must derive from `design-tokens/wireline.tokens.json`, `src/constants/brand-colors.ts`, `src/constants/generated-design-tokens.ts`, and `src/styles/design-system.css`. Do not reintroduce legacy purple, signal blue, dark Studio themes, mesh/nebula primitives, or ad-hoc color tokens.
- **Agent language**: User-facing surfaces should say Agents, Training, Wire, Studio, calls, texts, and follow-up. Avoid reviving generic assistant/dashboard/operator language unless it is an external API term or internal implementation name.
- **Stale artifacts**: Generated files, local visual QA output, and temporary screenshots belong in `.gitignore` or CI cleanup, not committed long-term.

## Verification

- `npm run verify` — design check, production build, and bundled-server import smoke.
- `npm run verify:full` — type check, design check, authorization coverage, CSP policy, product-doc contracts, tests, build, and smoke.
- `node apps/browser-extension/scripts/build.mjs --check` — browser extension policy and artifact check.
- `GET /api/health` — production health probe.
- Review Vercel runtime errors after each deployment.

## Recent health actions — Wireline Mono standardization

- Replaced the old design contract with `scripts/check-wireline-clear-system.mjs`.
- Moved source tokens, generated CSS, generated TypeScript, browser extension tokens, native Android tokens, iOS tokens, icons, legal pages, and app manifests to Wireline Mono.
- Deleted dead Studio right-rail and nebula visual primitives.
- Added Wireline Command browser-extension command actions and product-doc contracts.
- Added account deletion controls and guarded mobile-browser settings access.
- Continued aggressive split plan for large monolithic files while preserving audit-value migrations.
