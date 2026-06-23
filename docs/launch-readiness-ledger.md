# Wireline launch-readiness ledger

This ledger captures the current production gate, known external blockers, and the next safe actions. It is intentionally operational: update it when a blocker is resolved or a release decision changes.

## Current release gate

- Production `main` is deployable through Vercel and the latest production deployment for `main` is READY.
- GitHub Actions is not a trustworthy release gate yet: workflow runs for recent release-gate commits have not materialized with readable jobs/logs.
- Do not merge stale branches blindly while GitHub Actions cannot provide actionable job output.
- Vercel preview builds must not apply migrations against a shared production database.

## CI and deployment blockers

### GitHub Actions startup/log visibility

Symptom:

- PR checks can fail before named jobs or step logs are visible.
- Commit workflow-run lookup can return no workflow runs for the checked SHA.
- Blob/log retrieval can fail with unavailable artifacts rather than actionable build output.

Policy until resolved:

1. Treat blank `startup_failure` / missing GitHub job logs as release-gate infrastructure, not application-code failure.
2. Require either readable GitHub Actions jobs or explicit owner acceptance of the documented infrastructure limitation before merging release-gated PRs.
3. Use Vercel READY deployments, runtime logs, direct PR diff review, and targeted repository checks as supporting evidence only; they do not fully replace CI.
4. Keep PR #540 and other reliability changes unmerged until the gate is trustworthy or the owner explicitly accepts the risk.

### Foreign Vercel status context

Symptom:

- GitHub commit status can include `Vercel – v0-project`, which is unrelated to the authorized `wireline` Vercel project inventory.

Policy until resolved:

- Do not treat `Vercel – v0-project` as a Wireline application check.
- Remove or disconnect the foreign Vercel/GitHub integration from the Vercel or GitHub installation dashboard when the owning installation is accessible.

### Vercel Node version mismatch

Current state:

- Repository declares Node `22.x` in `package.json`.
- `vercel.json` also exports `NODE_VERSION=22` for build environment consistency.
- Vercel project metadata can still report dashboard Node `20.x`.

Policy until resolved:

- Keep Node 22 as the repository source of truth.
- Confirm preview and production build logs show the expected Node 22 toolchain before merging runtime-sensitive changes.
- Update the Vercel project setting to Node 22 in the dashboard/API when write access is available.

## Database and security posture

Current state:

- Supabase project is active and healthy.
- Security advisors currently flag GraphQL exposure for authenticated users across many application tables.
- Security advisors flag leaked-password protection disabled.
- Two tables have RLS enabled with no policies: `wireline_oauth_pending_codes` and `wireline_stripe_events`.

Policy until resolved:

1. Do not run schema migrations from preview builds.
2. For any RLS/Auth work, create a narrowly scoped migration and verify with Supabase advisors after applying.
3. Prioritize GraphQL exposure reduction and leaked-password protection before broad launch.
4. Treat OAuth pending codes, Stripe events, token tables, audit logs, and communication logs as high-sensitivity surfaces.

## Preview migration safety

Repository build contract:

- `npm run vercel-build` calls `scripts/vercel-build.mjs`.
- The wrapper runs migrations only when `VERCEL_ENV` / `NODE_ENV` is `production`, or when `WIRELINE_RUN_MIGRATIONS=true` is explicitly set.
- Preview builds should log that migrations were skipped.

Required verification after build-wiring changes:

1. Inspect Vercel preview build logs for the migration skip message.
2. Confirm no preview deployment uses production migration credentials for automatic schema changes.
3. Confirm production deployment behavior remains explicit and auditable.

## Open PR triage rules

- PR #540: valid reliability improvement, but hold until CI is trustworthy or owner accepts the documented CI limitation.
- PR #548 / #552: release-gate observability work; useful for diagnosis, but do not merge while the same infrastructure failure prevents validation.
- Dependency PRs: require green preview/build evidence and focused changelog review before merge.
- Old feature/UI branches: require rebase, fresh diff review, and live preview UX verification before merge.

## Next highest-leverage actions

1. Restore readable GitHub Actions execution: named jobs, visible logs, and workflow-run records on fresh PR commits.
2. Remove/disconnect the unrelated `Vercel – v0-project` status integration.
3. Align Vercel project Node setting with repository Node 22.
4. Reduce Supabase GraphQL exposure and enable leaked-password protection.
5. Re-review PR #540 after the release gate is observable.
