# Wireline Deployment

This root path is retained for legacy links, development-tool discovery, and deployment regression contracts. The canonical maintained runbook is [docs/DEPLOYMENT_RUNBOOK.md](./docs/DEPLOYMENT_RUNBOOK.md).

## Required operating posture

- Only `revaluate/wireline` may be linked to this repository and own `trywireline.com`.
- The historical duplicate project produced a red **Vercel – workspace** status; do not copy production secrets into another project to silence it.
- Production deploys come from reviewed squash merges to `main`; verify the exact merge SHA, migrations, aliases, health, and runtime errors.
- Preview credentials must be sandbox-only or unset, and previews must not migrate the shared production database.
- Node.js 22, TypeScript 6, and Vite 6 remain approved. TypeScript 7.0.2 previously failed Vercel's local user-provided function compilation step after the application build passed.
- Never commit environment exports, credentials, provider payloads, live contact rosters, or generated deployment artifacts.

## Self-serve billing release control

`WIRELINE_SELF_SERVE_BILLING_ENABLED` is a production release switch, not a provider credential. It defaults closed when unset. The complete release-control policy — certification prerequisites, the demo-mode interlock, and the verified rollback procedure — lives in [docs/DEPLOYMENT_RUNBOOK.md](./docs/DEPLOYMENT_RUNBOOK.md#self-serve-billing-release-control).

Use the canonical runbook for the complete release, environment, provider-verification, and rollback procedure.
