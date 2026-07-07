# Demo Data Reset and QA Checklist - 2026-07-07

Status: **Active** - use this when refreshing demo-only tenants before marketing capture, dogfood QA, or pre-launch verification.

## Scope

- Demo accounts are allowed to be reset and reseeded.
- Production infrastructure is still live infrastructure. Do not run broad account purges, index drops, or schema pushes as part of demo refresh.
- Reset only rows marked as demo data or explicitly scoped to the selected demo tenant.

## Safe Sequence

1. Confirm the target email is a demo tenant, normally `wireline.demo@trywireline.com`.
2. Sign in with platform-admin dogfood credentials and run a dry run first:

   ```bash
   DOGFOOD_EMAIL=... DOGFOOD_PASSWORD=... DEMO_EMAIL=wireline.demo@trywireline.com node scripts/dogfood-reset.mjs --dry-run
   ```

3. Review the `would_delete` counts. Stop if any count is surprising or the caller is not a platform admin.
4. Execute the scoped reset:

   ```bash
   DOGFOOD_EMAIL=... DOGFOOD_PASSWORD=... DEMO_EMAIL=wireline.demo@trywireline.com node scripts/dogfood-reset.mjs
   ```

5. Seed current showcase data:

   ```bash
   npx tsx scripts/seed-demo-account.mts wireline.demo@trywireline.com
   ```

6. Run screenshot-backed QA against the seeded tenant for Overview, Studio, Phone Call History, Phone Outbound, Connections, Apps, Billing, and a mobile viewport.
7. Confirm `/api/health` and `/api/health/public` are healthy and production logs have no new error/fatal entries.

## Guardrails

- `DELETE /api/admin/demo-data` defaults to dry-run and requires `authenticateUser + requirePlatformAdmin`.
- `POST /api/admin/seed-demo-account` requires `authenticateUser + requirePlatformAdmin`.
- Broad account purges are not exposed as a dormant HTTP route. Use the checked account-deletion queue and job paths for tenant deletion workflows.
- Supabase unused-index advisories remain traffic-evidence work. Do not drop indexes solely because there are no real users yet.
