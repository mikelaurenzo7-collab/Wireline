# BotBound Deployment Runbook

Status: **Canonical production runbook**  
Last reconciled: **August 31, 2026**

BotBound deploys from GitHub `main` to the canonical Vercel project `revaluate/botbound` and the customer origin `https://botbound.me`. The legacy `trywireline.com` origin is retained only for explicitly verified callback or rollback compatibility.

Only the canonical `revaluate/botbound` project may own the GitHub integration, production environment, and `botbound.me` alias. Never copy production credentials into a duplicate Vercel project to bypass a failed gate.

## Current launch posture

BotBound is approved for a controlled design-partner pilot, not broad self-serve acquisition. Paid media, broad invitations, cold outbound, and regulated-data onboarding remain closed until one real checkout lifecycle, one consented non-demo inbound call, support handling, repeat usage, and contribution margin are verified.

The customer operating loop is:

> **Build → Train → Launch → Improve**

A Bot must pass a private browser test before paid telephone-number wiring.

## Non-negotiable release invariants

1. The reviewed Git source tree is the deployable artifact. Deployment may not rewrite runtime source.
2. Production artifact compilation is read-only across the database and external providers.
3. Database migrations are append-only and are promoted explicitly against an exact commit SHA before deployment.
4. Provider verification is a separate read-only preflight. Any write-capable repair command must be deliberate and operator-invoked.
5. Preview credentials and data must be isolated from production.
6. Validation evidence must match the exact commit that reaches `main`; a green stale deployment is not evidence.
7. A deployment is not released until the canonical alias, health response, served source SHA, and runtime-error stream are verified.

## Canonical release sequence

### 1. Anchor and review

1. Fetch the latest remote `main`.
2. Create a focused branch from that exact SHA.
3. Run targeted checks while iterating.
4. Run `npm run verify:full` for auth, billing, compliance, CSP, provider, data-access, migration, or shared-runtime changes.
5. Push the final exact head and require its Vercel preview to reach `READY`.
6. Resolve every review thread.
7. Reconcile the branch with the latest `main` and repeat the exact-head preview if `main` moved.

### 2. Run the external provider preflight

From a secure operator environment containing the canonical production configuration, run:

```bash
WIRELINE_RECONCILE_STRIPE_PORTAL=true \
  node scripts/run-release-provider-preflight.mjs
```

This command is read-only. It verifies provider readiness, the managed Stripe Customer Portal, Stripe webhook coverage, and the Resend negative-delivery webhook contract. It must not contain or invoke an `--apply` path.

When provider drift is confirmed, use the owning explicit repair command, inspect the result, rerun the read-only preflight, and preserve redacted evidence. Never embed provider mutation in Vercel build, Preview, or an automatic retry loop.

### 3. Promote the exact schema journal

Check out the exact release commit and run:

```bash
BOTBOUND_RELEASE_SHA=<40-character-release-sha> \
BOTBOUND_PRODUCTION_SCHEMA_CONFIRM=APPLY_APPEND_ONLY_BOTBOUND_MIGRATIONS \
POSTGRES_URL=<canonical-port-5432-session-url> \
  node scripts/promote-production-schema.mjs
```

The promotion command rejects a SHA mismatch, a noncanonical Supabase project, a transaction-pooler URL, or a missing typed confirmation. It validates production configuration, applies the committed Drizzle journal, and verifies resulting schema effects.

Never use `db:push` against shared or production data. See [DATABASE_OPERATIONS.md](./DATABASE_OPERATIONS.md).

### 4. Merge and deploy

1. Merge only the reviewed exact head into `main` without force.
2. Follow the resulting exact `main` SHA into a new **production-target** Vercel deployment.
3. Do not promote a Preview artifact by changing its alias. Preview and Production have different environment and schema guarantees.
4. Wait for the exact deployment to reach `READY` and own `botbound.me`.

For an environment-only redeploy, select the intended source deployment and exact SHA explicitly:

```bash
VERCEL_TOKEN=... \
  npm run vercel:redeploy-production -- <sourceDeploymentId> <exactCommitSha>

VERCEL_TOKEN=... \
  npm run vercel:wait-deployment -- <newDeploymentId> <exactCommitSha> --production
```

The redeploy command creates a candidate; it does not declare the candidate live. The waiter must certify the same deployment ID, exact SHA, canonical project, `main` ref, production target, alias ownership, and served source header.

### 5. Verify production

Verify all of the following before declaring the release complete:

```text
GET https://botbound.me/api/health -> 200 { ok: true }
X-Wireline-Source-Commit -> exact released main SHA
```

Then inspect:

- canonical and legacy-domain behavior;
- production runtime errors and warnings for the new deployment;
- the exact routes changed by the release;
- database journal and schema effects;
- read-only Stripe, Resend, AgentMail, OpenAI, and Twilio readiness applicable to the change;
- billing, voice, email, and OAuth fail-closed behavior.

## Vercel build contract

Every Vercel build must run deployment-boundary, source-control, workflow-syntax, documentation, runtime-policy, security, focused launch-contract, operational-core, design-token, application-build, bundle, and server-smoke gates.

The canonical Production build additionally runs the clean-room TypeScript, ESLint, dependency-security, and current-launch contract audit, then performs **read-only** verification that production schema already matches the exact release journal.

Production artifact compilation must not:

- execute `db:migrate`;
- alter the Stripe portal, products, prices, webhooks, or customers;
- provision or reconfigure Twilio numbers;
- create or mutate AgentMail inboxes;
- send release-test email;
- rewrite reviewed source files.

If the schema or provider preflight has not passed, stop the release before deployment rather than teaching the build to repair infrastructure.

## Preview isolation

Preview builds must reject inherited production credentials, provider configuration, and self-serve checkout. Preview may receive branch-scoped `POSTGRES_URL`, `INTERNAL_JWT_SECRET`, and `OWNER_EMAIL` only when all of the following are true:

- `WIRELINE_PREVIEW_DATABASE_ISOLATED=true`;
- `WIRELINE_LAUNCH_DEMO_MODE=true`;
- `WIRELINE_PREVIEW_DATABASE_PROJECT_REF` matches the isolated Supabase branch;
- every value is scoped to Preview and the same exact Git branch;
- the Supabase project is not the canonical production project.

An isolated Preview may run the committed journal only during a deliberate branch-scoped certification window with `WIRELINE_RUN_MIGRATIONS=true`. Remove the override after the deployment terminates and delete disposable resources when the QA window closes.

Production Stripe, Twilio, OpenAI, Resend, AgentMail, OAuth, and database credentials remain Production-only. Never widen a secret to all Vercel targets as a shortcut.

## GitHub release controls

`main` must be treated as protected even while repository-level required checks are unavailable. A safe merge requires:

- latest-`main` reconciliation;
- exact-head Vercel `READY`;
- zero unresolved review threads;
- appropriate targeted and canonical release checks;
- immutable expected-head verification at merge;
- production verification after merge.

GitHub Actions billing or startup failures are infrastructure failures, not application approval. Do not ignore an Action that actually ran and reported a defect.

Repository branch protection and required checks should be enabled as soon as the GitHub account automation plane is healthy.

## Provider-specific release rules

### OpenAI and Twilio

OpenAI Realtime is the managed browser and telephone voice runtime. Twilio owns customer numbers, PSTN transport, and SMS. Vapi and xAI SIP are retired from the production runtime.

No hardcoded founder showcase number owns a live route. Inbound PSTN or SIP must resolve through a current tenant-owned `wireline_phone_numbers` assignment. The retired founder PSTN canary remains disabled unless a future, deliberate Twilio reprovisioning exercise enables `BOTBOUND_ENABLE_FOUNDER_PSTN_CANARY=true`.

A full carrier launch still requires direct Twilio control-plane verification of Trust Hub, A2P, CNAM, STIR/SHAKEN, geo permissions, usage triggers, callbacks, and number inventory. Application logs or database rows are not substitutes for those console controls.

### Stripe

Live catalog or portal health is not billing proof. The controlled lifecycle must demonstrate:

1. checkout created for the intended live price;
2. signed webhook accepted exactly once;
3. customer and subscription ownership bound to the authenticated BotBound user;
4. entitlement and Runtime Allowance posted correctly;
5. portal access and plan/cancellation behavior;
6. refund or reversal reconciliation;
7. ledger and database projections matching Stripe.

`WIRELINE_RECONCILE_STRIPE_PORTAL=true` is retained as an explicit compatibility confirmation for the external read-only provider preflight. It does not authorize a build-time provider read or any mutation.

`STRIPE_AUTOMATIC_TAX_ENABLED` must remain false unless the applicable registrations and tax posture are deliberately established. Nexus and registration decisions require qualified tax advice.

### Resend and AgentMail

`botbound.me` is the canonical transactional and mailbox domain. Production defaults to `BotBound <noreply@botbound.me>`. `trywireline.com` may remain verified only as an explicit rollback asset; it is not the runtime fallback.

Resend must retain verified SPF/DKIM and the negative-delivery webhook. AgentMail must retain the intentional support, security, DMARC, and unsubscribe inboxes. Test inbound, support reply, DMARC ingestion, and unsubscribe handling without exposing message contents in logs.

### Supabase

All public tables must remain under RLS. Promotion uses append-only Drizzle migrations and verifies the exact journal plus schema effects. BotBound's application ledger is `drizzle.__drizzle_migrations`; the Supabase dashboard's separate migration history may show an older number and is not a reason to replay already-applied DDL. Do not infer safety from a successful rebase or either ledger alone; compare the committed Drizzle journal, the live Drizzle ledger, and concrete schema objects. See [DATABASE_OPERATIONS.md](./DATABASE_OPERATIONS.md#the-migration-journal-is-not-the-whole-history).

Enable leaked-password protection before broad signup acquisition.

## Self-serve billing control

Self-serve billing is authorized only when all of these align:

1. `WIRELINE_SELF_SERVE_BILLING_ENABLED=true`;
2. `WIRELINE_LAUNCH_DEMO_MODE=false`;
3. `VERCEL_ENV=production`;
4. `VERCEL_GIT_COMMIT_REF=main`;
5. the exact release passed provider, schema, artifact, and production verification;
6. the approved cohort and lifecycle evidence are documented.

A boolean alone never authorizes Preview, a feature branch, another Vercel project, or acquisition traffic.

To close paid checkout, set `WIRELINE_SELF_SERVE_BILLING_ENABLED=false`, redeploy Production at the intended source SHA, and verify that paid routes fail closed with the customer-safe `BILLING_LAUNCH_NOT_APPROVED` response.

## Rollback and incident response

Determine whether the incident is code, environment, schema, or provider state before acting. A Vercel rollback does not reverse database migrations or external-provider mutations.

Prefer backward-compatible, append-only schema changes. After rollback, verify the production alias, health endpoint, served source SHA, affected route, provider behavior, and runtime-error stream. Record evidence and the forward fix in [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md).
