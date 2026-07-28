# AGENTS.md

## Cursor Cloud instructions

This file contains only tool-specific, non-obvious context for running Wireline in Cursor Cloud. Product, architecture, repository, database, and deployment doctrine live in `README.md`, `ARCHITECTURE.md`, `CONTRIBUTING.md`, `docs/DATABASE_OPERATIONS.md`, and `docs/DEPLOYMENT_RUNBOOK.md`.

### Services

There is one core development service: `npm run dev` starts a Node process (`tsx server.ts`) that runs Express and embeds Vite HMR on port `3000`. Open `http://localhost:3000`.

The browser extension and native apps are separate client surfaces. They are not required for core web/API development unless the change owns those surfaces.

### Environment variables

- Core authenticated development requires `POSTGRES_URL`, `INTERNAL_JWT_SECRET`, and at least one configured structured-AI route. `.env.example` is the canonical inventory.
- Live provider credentials and production provider configuration are Production-only in Vercel. Preview and Development values must be dedicated sandboxes or unset.
- Pull only Development-scoped variables into a local ignored file when the task requires them:

  ```bash
  npx vercel env pull .env --environment=development --yes --token="$VERCEL_TOKEN"
  ```

- `dotenv/config` does not override variables already present in the process environment. Cursor-injected secrets therefore take precedence over `.env`.
- The server starts in a degraded state when optional environment values are absent. Unconfigured features return actionable errors at request time.
- Federal DNC configuration is intentionally absent until business registration is complete. Marketing/campaign outbound fails closed while it is unavailable.

### Shared database

The connected Supabase Postgres database is shared infrastructure. Treat it as production data.

- Run `npm run db:health` before database work.
- Do not use `db:push` or run migrations blindly.
- Commit append-only migrations and follow `docs/DATABASE_OPERATIONS.md`.
- Tenant isolation uses `SET LOCAL ROLE wireline_server` plus the transaction-local `app.current_user_id` GUC. It does not use Supabase Auth or `auth.uid()`.
- Verify live schema and migration state read-only before applying manual DDL. Any urgent out-of-band application must have the same committed migration and an exact-head green preview.

### Verification

Run heavy checks sequentially; full TypeScript, tests, builds, and a dev server can exceed the available memory when run together.

```bash
npm run source-control:check
npm run docs:check
npm run lint
npm run lint:server
npm run lint:audit-modules
npm run lint:eslint
npm run test:run
npm run build
npm run smoke:server
```

Use `npm run verify:full` before merge for release-impacting work. GitHub Actions may fail to start because of the repository account billing limit; use the exact-head Vercel gate, CodeRabbit, command-level results, and production verification without ignoring any named job that actually ran and found a defect.

### Product smoke

A useful core smoke is sign-up followed by agent creation at `/studio?create=1`. Capacity responses are plan behavior, not necessarily application failures; validate them against `src/lib/plan-catalog.ts` and the current account state.