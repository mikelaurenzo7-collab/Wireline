# Wireline Database Operations

Status: **Canonical production runbook**

Wireline uses Supabase-hosted PostgreSQL through Drizzle and the transaction pooler. The connected database is shared production infrastructure, not a disposable development database.

## Non-negotiable rules

- Run `npm run db:health` before any schema or migration work.
- Never use `drizzle-kit push` against a shared Wireline database. Wireline intentionally exposes no `db:push` package script.
- Migrations are append-only. Do not edit a migration that may have run outside a disposable local database.
- Preview deployments do not run migrations. Production runs the committed migration journal through `scripts/vercel-build.mjs` unless explicitly disabled for a non-live duplicate project.
- Apply urgent production migrations only after the exact branch head is green, and commit the same migration in the repository before merge.
- Backfill existing rows before adding constraints that assume the backfill.
- Use idempotent DDL when a migration may be replayed safely.
- A new migration is not live because the `.sql` file exists. Add it to `drizzle/migrations/meta/_journal.json` in the same change, or it never runs on the production path.

## The migration journal is not the whole history

`npm run db:migrate` is `drizzle-kit migrate`, and drizzle-kit executes the **journal** (`drizzle/migrations/meta/_journal.json`), not the directory listing. Production runs exactly that, from `scripts/vercel-build.mjs`.

The two are not the same set. 138 `.sql` files are committed; 33 are journalled. The other 105 were applied out of band through the authenticated Supabase migration tool — the urgent path above — and the journal was never back-filled. This includes migrations the application treats as guaranteed, notably `0127_monotonic_session_version`, which installs the `BEFORE UPDATE OF password_hash` trigger that makes session revocation on password change database-owned rather than best-effort application code.

Two consequences to work from, not around:

- **Reading the journal does not tell you what a live database contains, and reading the directory does not either.** Inspect the live schema when it matters, as the verification section below already requires.
- **Do not back-fill the historical backlog to "tidy" the journal.** Those tags would schedule already-applied DDL to replay on the next production build, and much of it is not idempotent. Reconciling any of it needs live verification per migration and its own change.

Numeric prefixes are reused (`0108`, `0118`, `0120` and others each name two unrelated migrations), so a filename does not establish ordering. The journal does, for the migrations it carries.

`tests/migration-journal-integrity-contract.test.ts` pins this: every journalled tag must have a file, everything authored at or above the newest journalled migration must itself be journalled, and the size of the out-of-band backlog is fixed so movement in either direction has to be deliberate.

## Connection selection

The server resolves its database connection through `src/lib/database-connection.ts`. `POSTGRES_URL` is the canonical Supabase connection variable; `DATABASE_POOL_URL` may be used only when it passes the same validation and environment-boundary checks.

Serverless connections use the Supabase transaction pooler. `src/lib/server-context.ts` keeps the pool deliberately small and opens one outer transaction per tenant-scoped checkout so the role and tenant GUC survive transaction-mode pooling. Tenant checkouts and unscoped queue mutations explicitly declare `SET TRANSACTION READ WRITE`; a real replica still fails closed, while a pooled backend cannot break writes by inheriting a leaked session-level read-only default.

Never run `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY` or `SET default_transaction_read_only = on` through a transaction-pool URL. Those settings can persist on a reused backend and make unrelated application writes fail intermittently. Use `BEGIN TRANSACTION READ ONLY` / `SET TRANSACTION READ ONLY` for transaction-scoped safety, or use the direct port-5432 connection for maintenance that genuinely needs session state. See Supabase's current incident guidance: https://supabase.com/docs/guides/troubleshooting/resolving-cannot-execute-update-in-a-read-only-transaction-on-transaction-pooler-connections-ef582c

Never commit connection strings, database passwords, exports, local dumps, or environment mirrors.

## Tenant isolation

Wireline does not use Supabase Auth or `auth.uid()` for application tenant isolation.

For authenticated tenant work, `tenantStore` scopes the checkout and the server runs:

```sql
BEGIN;
SET TRANSACTION READ WRITE;
SET LOCAL ROLE wireline_server;
SELECT set_config('app.current_user_id', '<user uuid>', true);
```

RLS policies read `app.current_user_id`. The role and GUC are transaction-local and disappear before the connection returns to the pool.

Consequences:

1. Every tenant table needs the required privileges for `wireline_server` plus an RLS policy keyed to the tenant identity.
2. Every tenant-scoped route or service must execute inside `tenantStore.run(userId, ...)` before issuing database work.
3. System paths such as sign-in, provider callbacks, and verified webhooks must remain explicitly reviewed because they can run without tenant context.
4. A new table is not launch-ready until grants, RLS, account deletion, audit coverage, and authorization behavior are all addressed.

## Schema-change workflow

1. **Inspect current state**

   ```bash
   npm run db:health
   ```

2. **Change the Drizzle schema and generate or author an append-only migration**

   ```bash
   npm run db:generate
   ```

   Review generated SQL before committing it. Generated output is not automatically correct for backfills, constraint ordering, RLS, grants, or production data.

   `db:generate` diffs `src/db/schema.ts` against the newest `drizzle/migrations/meta/*_snapshot.json` (sorted listing, not the journal). Commit the regenerated snapshot with every journalled migration and keep its numeric index equal to the newest journal `idx` — `tests/migration-journal-integrity-contract.test.ts` pins this. A stale snapshot chain makes the next `db:generate` emit a destructive full-schema diff that the Vercel build's `db:migrate` would execute.

3. **Add integrity coverage**

   Contract-test the migration text when the invariant must never regress. Add behavioral tests when a service or route owns runtime behavior.

4. **Validate the exact branch head**

   Run the relevant focused tests and `npm run verify:full`. Require the exact-head Vercel preview to be READY. Preview logs must state that database migrations were skipped.

5. **Apply through a controlled path**

   - Normal path: squash merge and let the canonical production Vercel deployment run `npm run db:migrate`.
   - Urgent/pre-merge verification path: apply the committed migration through the authenticated Supabase migration tool only after the exact head is green, then run non-destructive transactional probes.

6. **Verify production**

   Re-run `npm run db:health`, inspect the affected object directly, verify row/backfill counts, and check production runtime errors.

## Constraint and trigger standards

Use database enforcement when partial application state would create an entitlement, billing, compliance, or provider-cost risk.

- Prefer foreign keys, unique constraints, check constraints, and deferred constraint triggers over application comments.
- Use `DEFERRABLE INITIALLY DEFERRED` when a valid transaction must create several related rows before commit.
- A `SECURITY DEFINER` function must set a safe `search_path` and revoke `PUBLIC` execution.
- Trigger functions should fail with a specific SQLSTATE and an actionable message.
- Probe both failure and success paths transactionally; verify no test residue remains.

## RLS and privilege verification

After DDL changes, inspect the live policy and privilege state rather than assuming migration text executed as intended.

At minimum verify:

- RLS enabled where tenant or sensitive data exists;
- expected policies reference the correct tenant column and GUC;
- `wireline_server` has only the privileges the application requires;
- `anon` and `authenticated` cannot reach owner-only token, webhook-idempotency, or bridge tables;
- internal trigger functions are not executable by `PUBLIC`;
- account deletion covers the new table.

Supabase advisor output is evidence, not the only source of truth. Confirm the underlying `pg_policies`, privilege, trigger, constraint, and table definitions when an advisor result is stale or ambiguous.

## Read-only pool contamination recovery

When writes fail with `cannot execute ... in a read-only transaction` but the primary reports `default_transaction_read_only=off` and `pg_is_in_recovery()=false`:

1. Stop any maintenance client that used a session-level read-only setting.
2. Inspect `pg_stat_statements` for `SET default_transaction_read_only TO 'on'` or session-level transaction characteristics.
3. Resolve the exact idle Supavisor backend by role, application name, backend start, and state. Never terminate a broad role or every database connection.
4. From a controlled direct admin connection, terminate only the confirmed contaminated idle backend.
5. Verify the next scheduled write path succeeds and that its durable rows reach the expected final state.
6. Keep the incident launch-blocking until both runtime logs and database state prove recovery.

## Recovery and rollback

- Prefer forward-fix migrations. Dropping columns, destructive rewrites, and irreversible backfills require an explicit backup and rollback plan.
- A code rollback does not automatically reverse a schema migration. Maintain backward compatibility across the deployment boundary when possible.
- If a new constraint blocks valid production behavior, disable or forward-fix the specific constraint only after preserving the data-integrity intent.
- Never copy production data into logs, pull requests, issue comments, or local fixtures while diagnosing a migration.