# Wireline Deployment

This root path is retained for legacy links, development-tool discovery, and regression contracts. The canonical maintained runbook is [docs/DEPLOYMENT_RUNBOOK.md](./docs/DEPLOYMENT_RUNBOOK.md).

## Required operating posture

- Only `revaluate/wireline` may be linked to this GitHub repository and own `trywireline.com`.
- The historical duplicate project produced a red **Vercel – workspace** status; do not copy production secrets into a duplicate project to silence it.
- Production deploys come from reviewed squash merges to `main`; verify the exact merge SHA, migration replay, aliases, health, and runtime errors.
- Preview credentials must be sandbox-only or unset, and preview deployments must skip shared-database migrations.
- Node.js 22, TypeScript 6, and Vite 6 remain the approved runtime/tooling families. TypeScript 7.0.2 previously failed Vercel's local user-provided function compilation step after the application build passed.
- Never commit Vercel exports, environment files, credentials, provider payloads, contact rosters, or production deployment artifacts.

Use `docs/DEPLOYMENT_RUNBOOK.md` for the complete release, environment, migration, provider-verification, and rollback procedure.
