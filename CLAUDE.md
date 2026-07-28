# CLAUDE.md

This file provides Claude Code with repository-specific context that is useful at tool startup. Durable product, architecture, contribution, database, deployment, and documentation doctrine lives in `README.md`, `ARCHITECTURE.md`, `CONTRIBUTING.md`, `docs/DATABASE_OPERATIONS.md`, `docs/DEPLOYMENT_RUNBOOK.md`, and `docs/README.md`.

## Development model

- `npm run dev` starts the single Express + Vite development service on `http://localhost:3000`.
- `server.ts` is the canonical local, bundled, and Vercel entrypoint.
- `src/server/register-api-routes.ts` is the explicit API route registry; a route file is not live merely because it exists.
- `src/routes/` owns HTTP handlers. `src/lib/` owns server-side domain and provider logic. `src/db/schema.ts` is the Drizzle schema source.
- Browser extension and native clients are thin surfaces. Provider credentials, prompts, tenant enforcement, billing, and compliance gates remain server-owned.

## Shared database

The connected Supabase PostgreSQL database is shared infrastructure.

- Run `npm run db:health` before database work.
- Do not use `db:push` or apply migrations blindly.
- Tenant-scoped work runs through `tenantStore` with `SET LOCAL ROLE wireline_server` and the transaction-local `app.current_user_id` GUC.
- New tables require explicit grants, RLS, account-deletion behavior, authorization coverage, and an append-only migration.
- Follow `docs/DATABASE_OPERATIONS.md`; do not infer live state from an old audit or migration filename.

## Verification

Run focused checks while iterating and heavy checks sequentially.

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

Use `npm run verify:full` before merge for release-impacting work. GitHub Actions startup failures caused by the repository billing limit are infrastructure noise, not application proof; require exact-head Vercel, CodeRabbit, command-level evidence, and production verification as defined in `docs/DEPLOYMENT_RUNBOOK.md`.

## Repository conventions

- Many regression gates are source-reading contract tests. When an invariant is textual or structural, add or update the focused contract that reads the owning file.
- Keep one source of truth. Do not add duplicate runbooks, migration wrappers, provider catalogs, design systems, or branch-summary documents.
- Every durable Markdown file under `docs/` belongs in exactly one documentation index. Any intentional Markdown outside `docs/` must be linked and classified in `docs/README.md`.
- Never commit generated outputs, screenshots, environment exports, credentials, production data, or local agent artifacts.
