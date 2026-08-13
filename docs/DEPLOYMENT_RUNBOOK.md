# Wireline Deployment Runbook

Status: **Canonical production runbook**

The canonical deployment path is GitHub `main` -> Vercel project `revaluate/wireline` -> `trywireline.com`. Feature branches and pull requests create previews. Squash merges to `main` create production deployments.

## Release sequence

1. Start from the latest `main` and use a focused branch.
2. Run targeted checks while iterating.
3. Run `npm run verify:full` for auth, billing, compliance, CSP, provider, data-access, migration, or shared-runtime changes.
4. Push the final exact head and require the Vercel preview to be READY.
5. Inspect CodeRabbit and resolve every review thread.
6. Squash merge with the expected head SHA.
7. Follow the exact squash SHA into the production deployment.
8. Verify production health, aliases, migrations, affected live routes, and runtime errors.

A green stale deployment is not release evidence. Validation must match the head that is merged.

## Vercel project boundary

Only the canonical `revaluate/wireline` project may own the GitHub integration, production environment, and `trywireline.com` alias. Do not copy production credentials into duplicate projects to silence an unrelated deployment check.

The repository is pinned to Node 22 through `.nvmrc`, `package.json`, and Vercel configuration. Change the runtime family only through an intentional compatibility PR.

## Preview rules

Preview builds must:

- pass `scripts/check-deployment-boundaries.mjs` before other release work;
- reject inherited production credentials and provider configuration;
- derive `APP_URL` from the preview host only after credential isolation passes;
- run source-control and documentation integrity checks;
- run the focused security, billing, runtime, product, and repository contracts;
- skip database migrations unless an explicitly isolated preview database and override are configured;
- build assets, client, server, and ChatGPT MCP bundles;
- pass the no-database server import smoke.

The `[launch-deep-audit]` commit marker runs all TypeScript configurations, ESLint, and the complete non-E2E Vitest estate on that exact preview head.

## Production rules

The production build must:

- pass the same deployment-boundary, repository, documentation, focused contract, operational-core, and token-generation gates;
- apply committed Drizzle migrations through `npm run db:migrate` unless the deployment is an explicitly identified non-live duplicate;
- build the production client/server and ChatGPT MCP bundles;
- pass server import smoke;
- finish READY with no alias error and own `trywireline.com`.

After promotion, verify:

```text
GET https://trywireline.com/api/health -> 200 { ok: true }
```

Then inspect runtime errors for the new deployment and probe every route or provider flow changed by the release.

## GitHub checks

GitHub Actions startup failures caused by the account billing limit are known infrastructure noise for this repository. They do not make a change safe and they do not supersede application evidence.

When Actions are unavailable, require:

- exact-head Vercel preview READY;
- CodeRabbit success and no unresolved review threads;
- the appropriate local or Vercel deep audit;
- targeted live/read-only probes for the changed surface;
- production verification after merge.

Do not ignore a named GitHub job that actually ran and found an application defect.

## Environment variables

`.env.example` is the canonical variable inventory. Vercel environment targeting is part of the security boundary:

- **Production:** live credentials and production provider configuration.
- **Preview:** dedicated sandbox values only, or unset.
- **Development:** local-purpose credentials only.

New credential-like variables are blocked in preview by default until `scripts/check-deployment-boundaries.mjs` explicitly classifies them. Never widen a production secret to all targets as a shortcut.

`INTERNAL_JWT_SECRET` is the canonical session-signing secret. Legacy aliases must not coexist with a different value.

## Database migrations

See [DATABASE_OPERATIONS.md](./DATABASE_OPERATIONS.md).

Preview builds must log that migrations were skipped. Production builds run the committed journal before the application build. For a high-risk schema change, apply and probe the committed migration through the authenticated Supabase migration path only after the exact preview head is green.

## Self-serve billing release control

`WIRELINE_SELF_SERVE_BILLING_ENABLED` is a production release switch, not a provider credential. It defaults closed when unset and must remain `false` in Development and Preview. Checkout opens only when this switch is explicitly affirmative **and** `WIRELINE_LAUNCH_DEMO_MODE=false`; an unset demo-mode value remains fail-closed.

Set the billing switch to `true` in Production only after all of the following have been certified against the live Wireline Stripe account:

- Public business identity, support email/URL, statement descriptor, and tax posture display Wireline rather than a historical product identity.
- `STRIPE_AUTOMATIC_TAX_ENABLED` remains `false` unless Stripe Tax settings and at least one applicable live registration are active. Registration and nexus decisions require qualified tax advice; the application must never infer them.
- The managed Billing Portal supports payment-method changes, invoice history, plan changes, at-period-end cancellation, and a verified return path to `trywireline.com`.
- A controlled lifecycle succeeds end to end: checkout, signed webhook entitlement, subscription projection, Runtime Allowance, portal access, cancellation, refund, and allowance reversal.
- Production telemetry is deliberately switched from demo evidence to live-customer evidence with `WIRELINE_LAUNCH_DEMO_MODE=false`.
- The exact production deployment SHA and launch-readiness response are recorded. `billing_ready` must list neither billing release control after release.

Valid Stripe credentials alone never authorize opening checkout. To close paid acquisition, set the billing switch to `false`, create a production redeployment so the new environment value is embedded, and verify the resulting deployment SHA and checkout 503 response before considering the rollback complete.

## Provider and integration releases

For a provider change, verify both configuration and behavior without exposing tokens or customer data:

- OAuth: canonical callback/start route, exact authorization host, state/cookie properties, and public error behavior.
- Stripe: catalog parity, webhook signature/idempotency, entitlements, cancellation, and Runtime Balance behavior.
- Twilio/Vapi: webhook signatures, number/assistant routing, DNC/TCPA gates, callback URLs, and retry semantics.
- OpenAI/Gemini/Gateway: model policy, spend guards, timeouts, fallbacks, and no preview credential inheritance.
- ChatGPT App: discovery, OAuth/PKCE, account binding, tool side-effect limits, and reviewer flow.

Provider identifiers and demo inventories belong in the owning source/configuration, not this runbook.

## Rollback

- Use Vercel rollback only after identifying whether the incident is code, environment, database, or provider state.
- A deployment rollback does not reverse migrations or external provider changes.
- Preserve backward compatibility across schema and webhook changes whenever possible.
- After rollback, verify the production alias, health endpoint, affected route, and runtime-error stream.
- Record the incident and forward fix in `docs/INCIDENT_RESPONSE.md` evidence rather than adding an ad hoc root file.
