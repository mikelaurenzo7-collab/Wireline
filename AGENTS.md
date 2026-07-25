# AGENTS.md

## Cursor Cloud specific instructions

This section captures durable, non-obvious context for running the Wireline dev
environment in Cursor Cloud. Standard commands live in `README.md`,
`package.json` scripts, `ARCHITECTURE.md`, and `DATABASE_SETUP.md` — refer to
those rather than duplicating them here.

### Services

There is a single dev service: one Node process (`npm run dev` → `tsx server.ts`)
that runs Express + the API on port `3000` and embeds Vite (HMR) in middleware
mode on the same port. Open `http://localhost:3000`. The browser extension
(`apps/browser-extension`) and native apps (`ios/`, `android/`) are separate
surfaces and are not needed for core web/API development.

### Environment variables

- Core secrets needed for the authenticated product loop (signup + create agent):
  `POSTGRES_URL`, `INTERNAL_JWT_SECRET`, and at least one AI key
  (`XAI_API_KEY` (primary) / `OPENAI_API_KEY` / `GEMINI_API_KEY` /
  `AI_GATEWAY_API_KEY`). These are provided as Cursor secrets and are present
  in the process environment.
- The full set of 150+ integration vars (Stripe, Vapi, Twilio, OAuth, Resend,
  etc. — see `.env.example` for the canonical list) lives in the Vercel
  project. Pull them into a local `.env` with:
  `npx vercel env pull .env --environment=development --yes --token="$VERCEL_TOKEN"`
  This is only needed for exercising those specific integrations — the server
  boots and the core signup/agent flow works without them.
- Precedence gotcha: `server.ts` loads `dotenv/config`, which does NOT override
  variables already set in the process environment. So Cursor-injected secrets
  (e.g. `POSTGRES_URL`, `INTERNAL_JWT_SECRET`) win over any value in `.env`.
- The dev server never throws on missing env (`src/lib/startup.ts`); unconfigured
  features return actionable `503` JSON at request time instead of crashing.
- **Federal DNC scrub (outbound):** set `FEDERAL_DNC_API_URL` + `FEDERAL_DNC_API_KEY`
  (real DNCScrub `loginId`, not a Vercel token) before marketing outbound. Unconfigured
  vendor **blocks** marketing/campaign dials fail-closed; non-marketing Studio dials
  still use tenant DNC + TCPA.

### Database (important, non-obvious)

- The database is a shared, already-provisioned Supabase Postgres — treat it as
  live/shared data. It is already migrated (do NOT run `db:push`/`db:migrate`
  blindly against it). Verify state read-only with `npm run db:health`.
- Schema is largely managed out-of-band via Supabase (MCP/manual). The Drizzle
  migration journal (`drizzle.__drizzle_migrations`) is NOT authoritative — it
  only records a subset of migrations even though the physical schema is ahead.
- Tenant isolation uses `SET LOCAL ROLE wireline_server` + the
  `app.current_user_id` GUC (not Supabase Auth / `auth.uid()`); see
  `src/lib/server-context.ts` and `DATABASE_SETUP.md`.
- Migration `drizzle/migrations/0082_phone_voice_routing.sql` correctly targets
  `wireline_agents`, and the current shared database already has
  `phone_voice_id` + `phone_voice_provider`. Do not apply manual ALTER statements
  unless a read-only schema check proves those columns are missing.

### Verifying the environment

- Run lint/typecheck (`npm run lint`, `npm run lint:eslint`), tests
  (`npm run test:run`), build (`npm run build`), and server smoke
  (`npm run smoke:server`) sequentially for a complete local verification pass.
- GitHub Actions may fail to start or return no jobs when the repository/account
  Actions spending limit is exhausted. Treat that as billing infrastructure,
  not a code failure; use the command-level results plus the Vercel build status.
- Resource note: `npm run lint` (full `tsc`) is memory-heavy. Avoid running it
  concurrently with `build` + `test` + the dev server — under memory pressure the
  typecheck/eslint processes can be OOM-killed (they exit with no output). Run the
  heavy checks sequentially if you see silent failures.
- Hello-world check: sign up at `/signup`, then create an agent via the Studio
  "New agent" flow (`/studio?create=1`). A new user's free plan caps at 1 agent,
  so `POST /api/agents` returns a `402` capacity error once one exists — that is
  expected business logic, not a failure.
