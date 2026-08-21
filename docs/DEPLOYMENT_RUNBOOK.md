# Wireline Deployment Runbook

Status: **Canonical production runbook**

The canonical deployment path is GitHub `main` -> Vercel project `revaluate/wireline` -> `botbound.me`. The legacy `trywireline.com` origin remains only where registered callback compatibility requires it. Feature branches and pull requests create previews. Squash merges to `main` create production deployments.

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

Never promote a preview artifact directly to production. Preview builds intentionally skip
database migrations and production-only schema/environment gates; changing its alias does not
rebuild it. `npm run vercel:promote-production -- <deploymentId> <exactCommitSha>` therefore
accepts only a READY, `main`, production-target deployment at the expected SHA.

## Vercel project boundary

Only the canonical `revaluate/wireline` project may own the GitHub integration, production environment, and `botbound.me` alias. Do not copy production credentials into duplicate projects to silence an unrelated deployment check.

The repository is pinned to Node 22 through `.nvmrc`, `package.json`, and Vercel configuration. Change the runtime family only through an intentional compatibility PR.

## Preview rules

Preview builds must:

- pass `scripts/check-deployment-boundaries.mjs` before other release work;
- reject inherited production credentials, provider configuration, and self-serve paid checkout;
- derive `APP_URL` from the preview host only after credential isolation passes;
- run source-control and documentation integrity checks;
- run the focused security, billing, runtime, product, and repository contracts;
- skip database migrations unless an explicitly isolated preview database and override are configured;
- build assets, client, server, and ChatGPT MCP bundles;
- enforce the generated client bundle budgets and reject public source maps;
- pass the no-database server import smoke.

The `[launch-deep-audit]` commit marker runs all supported TypeScript configurations, zero-warning ESLint, the production-dependency security gate, and the explicit current-launch Vitest estate on that exact preview head. The test estate runs through `scripts/run-test-estate.mjs`, which removes database and provider credentials and forces a deterministic non-production test identity. A local no-argument invocation remains the separate complete historical non-E2E archive and may expose obsolete contract drift; production never silently substitutes a smaller selection for that command.

## Production rules

The canonical production build must, in order:

1. pass deployment-boundary, repository, documentation, focused contract, operational-core, and token-generation gates;
2. validate the complete production environment against the canonical Vercel project;
3. pass the canonical TypeScript, zero-warning ESLint, runtime-policy, production-dependency security, and explicit current-launch Vitest audit on every production artifact, without relying on a commit marker and without exposing live credentials to tests;
4. build the production client/server and ChatGPT MCP bundles, enforce client bundle budgets, reject public source maps, and pass server import smoke before any live release step;
5. read and verify the catalog-fingerprinted Stripe Customer Portal when `WIRELINE_RECONCILE_STRIPE_PORTAL=true`;
6. apply the exact committed Drizzle migration journal only after the code, local artifacts, and live Stripe read-only gates pass;
7. verify the resulting production schema effects;
8. report whether self-serve billing is authorized for the audited `main` production release channel or will remain runtime-closed;
9. finish READY with no alias error and own `botbound.me`, with the legacy origin redirecting except for verified callback compatibility paths.

Canonical production fails closed when the portal verification switch is absent or the live configuration cannot be verified. Artifact construction must never mutate Stripe Customer Portal state.

After promotion, verify:

```text
GET https://botbound.me/api/health -> 200 { ok: true }
```

Then inspect runtime errors for the new deployment and probe every route or provider flow changed by the release.

## GitHub checks

GitHub Actions startup failures caused by the account billing limit are known infrastructure noise for this repository. They do not make a change safe and they do not supersede application evidence.

When Actions are unavailable, require:

- exact-head Vercel preview READY;
- CodeRabbit success and no unresolved review threads;
- the appropriate local or Vercel deep audit;
- targeted live/read-only probes for the changed surface;
- the mandatory comprehensive canonical-production audit before migrations;
- production verification after merge.

Do not ignore a named GitHub job that actually ran and found an application defect.

## Environment variables

`.env.example` is the canonical variable inventory. Vercel environment targeting is part of the security boundary:

- **Production:** live credentials and production provider configuration.
- **Preview:** dedicated sandbox values only, or unset.
- **Development:** local-purpose credentials only.

New credential-like variables are blocked in preview by default until `scripts/check-deployment-boundaries.mjs` explicitly classifies them. Never widen a production secret to all targets as a shortcut.

`XAI_API_KEY` has a reviewed Preview sandbox policy: Preview may carry a dedicated sandbox key for structured chat, TTS, and ephemeral browser sessions. Twilio carrier credentials remain production-only, so Preview cannot place native PSTN calls. `PERPLEXITY_API_KEY` may appear in Preview project configuration but stays inert unless `PERPLEXITY_PREVIEW_API_KEY` is set.

`INTERNAL_JWT_SECRET` is the canonical session-signing secret. Legacy aliases must not coexist with a different value.

## Database migrations

See [DATABASE_OPERATIONS.md](./DATABASE_OPERATIONS.md).

Preview builds must log that migrations were skipped. Production builds run the committed journal only after the comprehensive clean-room code audit and live read-only provider gates pass. For a high-risk schema change, apply and probe the committed migration through the authenticated Supabase migration path only after the exact preview head is green.

## Self-serve billing release control

Self-serve billing is fail-closed and is authorized only on the audited canonical production release channel. Two operator controls and two Vercel-managed runtime identity checks must align:

1. `WIRELINE_SELF_SERVE_BILLING_ENABLED=true` expresses the operator's intent to offer paid checkout.
2. `WIRELINE_LAUNCH_DEMO_MODE=false` ensures paid activity is classified as real customer evidence rather than demo/test evidence.
3. `VERCEL_ENV=production` proves the request is running in a Production deployment.
4. `VERCEL_GIT_COMMIT_REF=main` binds billing to the reviewed Git release channel.

`WIRELINE_SELF_SERVE_BILLING_RELEASE_SHA` is retired legacy configuration. It no longer authorizes checkout and no longer needs to be rotated for every safe production deploy. It may be removed from Production after the new channel-bound gate is live. Preview continues to reject that legacy variable if it is accidentally widened to Preview.

This change is deliberately paired with the mandatory canonical-production pipeline: every production artifact from `main` must pass the clean-room TypeScript/ESLint/runtime-policy/security/current-launch contract audit, environment validation, local artifact build and smoke, live Stripe read-only verification, migrations, and schema-effect assertions before Vercel can make it READY. A surviving boolean alone cannot authorize Preview, a feature branch, or another Vercel environment.

`WIRELINE_RECONCILE_STRIPE_PORTAL=true` is a separate production infrastructure control. The historical name is retained for environment compatibility, but canonical Production builds use it as a read-only, fail-closed verification gate. The gate verifies the exact public Starter/Starter Plus/Pro monthly and annual switch set, at-period-end cancellation, payment method updates, invoice history, and legal/return URLs before any production migration runs. Preview and Development must leave it false/unset.

Run `npm run stripe:portal:verify` to perform the same read-only assertion from a secure, production-configured operator context. When drift is confirmed, run `npm run stripe:portal:reconcile` deliberately from that context, inspect the resulting managed configuration, then redeploy so the production artifact independently re-verifies the live state. The repair command is write-capable; it must not be embedded in a build, preview, or automatic retry loop.

Before opening a controlled certification window, verify all of the following against the live BotBound Stripe account and the deployed artifact:

- Public business identity, support email/URL, statement descriptor, and tax posture display BotBound rather than the historical Wireline identity.
- `STRIPE_AUTOMATIC_TAX_ENABLED` remains `false` unless Stripe Tax settings and at least one applicable live registration are active. Registration and nexus decisions require qualified tax advice; the application must never infer them.
- The managed Billing Portal supports payment-method changes, invoice history, plan changes, at-period-end cancellation, and a verified return path to `botbound.me`.
- Production telemetry is deliberately switched from demo evidence to live-customer evidence with `WIRELINE_LAUNCH_DEMO_MODE=false`.
- The exact production deployment SHA, migrations, aliases, health response, affected routes, and runtime-error stream are recorded and clean.
- Broad invitations, paid media, cold outbound, and non-founder customer onboarding remain off during certification.

The controlled checkout lifecycle necessarily requires the gate to be open for the founder-controlled account performing it. Channel authorization is therefore a release boundary, not proof by itself. A successful certification must still demonstrate checkout, signed webhook entitlement, subscription projection, Runtime Allowance, portal access, cancellation, refund or reversal, and ledger reconciliation.

Valid Stripe credentials, a verified portal, and a previously enabled boolean never authorize a Preview or non-`main` deployment by themselves.

### Opening a controlled certification window

1. Merge the reviewed exact head to `main` through the normal production path.
2. Verify the production SHA, comprehensive build audit, migrations, aliases, health endpoint, affected routes, Stripe portal verification, and runtime logs.
3. Set `WIRELINE_SELF_SERVE_BILLING_ENABLED=true` and `WIRELINE_LAUNCH_DEMO_MODE=false` for Production if they are not already set, then redeploy Production without changing source.
4. Verify the redeployment is `VERCEL_ENV=production`, originates from `main`, launch readiness reports `self_serve_billing_enabled: true`, and a founder-controlled authenticated checkout creates the intended post-branding Stripe session.
5. Complete the live lifecycle and reconcile the Stripe, subscription, allowance, checkout-operation, usage, cancellation, and refund/reversal records.
6. On any failure, set `WIRELINE_SELF_SERVE_BILLING_ENABLED=false`, redeploy, verify the paid route is closed, and complete incident/rollback handling. On success, keep billing enabled for the approved cohort and preserve redacted evidence.

Do not send acquisition traffic merely because the billing gate is open. Public acquisition remains a separate business decision after repeated use and observed contribution are demonstrated.

### Closing paid checkout

Set `WIRELINE_SELF_SERVE_BILLING_ENABLED=false` and create a Production redeployment. Verify the exact deployment SHA and confirm a pre-auth paid route returns the customer-safe 503 `BILLING_LAUNCH_NOT_APPROVED` response before considering the operational stop complete. No release-SHA rotation is required.

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
