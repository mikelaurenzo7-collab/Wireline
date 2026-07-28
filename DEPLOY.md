# Wireline Deployment Guide

This guide covers the production boundary, Vercel project policy, environment scoping, migrations, and post-deployment verification. Product/provider inventories belong in their code or dedicated runbooks, not here.

## Standard release flow

1. Create a focused branch.
2. Push the branch and review the Vercel preview attached to the pull request.
3. Run the narrowest relevant checks while iterating and `npm run verify:full` before merge for auth, billing, data, provider, runtime, or shared-contract changes.
4. Confirm the exact PR head is `READY`, review the diff, and resolve review threads.
5. Squash merge to `main` with the expected head SHA.
6. Follow the exact merge commit through the production deployment.
7. Verify migrations, aliases, health, critical route behavior, and runtime errors.

A branch push creates a preview. A merge to `main` creates the production deployment when the Vercel Production Branch is `main`.

## Canonical Vercel project

**Only `revaluate/wireline` may be linked to this GitHub repository.** It owns `trywireline.com`, the production aliases, and the production environment inventory.

A second linked project historically named `workspace` caused duplicate deployments and a red **Vercel – workspace** status even when the canonical project was healthy. Do not copy production secrets into a duplicate project to silence that status. Unlink or retire the duplicate project instead.

Current production aliases are managed by the canonical project. Verify the aliases on the exact deployment rather than maintaining a duplicate list in source documentation.

## Runtime and tooling pins

Wireline is pinned to Node.js 22 across `.nvmrc`, `package.json`, and Vercel configuration.

Dependabot must not automatically open major upgrades for TypeScript, Vite, `@vitejs/plugin-react`, or `@types/node`. TypeScript 7.0.2 previously failed Vercel's **local user-provided** TypeScript function step after the application build had passed. Vite 8 is a separate Rolldown migration. Upgrade these majors only through a dedicated PR that proves preview and production compatibility.

## Vercel build boundary

`package.json` must keep:

```json
"build:vercel": "node scripts/vercel-build.mjs"
```

The wrapper owns deployment-boundary checks, the focused release gate, migration policy, build, server import smoke, and MCP bundle generation.

### Preview migrations

Preview deployments must not migrate the shared production database. `scripts/vercel-build.mjs` runs migrations only when:

- `VERCEL_ENV=production`; or
- `WIRELINE_RUN_MIGRATIONS=true` is explicitly set for a reviewed migration exercise.

Do not replace the wrapper with `npm run db:migrate && npm run build`.

### Production migrations

Production deployment logs must show successful migration replay before the deployment is accepted. Migrations must be numbered, journaled, idempotent, and aligned with `src/db/schema.ts` where applicable. Follow `DATABASE_SETUP.md`; never use `db:push` against shared or production infrastructure.

## Environment-variable policy

Environment values live in the canonical Vercel project.

| Scope | Policy |
| --- | --- |
| Production | Live credentials and production provider configuration only. |
| Preview | Dedicated sandbox credentials or intentionally unset. Never reuse a live value merely to make a preview green. |
| Development | Local or sandbox values only. |

`.env.example` defines names and documentation, not deployable values.

Core production variables include:

| Variable | Purpose |
| --- | --- |
| `APP_URL` | Canonical application and callback base URL. |
| `CORS_ORIGINS` | Explicit cross-origin allowlist. |
| `DATABASE_POOL_URL` | Preferred Supabase transaction-pooler connection. |
| `POSTGRES_URL` | Compatibility database connection fallback. |
| `INTERNAL_JWT_SECRET` | Canonical Wireline session-signing secret. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Distributed rate limits and durable short-lived controls. |
| `OPENAI_API_KEY` | Primary managed structured runtime and OpenAI Realtime surfaces. |
| `GEMINI_API_KEY` | First structured-runtime fallback. |
| `AI_GATEWAY_API_KEY` | Governed continuity through Vercel AI Gateway. |
| `VAPI_PRIVATE_KEY`, `VAPI_WEBHOOK_SECRET` | Managed call orchestration and signed webhook boundary. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | Twilio account identity and webhook verification. |
| `TWILIO_API_KEY`, `TWILIO_API_SECRET` | Preferred scoped Twilio REST credentials. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Billing and webhook verification. |

`XAI_API_KEY` is optional experiment-only infrastructure. Direct structured use also requires the explicit Wireline feature flag.

### Session-secret discipline

Keep `INTERNAL_JWT_SECRET` as the canonical name. A legacy alias must not carry a conflicting value. Rotating the secret invalidates existing sessions and must be treated as an intentional authentication change.

### No environment mirrors in source control

Do not commit Vercel exports, `.env` files, screenshots containing credentials, copied provider payloads, or credential documents. Rotate any credential that has been pasted into a document, chat attachment, issue, pull request, log, or shared drive.

## Provider configuration ownership

Do not maintain live agent phone numbers, founder contact information, or provider object IDs in this guide.

| Concern | Source of truth |
| --- | --- |
| Public/demo agent roster | `src/data/contact-agents.ts` and the provider dashboard |
| OAuth callback paths | route source plus `npm run oauth:redirects` |
| Stripe catalog | `src/lib/plan-catalog.ts`, catalog scripts, and `docs/BILLING_RUNBOOK.md` |
| Voice runtime | `ARCHITECTURE.md`, `docs/PRODUCTION_VOICE_RUNTIME_POLICY_2026-07-26.md` |
| Vapi webhook alignment | Vapi scripts and signed runtime contracts |
| Twilio numbers and messaging | server-owned Twilio routes and the Twilio console |

When a provider credential or webhook secret rotates, update every corresponding provider-side configuration in the same reviewed change.

## Release evidence

For each production merge, record or verify:

- exact merge SHA;
- Vercel production deployment ID and `READY` state;
- `trywireline.com` alias assignment with no alias error;
- focused gate results;
- migration success;
- production client/server/MCP bundles;
- `GET /api/health` returning HTTP 200;
- critical auth/provider starts returning expected status without exposing state, cookies, or tokens;
- post-deployment runtime-error scan;
- relevant database integrity counts and constraints.

GitHub Actions startup failures caused by the repository/account billing limit are infrastructure evidence, not application test results. Do not represent a missing job as a passing check. Use the complete local/Vercel gate and document the infrastructure limitation explicitly.

## Troubleshooting

### Preview runs migrations

Stop the release. Confirm `build:vercel` still points to `scripts/vercel-build.mjs`, Preview does not set `WIRELINE_RUN_MIGRATIONS=true`, and the deployment reports `VERCEL_ENV=preview`.

### Production deployment is healthy but the commit has an extra red Vercel status

Check whether a duplicate Vercel project is linked. The canonical project is `revaluate/wireline`; the historical duplicate produced **Vercel – workspace** failures.

### Vercel function compilation fails after an apparently green application build

Confirm Node.js 22 and the pinned TypeScript/Vite major families. TypeScript 7.0.2 is not approved for this repository.

### OAuth redirect mismatch

Run:

```bash
npm run oauth:redirects
```

Compare the generated canonical callbacks with the provider dashboard. Sign-in OAuth and mailbox/integration OAuth are separate flows and may use different scopes or callback routes.

### OAuth provider login succeeds but Wireline session exchange fails

Verify the latest migrations, distributed OAuth rate-limit configuration, bridge-cookie policy, pending-code table integrity, and runtime errors. Do not log or paste the state, bridge cookie, provider token, or one-time code.

### Stripe webhook failures

Verify the production endpoint, signature secret, enabled-event set, and event-id idempotency store. Use the Stripe webhook check/alignment scripts rather than editing events ad hoc.

### Vapi or Twilio webhook failures

Confirm the server-side secret and provider-side secret match, the public callback URL is current, and request signature validation is not bypassed. Keep Twilio REST credentials separate from the auth token required for webhook verification.

## Manual promotion

Normal production promotion is a reviewed merge to `main`. Manual promotion is an exception for an already reviewed, `READY` deployment and must preserve the exact verified commit. Do not deploy an unreviewed local working tree with `vercel deploy --prod`.
