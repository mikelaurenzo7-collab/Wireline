# Wireline Database Operations

This document is the operational contract for Wireline's Supabase-hosted PostgreSQL database. It is intentionally narrower than `ARCHITECTURE.md`: it covers connection selection, tenant isolation, migrations, grants, verification, and safe change procedures.

## Non-negotiable rules

- Treat every connected Supabase database as shared infrastructure unless a disposable local database is explicitly provisioned.
- Do **not** run `drizzle-kit push` (`npm run db:push`) against Preview, Production, or the shared development database.
- Do **not** model Wireline policies with Supabase Auth or `auth.uid()`. Wireline owns authentication.
- Do **not** assume a committed migration has reached the live database. Verify both repository and physical database state.
- Do **not** delete indexes because an advisor calls them unused before representative production traffic exists.
- Never commit connection strings, passwords, tokens, provider payloads, exports, or tenant data.

## Canonical sources

| Concern | Source |
| --- | --- |
| Drizzle schema | `src/db/schema.ts` |
| Committed migrations | `drizzle/migrations/*.sql` |
| Migration registration | `drizzle/migrations/meta/_journal.json` |
| Connection and tenant context | `src/lib/server-context.ts` |
| Runtime environment policy | `src/lib/startup.ts`, `scripts/check-prod-env.mjs` |
| Architecture and security invariants | `ARCHITECTURE.md` |
| Repository cleanup rules | `CODEBASE_HEALTH.md` |

The physical Supabase schema may be ahead of an older migration journal because some verified repairs were applied directly. Repository state and live state must therefore be reconciled explicitly.

## Connection configuration

Wireline uses server-owned PostgreSQL connections. Browser, native, extension, and ChatGPT surfaces never receive database credentials.

Preferred serverless configuration:

```text
DATABASE_POOL_URL=postgresql://postgres.<project-ref>:<password>@<region>.pooler.supabase.com:6543/postgres
```

Compatibility fallback:

```text
POSTGRES_URL=postgresql://postgres.<project-ref>:<password>@<region>.pooler.supabase.com:6543/postgres
```

`DATABASE_POOL_URL` is preferred when configured. Environment validation rejects malformed or unsafe production database hosts. Use `.env.example` for variable names only; real values belong in the environment manager.

## Authentication and tenant isolation

Wireline does not use Supabase Auth as its application identity authority. Password and OAuth sessions are verified by Wireline server middleware.

Tenant-scoped database work uses:

1. the restricted PostgreSQL role `wireline_server`;
2. the request-scoped GUC `app.current_user_id`; and
3. RLS policies that compare a row's tenant key with that GUC.

The request transaction establishes the tenant context before downstream queries. The base owner connection is reserved for deliberately unscoped operations such as sign-in lookup, OAuth callbacks, migrations, and global provider webhooks.

A representative tenant predicate is:

```sql
USING (
  user_id = (
    SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid
  )
)
```

The scalar subquery is intentional: PostgreSQL can evaluate the GUC once per query rather than once per row.

### Required table posture

For every tenant-owned table:

- enable RLS;
- define an explicit tenant policy for `wireline_server`;
- grant only the operations the application needs to `wireline_server`;
- revoke browser-facing `anon` and `authenticated` grants unless a separately reviewed Data API use case exists;
- verify the policy against both a matching and non-matching tenant context.

For owner-only sensitive tables such as pre-session token or webhook-idempotency stores:

- enable RLS;
- create no permissive tenant policy;
- revoke all access from `anon` and `authenticated`;
- keep access server-owned through the owner/service path.

RLS enabled with no policy is correct only for a deliberately owner-only table. For a tenant-owned table, it is a release blocker.

## Migration workflow

### 1. Inspect first

```bash
npm run db:health
npm run db:check
```

Also inspect the affected live tables, columns, constraints, indexes, grants, policies, and current row shape before writing DDL.

### 2. Update the declarative schema when applicable

Change `src/db/schema.ts` when the database shape belongs in Drizzle's long-term model. Keep declarative defaults and constraints aligned with the live migration so a future generated migration cannot reverse the fix.

### 3. Add an idempotent migration

Create the next numbered file in `drizzle/migrations/` and register it in `drizzle/migrations/meta/_journal.json`.

Prefer safe patterns:

- `CREATE TABLE IF NOT EXISTS`
- `ADD COLUMN IF NOT EXISTS`
- `CREATE INDEX IF NOT EXISTS`
- guarded `DO $$ ... $$` blocks for constraints, policies, roles, and triggers
- backfills that only fill missing or invalid state
- explicit preservation of Account Holder choices and existing paid entitlements

A migration must be safe to replay because Preview/Production deployment gates may encounter a database where part of the repair was already applied.

### 4. Validate on a branch

At minimum:

```bash
npm run lint:server
npm run docs:check
npm run test:run
npm run build
npm run smoke:server
```

Use `npm run verify:full` for authentication, authorization, billing, tenant isolation, provider integrations, or migration-framework changes.

### 5. Apply deliberately

A merged SQL file is not proof that the live database changed. Apply through the reviewed migration path and confirm the deployment log reports successful migration replay.

Never use `npm run db:push` as a shortcut for a shared or production environment.

### 6. Prove both sides of the invariant

For constraints, triggers, and policies, test:

- the invalid transaction is rejected and leaves no residue;
- the valid transaction commits or reaches the deferred constraint successfully;
- rollback probes leave no test data;
- current production rows remain valid;
- grants and RLS posture remain unchanged except for the intended delta.

### 7. Re-run advisors and runtime checks

After DDL:

- inspect Supabase security and performance advisors;
- classify findings against Wireline's custom-auth and server-owned access model;
- verify Vercel health and runtime errors after deployment;
- verify data counts and integrity queries after migration replay.

## Schema-change checklist

Before merge, confirm:

- [ ] The migration is numbered, registered, and idempotent.
- [ ] `src/db/schema.ts` does not advertise contradictory defaults or constraints.
- [ ] Historical rows are backfilled without overwriting explicit user choices.
- [ ] New tables have the correct owner, RLS, policies, and `wireline_server` grants.
- [ ] `anon` and `authenticated` do not gain unintended direct access.
- [ ] Foreign keys and cascade behavior match account-deletion requirements.
- [ ] Unique constraints support concurrent webhook, OAuth, and signup behavior.
- [ ] Invalid and valid transactions were tested.
- [ ] Preview and production migration replay succeeded.
- [ ] Post-deployment health and runtime logs are clean.

## Troubleshooting

### Application queries return no rows after a migration

Check, in order:

1. the request entered tenant context;
2. the transaction switched to `wireline_server`;
3. `app.current_user_id` is set inside that transaction;
4. the table has the correct `wireline_server` grants;
5. the RLS policy references the correct tenant column;
6. the query is not intentionally running through an unscoped owner path.

### A migration succeeds locally but fails in Vercel

Common causes:

- non-idempotent DDL encountered an already-applied live repair;
- the migration journal and physical schema differ;
- a constraint was added before invalid legacy rows were repaired;
- a new table lacks grants or policies expected by server code;
- an index operation is incompatible with the transaction used by the migration runner.

Inspect the physical database before editing the migration. Do not blindly delete journal entries or run `db:push`.

### Supabase reports leaked-password protection disabled

That advisor applies to Supabase Auth. Wireline currently uses its own password system and HIBP screening, so this finding is not evidence that Wireline password accounts are unprotected. Document the distinction; do not claim the advisor is resolved unless Wireline adopts Supabase Auth or the setting is intentionally enabled.

## Production integrity baseline

The current production posture expects:

- every committed user to have activation/settings state and a persisted spend guard;
- spend guards to fail closed when missing, malformed, or unreadable;
- tenant-owned public tables to use RLS and restricted server grants;
- pre-session and webhook-control tables to remain inaccessible to browser roles;
- migrations to replay safely during Vercel production builds.

Re-verify these invariants after any authentication, billing, entitlement, or database migration change.
