# BotBound Deployment

This root path is retained for legacy links, development-tool discovery, and deployment regression contracts. The canonical maintained runbook is [docs/DEPLOYMENT_RUNBOOK.md](./docs/DEPLOYMENT_RUNBOOK.md).

## Required operating posture

- The prepared migration serves `botbound.me` directly from the Render Node 22 web/API service, with a separate Render voice worker and the existing Supabase database. Attach the canonical domain to Render and migrate its authoritative DNS away from Vercel as documented in the runbook. Until cutover is verified, `revaluate/botbound` remains the only permitted legacy Vercel project; do not create a duplicate. `trywireline.com` is a temporary compatibility origin for registered callback drains only.
- The historical duplicate project produced a red **Vercel – workspace** status; do not copy production secrets into another project to silence it.
- Production deploys come from the exact reviewed commit fast-forwarded to `main`; verify that same SHA, migrations, aliases, health, and runtime errors.
- Preview credentials must be sandbox-only or unset, and previews must not migrate the shared production database.
- Node.js 22, TypeScript 6, and Vite 6 remain approved. TypeScript 7.0.2 previously failed Vercel's local user-provided function compilation step after the application build passed.
- Never commit environment exports, credentials, provider payloads, live contact rosters, or generated deployment artifacts.

## Self-serve billing release control

Self-serve checkout is authorized only on the audited canonical `main` production release channel and requires:

- `WIRELINE_SELF_SERVE_BILLING_ENABLED=true`;
- `WIRELINE_LAUNCH_DEMO_MODE=false`;
- Render runtime identity: `WIRELINE_DEPLOYMENT_ENVIRONMENT=production`, automatic `RENDER=true`, `IS_PULL_REQUEST=false`, `RENDER_GIT_BRANCH=main`, and a valid full `RENDER_GIT_COMMIT`. API traffic also requires `BOTBOUND_TRAFFIC_ENABLED=true`.
- Legacy Vercel rollback uses `VERCEL_ENV=production` and `VERCEL_GIT_COMMIT_REF=main` instead. Never combine the two providers' deployment metadata.

`WIRELINE_SELF_SERVE_BILLING_RELEASE_SHA` is retired legacy configuration and no longer authorizes checkout. Safe production redeploys do **not** require per-commit environment-variable rotation. Preview and non-`main` deployments remain fail-closed. Release admission requires the comprehensive audit, Stripe verification, schema proof, build and smoke tests; the Render build itself compiles without database or provider mutations.

The complete certification prerequisites, opening procedure, and rollback procedure live in [docs/DEPLOYMENT_RUNBOOK.md](./docs/DEPLOYMENT_RUNBOOK.md#self-serve-billing-control). Treat rollback as prepared, not proven, until an exact-SHA rollback drill has been executed and recorded.

Use the canonical runbook for the complete release, environment, provider-verification, and rollback procedure.
