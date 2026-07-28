# Wireline Database Operations

This root path is retained for legacy links and development-tool discovery. The canonical, maintained runbook is [docs/DATABASE_OPERATIONS.md](./docs/DATABASE_OPERATIONS.md).

## Required operating posture

- Treat the connected Supabase PostgreSQL database as shared production infrastructure.
- Run `npm run db:health` before schema or migration work.
- For any shared environment, never use `db:push` or run migrations blindly.
- Commit append-only migrations and validate the exact branch head before production application.
- Wireline tenant isolation uses `SET LOCAL ROLE wireline_server` plus the transaction-local `app.current_user_id` GUC. It does not use Supabase Auth or `auth.uid()`.
- Every tenant table requires reviewed grants, RLS, account-deletion behavior, authorization coverage, and rollback handling.

For current schema definitions, inspect `src/db/schema.ts` and `drizzle/migrations/`. Do not rely on static table counts, copied advisor output, or historical SQL snippets in old reviews.
