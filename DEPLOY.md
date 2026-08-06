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

`WIRELINE_SELF_SERVE_BILLING_ENABLED` is a production release switch, not a provider credential. It defaults closed when unset and must remain `false` in Development and Preview. Set it to `true` in Production only after all of the following have been certified against the live Wireline Stripe account:

- Public business identity, support email/URL, statement descriptor, and tax posture display Wireline rather than a historical product identity.
- The managed Billing Portal supports payment-method changes, invoice history, plan changes, at-period-end cancellation, and a verified return path to `trywireline.com`.
- A controlled lifecycle succeeds end to end: checkout, signed webhook entitlement, subscription projection, Runtime Allowance, portal access, cancellation, refund, and allowance reversal.
- The exact production deployment SHA and launch-readiness response are recorded. `billing_ready` must not list `WIRELINE_SELF_SERVE_BILLING_ENABLED` after release.

Valid Stripe credentials alone never authorize opening checkout. Roll back paid acquisition immediately by setting the switch to `false`; no redeploy is required after the environment change propagates.

Use the canonical runbook for the complete release, environment, provider-verification, and rollback procedure.
