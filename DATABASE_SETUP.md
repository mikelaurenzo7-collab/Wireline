# Wireline Database Operations

This root path is retained for legacy links and development-tool discovery. The canonical maintained runbook is [docs/DATABASE_OPERATIONS.md](./docs/DATABASE_OPERATIONS.md).

## Required operating posture

- Treat every connected Supabase PostgreSQL database as shared infrastructure unless it is explicitly disposable.
- Never use `db:push` against Preview, Production, or the shared development database.
- Use append-only, idempotent Drizzle migrations and verify physical database state after application.
- Wireline tenant isolation uses `SET LOCAL ROLE wireline_server` and transaction-local `app.current_user_id`; it does not use Supabase Auth or `auth.uid()`.
- Review RLS, grants, account-deletion behavior, rollback, and valid/invalid transaction probes for every schema change.

Inspect `src/db/schema.ts`, `drizzle/migrations/`, and the canonical runbook before database work.
