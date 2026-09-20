# BotBound Deployment Runbook

Status: **Canonical production runbook**  
Last reconciled: **September 19, 2026**

BotBound deploys from GitHub `main` to the canonical Vercel project `revaluate/botbound` and the customer origin `https://botbound.me`. The legacy `trywireline.com` origin is retained only for explicitly verified callback or rollback compatibility.

Production telephone calls also require the persistent Node 22 voice worker in `deploy/voice-worker/`. Vercel owns the public application and signed callback entry; the worker owns the call's sideband connection, tools, transcript and settlement. Both services must run the same reviewed release. A healthy website alone does not certify telephone service.

Only the canonical `revaluate/botbound` project may own the GitHub integration, production environment, and `botbound.me` alias. Never copy production credentials into a duplicate Vercel project to bypass a failed gate.

## Current launch posture

The next release target is a controlled design-partner pilot. This runbook is not launch approval: admission remains closed until the exact release, funded providers, persistent voice worker and founder workflow proof pass the gates below. Paid media, broad invitations, cold outbound, and regulated-data onboarding remain closed until one real checkout lifecycle, one consented non-demo inbound call, support handling, repeat usage, and contribution margin are verified.

The customer operating loop is:

> **Build → Train → Launch → Improve**

A Bot must pass a private browser test before directing customer traffic to it. Free Builder stays private; an active paid web account can prepare the Bot's managed number and mailbox automatically within plan capacity. That background setup is not proof that its knowledge or customer workflow is ready.

## Non-negotiable release invariants

1. The reviewed Git source tree is the deployable artifact. Deployment may not rewrite runtime source.
2. Production artifact compilation is read-only across the database and external providers.
3. Database migrations are append-only and are promoted explicitly against an exact commit SHA before deployment.
4. Provider verification is a separate read-only preflight. Any write-capable repair command must be deliberate and operator-invoked.
5. Preview credentials and data must be isolated from production.
6. Validation evidence must match the exact commit that reaches `main`; a green stale deployment is not evidence.
7. A deployment is not released until the canonical alias, health response, served source SHA, and runtime-error stream are verified.
8. Telephone readiness includes the persistent worker, matched duration settings, verified number ownership, and a call lasting beyond five minutes. A Vercel timeout increase cannot replace this proof.

## Canonical release sequence

### 1. Anchor and review

1. Fetch the latest remote `main`.
2. Create a focused branch from that exact SHA.
3. Run targeted checks while iterating.
4. Run `npm run verify:full` for auth, billing, compliance, CSP, provider, data-access, migration, or shared-runtime changes.
   Voice worker changes also require `npm run build:voice-worker` and a container build/runtime smoke on a Docker-capable host. The web build does not compile or deploy the worker.
5. Push the final exact head and require its Vercel preview to reach `READY`.
6. Resolve every review thread.
7. Reconcile the branch with the latest `main` and repeat the exact-head preview if `main` moved.

### 2. Inspect infrastructure and providers

Confirm account access, current invoices/credits, a suitable always-on worker host, and read-only database health (`npm run db:health`) before scheduling the release. See the founder sequence in [LAUNCH_GURU_PLAYBOOK_2026-07-20.md](./LAUNCH_GURU_PLAYBOOK_2026-07-20.md). An absent host, blocked deployment account, unknown required credit balance or failed recharge remains unresolved, even when source checks pass.

From a secure operator environment containing the canonical production configuration, run:

```bash
WIRELINE_RECONCILE_STRIPE_PORTAL=true \
  node scripts/run-release-provider-preflight.mjs
```

This command is read-only. It verifies provider readiness, authenticated worker readiness, the managed Stripe Customer Portal, Stripe webhook coverage, and the Resend negative-delivery webhook contract. It must not contain or invoke an `--apply` path. Worker verification expects `WIRELINE_EXPECTED_SOURCE_REVISION`, otherwise `VERCEL_GIT_COMMIT_SHA`, otherwise the local Git HEAD; set the expected exact release explicitly when those environments differ.

When provider drift is confirmed, use the owning explicit repair command, inspect the result, rerun the read-only preflight, and preserve redacted evidence. Never embed provider mutation in Vercel build, Preview, or an automatic retry loop.

On a first worker deployment, its readiness check is expected to remain blocked until step 4. Record that blocker explicitly; rerun the complete preflight after worker deployment and before enabling telephone admission.

### 3. Promote the exact schema journal

Check out the exact release commit and run:

```bash
BOTBOUND_RELEASE_SHA=<40-character-release-sha> \
BOTBOUND_PRODUCTION_SCHEMA_CONFIRM=APPLY_APPEND_ONLY_BOTBOUND_MIGRATIONS \
POSTGRES_URL=<canonical-port-5432-session-url> \
  node scripts/promote-production-schema.mjs
```

The promotion command rejects a SHA mismatch, a dirty checkout, a noncanonical Supabase project, a transaction-pooler URL, or a missing typed confirmation. It validates production configuration, applies the committed Drizzle journal, and verifies resulting schema effects.

Never use `db:push` against shared or production data. See [DATABASE_OPERATIONS.md](./DATABASE_OPERATIONS.md).

### 4. Prepare the persistent voice worker

Use the exact reviewed release commit, after its preview and schema gates pass. Build an immutable image from that checkout:

```bash
docker build -f deploy/voice-worker/Dockerfile \
  --build-arg VOICE_WORKER_SOURCE_REVISION=<40-character-release-sha> \
  -t botbound-voice-worker:<release-sha> .
```

Build only from the clean exact release checkout; the revision argument labels the image and does not verify the source by itself. Keep the source SHA, image digest, host revision and redacted verification results together in the release record. Tags alone are mutable and do not establish provenance. The worker's source, credentials and schema must match the web release being promoted.

- Deploy an always-on Node 22 process with HTTPS termination and sufficient WebSocket lifetime. Do not use a Vercel function or scale-to-zero host for this process.
- Configure the separate worker origin and independent service secret, canonical `APP_URL`, production database, OpenAI SIP credentials and required Bot tool credentials as described in [OPENAI_REALTIME_VOICE.md](./OPENAI_REALTIME_VOICE.md#deployment-and-shutdown). Keep these in the host's server-side secret store.
- Match `OPENAI_SIP_MAX_CALL_SECONDS=3600` on web and worker when enabling one-hour calls. A retained explicit value of `300` still limits calls to five minutes.
- Verify startup, public `GET /healthz`, authenticated `GET /readyz`, rejection without the service credential, capacity handling, and the authenticated drain procedure. The provider preflight verifies worker revision, tenant-role database access, maximum call duration and keyed agreement on the OpenAI project/webhook and internal signing settings. This does not verify all optional tool credentials, provider credit, correct carrier routing or successful calls.
- For replacement, bring up the new verified instance, remove the old instance from admission traffic and drain it. Wait for both active work and pending handlers to reach zero before stopping it. Allow 65 minutes at the default call duration, or complete pre-drain before the host's shorter termination window begins.
- Verify the complete provider preflight again. Keep checkout and traffic admission closed while any gate remains unresolved.

### 5. Merge and deploy the web application

1. Fast-forward `main` to the reviewed, certified head without force, preserving the exact SHA verified on the worker. Do not create a merge or squash commit after certification. If `main` advances or integration changes the source SHA, certify that new head and rebuild and verify its worker before promotion.
2. Follow that same exact `main` SHA into a new **production-target** Vercel deployment.
3. Do not promote a Preview artifact by changing its alias. Preview and Production have different environment and schema guarantees.
4. Wait for the exact deployment to reach `READY` and own `botbound.me`.
5. Confirm this production deployment uses the verified worker origin, matching service secret and duration setting. Keep the previous worker available until all its calls drain; a web deployment must not interrupt an active call.

For an environment-only redeploy, select the intended source deployment and exact SHA explicitly:

```bash
VERCEL_TOKEN=... \
  npm run vercel:redeploy-production -- <sourceDeploymentId> <exactCommitSha>

VERCEL_TOKEN=... \
  npm run vercel:wait-deployment -- <newDeploymentId> <exactCommitSha> --production
```

The redeploy command creates a candidate; it does not declare the candidate live. The waiter must certify the same deployment ID, exact SHA, canonical project, `main` ref, production target, alias ownership, and served source header.

### 6. Verify production and the first workflow

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

Before admitting the pilot, complete a clean-account build, train, private rehearsal, controlled billing lifecycle, phone activation and consented inbound call. Prove a call beyond five minutes, late tool use, owner handoff, transcript/outcome and duration-based settlement. Exercise worker failure/continuity and rolling drain. Use the live approved workflow for outbound/SMS proof only after its specific consent and carrier gates pass. Record the exact source and provider evidence; seeded founder/demo activity is not customer traction.

Only then recapture production marketing proof, review its final exports and open the documented pilot cohort. Local screenshots and a green build are preparation evidence, not a substitute for this sequence.

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

The persistent worker is required for production SIP admission. Full business calls default to 60 minutes; private rehearsals and message-taking retain their documented shorter limits. Check both deployed duration settings and an actual long call before advertising the longer runtime as available.

No hardcoded founder showcase number owns a live route. Inbound PSTN or SIP must resolve through a current tenant-owned `wireline_phone_numbers` assignment. The former founder PSTN canary and its scheduled job are retired; any future reprovisioning exercise must introduce a new, explicitly reviewed probe rather than silently reactivating launch-era numbers.

A full carrier launch still requires direct Twilio control-plane verification of Trust Hub, A2P, CNAM, STIR/SHAKEN, geo permissions, usage triggers, callbacks, and number inventory. Application logs or database rows are not substitutes for those console controls.

Reconcile existing numbers read-only against tenant, Bot, plan, account environment and recent usage before cutover or cost cleanup. A seeded Bot or founder/demo assignment does not make a line disposable. Preserve the old routing and ownership evidence, change one verified low-risk line first, and prove its approved workflow before moving the rest. Never release or reroute the inventory merely because the legacy provider appears in its callback URL.

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

BotBound uses its own authentication, not Supabase Auth. Before broad signup acquisition, verify that the deployed BotBound signup and reset flows enforce the HIBP password check and fail closed when screening is unavailable (`src/lib/breached-passwords.ts`). A Supabase Auth leaked-password advisor is not evidence about BotBound's custom auth controls; changing that setting does not certify these flows.

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

For a voice incident, stop new admission to the affected worker and preserve active calls where possible. Roll web and worker back to a compatible reviewed pair; do not terminate the old worker until it drains. Inspect pending claims and durable post-call recovery before retrying uncertain provider actions. A healthy replacement does not recover the media or transcript of a crashed call.

Prefer backward-compatible, append-only schema changes. After rollback, verify the production alias, health endpoint, served source SHA, affected route, provider behavior, and runtime-error stream. Record evidence and the forward fix in [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md).
