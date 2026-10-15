# BotBound Deployment Runbook

Status: **Canonical production runbook**  
Last reconciled: **September 26, 2026**

The current production host is Render, with customer origin `https://botbound.app`, web/API service `botbound-api`, and persistent voice service `botbound-voice`. GitHub `main` is the release source. Serving the public origin does not certify matching service revisions, scheduler operation, provider readiness, or launch approval; verify those separately for each release. The legacy `trywireline.com` origin is retained only for explicitly verified callback or rollback compatibility.

Production telephone calls also require the persistent Node 22 voice worker in `deploy/voice-worker/`. The web/API service owns the public application and signed callback entry; the worker owns the call's sideband connection, tools, transcript and settlement. Both services must run the same reviewed release. A healthy website alone does not certify telephone service.

While Vercel remains available for an explicitly reviewed rollback, `revaluate/botbound` is its only permitted legacy production project. Never copy production credentials into a duplicate Vercel project to bypass a failed gate. Render serves the current public application; Porkbun hosts the `.app` DNS zone and the existing Supabase database remains authoritative.

## Current launch posture

### Render production and release sequence

Render hosts the public HTTPS entry point, existing
Node 22 web/API and persistent telephone processes. The web/API service serves
the built React interface directly; the account model and existing Supabase
database stay intact. This section governs the current target; the Vercel
sequence below remains a legacy rollback procedure. The Blueprint describes
desired configuration; do not assume every declared resource has been created
or every readiness gate has passed.

`render.yaml` starts with two 0.5 CPU / 512 MB always-on services in Ohio and
two 0.5 CPU / 512 MB cron services. Creating these resources incurs Render
charges; the initial web/voice compute is $14/month combined on the free Hobby workspace. Cron services have separate usage charges and a $1/month minimum each; create them only with an approved budget and keep execution disabled until scheduler cutover is verified. Validate memory, CPU and concurrent real calls before expanding traffic. No
database is provisioned and no migration runs during build. All auto-deploys are
off. API traffic, voice admissions, checkout, number provisioning and schedules
start disabled. Configure the existing credentials in Render's secret store;
preserve JWT signing, vault encryption, OAuth and MCP secrets. Do not import
Vercel environment metadata or AI Gateway credentials. Render disables the
Gateway transport and uses the existing direct OpenAI/Gemini routes.

Attach `botbound.app` directly to the `botbound-api` Render web service. Keep
customer, provider and database credentials in Render's server-side secret store.
The two cron callers authenticate to the API with the existing `CRON_SECRET`;
the voice worker retains its separate service authentication.

All background work (post-call digests, callbacks, alerts, retention, number
reclamation) runs only through the jobs-sweep cron, and the crons refuse to run
while their commit differs from the API's. Deploy both crons right after the
API. Nothing inside BotBound notices when the sweep stops, so give each cron an
optional `CRON_HEARTBEAT_URL` (an HTTPS check-in URL from a dead man's switch
monitor such as Healthchecks.io). A cron checks in after each run that did work.
Set the jobs-sweep check to a 1-minute period with about 5 minutes of grace,
and the daily-brief check to 15 minutes with about 30 minutes of grace. Route
the monitor's alert to a phone.

Render API requests require an enabled, production, main release with a valid
Render source SHA. The supervisor WebSocket upgrade applies the same deployment
gate and retains its session authentication. `/healthz` is a non-probing liveness endpoint that exposes
release identity and traffic state; it does not establish provider or database
readiness. Public client files are served from `dist/client`; server bundles and
release metadata are outside that directory. Build/start wrappers bind the
artifact role and SHA to Render's actual source revision. Never fake Vercel
variables to satisfy a release gate.

For a Render release or traffic cutover:

1. Run the existing full local verification and obtain review for the exact
   candidate. Preserve named CI failures. Use exact-source Render web and worker
   deployments for this target instead of a Vercel preview.
2. Follow the environment setup order below. With traffic closed, verify API
   `/healthz`, authenticated worker `/readyz`, database health and external
   read-only provider checks. API health, account, callback and streaming tests
   require a controlled opening of the traffic gate;
   production call proof also requires the worker admission gate. Record these
   deliberate verification windows and close the gates again if proof fails.
   A green liveness response alone is insufficient.
   Before changing the MCP issuer/resource origin, keep the old API's traffic
   disabled and inspect authorization codes, access tokens and refresh tokens
   read-only with complete database visibility. The `.app` cutover requires an
   empty grant inventory. Record all three counts and the closed-traffic source
   identity; keep the old release closed until the new origin is deployed.
   If any grants exist, stop this cutover and review an explicit client/token
   transition or obtain consent for reconnection. Never silently rewrite token
   audiences or accept the old resource at the new origin. Null-resource startup
   backfills do not migrate grants already bound to `https://botbound.me/mcp`.
   Audit saved founder showcase prompts before opening the new release. The
   explicit data migration `node scripts/migrations/2026-09-25-showcase-domain.mjs
   --user-id <audited-founder-uuid>` previews the exact managed handoff-sentence
   refresh. After full verification, promotion and closed-traffic deployment,
   rerun with `--apply --expected-source <full-reviewed-sha>`. Run `db:health`
   first and use the authorized production database connection. The migration
   verifies the clean reviewed main source and closed Render traffic, locks and
   compares saved rows, changes only the known sentence, and versions the data
   refresh. Custom text and other settings remain intact. Any unfamiliar old
   domain instruction blocks application for manual review. Auth bootstrap
   continues to leave existing showcase rows unchanged.
   The same explicit migration refreshes an exact `https://botbound.me` website
   default on founder-fleet Bots; custom website paths require manual review.
3. Keep the new cron jobs disabled while the legacy scheduler runs. Stop the
   old scheduler and wait for outstanding executions before enabling the new
   sweep and daily-brief schedules independently. A cron HTTP timeout does not
   cancel backend work. Deploy each scheduler with its role-specific build/start
   wrapper at the same SHA as the API. Its release manifest is checked before
   startup; enabled runs verify API identity and send an expected-revision
   header that the API checks again before executing the job.
4. Attach `botbound.app` to the Render web/API service and follow the DNS handoff
   below. Apply Render's required records at the new authoritative DNS provider,
   then verify certificates, canonical origin,
   OAuth/MCP, health, source identity and runtime errors. Enable
   `BOTBOUND_TRAFFIC_ENABLED` only for the certified main release; retain existing
   business launch restrictions until their normal proofs pass.
5. After authenticated worker readiness and web/worker parity pass, enable
   `WIRELINE_VOICE_WORKER_ADMISSIONS_ENABLED=true` for the controlled real call
   proof. Keep broad call admission closed until that proof passes. Retire the
   old host and scheduler after verification and draining; retain a deliberate
   rollback path during the migration window.
6. After the manual Render promotion is live, dispatch the **Production visual
   QA** GitHub Actions workflow from `main`, supplying the full deployed commit
   as `release_sha`. It checks out and verifies that exact source against
   `botbound.app`. A push to `main` does not trigger this capture because Render
   auto-deploy is disabled. Retain any credential or runner billing blocker as
   an unresolved verification item; never treat a skipped capture as passing.

For every voice deployment **or configuration/Blueprint update that replaces the
process**, run `node deploy/render/drain-voice.mjs` against the old worker with
`VOICE_DRAIN_EXPECTED_REVISION` set to its verified SHA. Wait for authenticated
drain evidence with `active=0` and `pending=0` before starting the replacement.
If observation is interrupted, rerun the command with the same expected SHA.
Authenticated `/drain` retains source and duration metadata while `/readyz`
returns 503; the command resumes observation without reopening admissions.
Missing or changed identity fails closed and requires operator investigation.
Render permits at most 300 seconds after SIGTERM by default configuration; that
does not protect a 60-minute active call. `/livez` remains healthy during drain
and is the Render health check; `/healthz` continues to describe admission
readiness. This single-worker configuration pauses new admissions during drain.
Platform maintenance can still interrupt connections; seamless continuity is
not asserted by this deployment configuration.

Run `npm run launch:status -- --output artifacts/launch-status.json` from the clean
release checkout with the approved production probe credentials. The command
defaults to Render, checks API source identity and traffic state, and requires
the authenticated voice-worker source, signing and duration proof. Missing
credentials remain unverified blockers; a public liveness response is not a
substitute. `--provider vercel` is only for an explicitly selected legacy rollback.
This report does not establish scheduler execution, real-call success, capacity
or alert delivery; retain those separate proofs with the release.

The protected SLO monitor evaluates queue depth and time overdue from `run_at`.
More than 50 pending jobs or a job over 10 minutes overdue is a warning; more
than 200 pending jobs or a job over one hour overdue is critical. Verify both
scheduler execution and retry errors when either threshold is reached, even
when the backlog is small. A future scheduled job is not overdue.

On persistent hosts, daily-brief claims are not reclaimed by age while an older
handler might still be running. An unresolved claim after a crash needs explicit
operator recovery only after the original process is confirmed stopped and the
provider outcome inspected. Preserve `dailyBriefLastAttemptAt`; clearing it
together with the dispatch claim could resend an ambiguously accepted message.

#### Environment import and setup order

`.env.example` is an inventory, not an export of production values. Import from
the existing approved secret store without printing values or committing an
environment file. `sync: false` in `render.yaml` requests a value at initial
creation; later additions require explicit Dashboard configuration. Preserve
configured optional providers and runtime overrides when they serve an existing
workflow, but do not populate currently unconfigured integrations just to fill
every placeholder.

| Group                           | Setup and destination                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing data and identity      | Preserve `POSTGRES_URL`, `DATABASE_POOL_URL`, `INTERNAL_JWT_SECRET`, `WIRELINE_DATA_KEY`, `OAUTH_STATE_SECRET`, `OAUTH_BRIDGE_SECRET` and `MCP_OAUTH_TOKEN_PEPPER` on the API. Copy the current effective JWT signing value, including when the old deployment used the legacy alias. The worker inherits its declared subset through `fromService`. Changing these values can invalidate sessions or make stored OAuth/mailbox credentials unreadable. |
| Existing service authentication | Preserve `CRON_SECRET`, `HEALTH_MONITOR_TOKEN` when configured, and `WIRELINE_VOICE_WORKER_SECRET`. Only generate a missing independent worker or monitor secret if no deployed peer relies on an existing value; configure both sides before use.                                                                                                                                                                                                      |
| Provider continuity             | Preserve OpenAI keys/project/webhook secret, Twilio account/API/auth values and SMS sender, Stripe secret/webhook/publishable keys and current price IDs, Upstash URL/token, Resend sending/signing values, AgentMail credential/domain and owner escalation settings. Existing previous-OpenAI-key drain slots must survive until their calls and recovery work settle.                                                                                |
| Connected optional features     | Import complete configured OAuth credential pairs, APNs/FCM groups, CRM, commerce, calendar, research and messaging integrations. Preserve per-account encrypted tokens in the existing database. Leave Federal DNC unconfigured until registration is complete; marketing/campaign outbound stays closed. Preserve any reviewed model, duration, reserve and concurrency overrides on both API and worker where used.                                  |
| Metadata and excluded values    | Render supplies `RENDER`, `IS_PULL_REQUEST` and `RENDER_GIT_*`; never manufacture them. The verified start wrapper derives worker/expected revision values. Do not import `VERCEL*`, AI Gateway credentials, preview database values, E2E passwords, or retired LiveAvatar/HeyGen credentials into this target. Reserved `VITE_SUPABASE_*` values are not required by current production code.                                                          |

1. Configure the Render production group and API secrets. Keep
   `BOTBOUND_TRAFFIC_ENABLED=false`, `WIRELINE_VOICE_WORKER_ADMISSIONS_ENABLED=false`,
   both `RENDER_CRON_ENABLED=false`, `WIRELINE_SELF_SERVE_BILLING_ENABLED=false`,
   `WIRELINE_LAUNCH_DEMO_MODE=true`, `WIRELINE_AUTO_PROVISION_NUMBERS=false` and
   `LAUNCH_HARD_GATE=true`. Live credentials belong only to this production
   environment. These gates are independent; opening API traffic does not
   authorize checkout, schedules or telephone admission.
2. Use the assigned HTTPS API `*.onrender.com` origin for `BOTBOUND_BACKEND_ORIGIN`.
   Keep that Render subdomain enabled while cron callers use it.
   Set API `WIRELINE_VOICE_WORKER_URL` to the
   separate HTTPS voice origin. Retain canonical `APP_URL`, `CORS_ORIGINS` and
   `TWILIO_WEBHOOK_BASE_URL` as `https://botbound.app`. Existing provider webhook
   URLs and registered OAuth redirects retain that canonical origin.
3. Verify all `fromService` references, including worker credential parity and
   each cron's `CRON_SECRET` and API origin. Deploy the matched,
   reviewed API/worker source. Run provider preflight from a secure operator
   environment with `WIRELINE_EXPECTED_SOURCE_REVISION` set to that exact SHA
   and `WIRELINE_RECONCILE_STRIPE_PORTAL=true`; this is a read-only confirmation,
   not a build-time mutation or a checkout switch. Then perform the controlled
   proof and scheduler/domain handoff described above. Keep existing billing,
   tax and outreach launch restrictions until their separate evidence passes.

#### Domain and DNS handoff

The new `botbound.app` domain uses Porkbun DNS. Keep that delegation and update
records in its existing zone; hosting the application on Render does not require
moving its nameservers. The legacy `botbound.me` domain remains a separate Vercel
DNS recovery task. Its nameserver migration is not required to launch `.app`.

If changing authoritative DNS for the legacy domain later, first inventory the
complete live zone and prepare matching records at the selected registrar DNS
or independent authoritative DNS provider. Preserve MX, SPF, DKIM, DMARC, CAA,
provider-verification records and unrelated subdomains; retain a redacted rollback
record of the old delegation and web routing. Do not retire Vercel DNS while
resolvers still depend on it.

1. Add the apex `botbound.app` as a custom domain on `botbound-api` in Render.
   Review the generated `www` alias/redirect and required DNS values. Use the
   apex as the canonical application origin.
2. Add the provider-issued `.app` mail records and Render web records to the
   existing Porkbun zone. Preserve its existing mail and provider records; do
   not substitute domain-specific records from `.me`. Follow Render's instructions
   for the chosen DNS provider;
   remove conflicting old web records and `AAAA` records only for hostnames
   moving to Render. Preserve unrelated records. Check existing CAA policy
   permits Render's certificate authorities.
3. Verify the `.app` records against its assigned Porkbun nameservers. No
   nameserver replacement is needed for this cutover. For a later authoritative
   DNS migration of another domain, verify the staged zone before changing the
   registrar delegation. Coordinate existing DNSSEC/DS records with that DNS
   provider's migration procedure; an old DS value must not invalidate the new
   zone. Only then set that domain's new provider-assigned nameservers.
4. Verify public delegation and record propagation, then complete domain
   verification in Render and verify issued TLS, HTTPS redirects, application
   source SHA, signed webhooks, OAuth/MCP callbacks, email DNS and actual inbound
   mail delivery. Keep the previous application and DNS available through the
   propagation/rollback window, with only one active cron scheduler.

Render retains the service's `onrender.com` origin alongside the custom domain.
The cron configuration uses that origin, so disabling it would stop scheduled
requests. Follow [Render custom domain setup](https://render.com/docs/custom-domains)
and its [DNS provider instructions](https://render.com/docs/configure-other-dns)
for current record and certificate requirements. No DNS or domain change is
performed by committing this Blueprint.

References: [Render deployment lifecycle](https://render.com/docs/deploys),
[Render WebSockets](https://render.com/docs/websocket), and
[Render cron billing and behavior](https://render.com/docs/cronjobs).

The next release target is a controlled design-partner pilot. This runbook is not launch approval: admission remains closed until the exact release, funded providers, persistent voice worker and founder workflow proof pass the gates below. Paid media, broad invitations, cold outbound, and regulated-data onboarding remain closed until one real checkout lifecycle, one consented non-demo inbound call, support handling, repeat usage, and contribution margin are verified.

Public marketing describes capabilities and outcomes. Operational setup and release instructions belong in the product and this runbook.

A Bot must pass a private browser test before directing customer traffic to it. Free Builder stays private; an active paid account chooses its number in Phone setup, then managed mailbox setup runs within plan capacity. Background repair may restore an already-owned line but cannot choose or purchase a new number. That background setup is not proof that its knowledge or customer workflow is ready.

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

The numbered Vercel deployment steps in this section describe the legacy
production/rollback path. For direct Render, use the target-specific sequence
above while retaining the same source, review, schema and provider proofs.

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

Twilio funding follows actual usage; there is no fixed prepaid launch reserve.
The launch diagnostic requires a verified, finite, positive USD balance and the
configured daily and monthly usage alerts. Empty balances and unreadable funding
remain separate blockers. The founder may replenish credit manually as usage
grows. This funding policy does not replace carrier, consent, DNC, or real-call
verification requirements.

From a secure operator environment containing the canonical production configuration, run:

```bash
WIRELINE_RECONCILE_STRIPE_PORTAL=true \
  node scripts/run-release-provider-preflight.mjs
```

This command is read-only. It verifies provider readiness, authenticated worker readiness, the managed Stripe Customer Portal, Stripe webhook coverage, and the Resend negative-delivery webhook contract. It must not contain or invoke an `--apply` path. Worker verification expects `WIRELINE_EXPECTED_SOURCE_REVISION`, otherwise `VERCEL_GIT_COMMIT_SHA`, otherwise the local Git HEAD; set the expected exact release explicitly when those environments differ.

For a local Render operator preflight, supply `NODE_ENV=production`, the canonical
`APP_URL` and current production provider credentials directly, including
`STRIPE_SECRET_KEY`. Do not copy platform metadata into the local environment or
manufacture Render/Vercel deployment identity. Stripe webhook verification uses
the supplied key without contacting Vercel. Local portal verification is read-only;
explicit portal repair must run in the verified Render production API service
(including its Render Shell), or in the canonical legacy Vercel project. The
Render command checks `dist/render-release.json` against the host's `main` branch
and full `RENDER_GIT_COMMIT`; it does not depend on process-local variables set
inside the running server.

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
4. Wait for the exact deployment to reach `READY` and own `botbound.app`.
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
GET https://botbound.app/api/health -> 200 { ok: true }
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
- exact-head deployment verification for the selected target: Render web/worker
  artifact and served-source parity, or Vercel `READY` for its legacy path;
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

A caller the Bot cannot take (another call in progress, included minutes used, a daily limit, or a failed bridge) is logged in Calls History with the reason. The owner's email alert is queued with that row as a `missed_call_owner_alert` job, so a failed send is retried, at most ten alerts per account per hour. Without a human fallback number the call then ends. `WIRELINE_MISSED_CALL_VOICEMAIL_ENABLED=true` instead offers voicemail (`<Record>`, transcribed up to two minutes), which upgrades that History row and emails the recording. The alert then waits four minutes and is sent only if no voicemail was left, so a caller who hangs up still reaches the owner. Voicemail records the caller, so review state recording-consent rules before enabling it.

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

`botbound.app` is the canonical transactional and mailbox domain. Production defaults to `BotBound <noreply@botbound.app>`. `trywireline.com` may remain verified only as an explicit rollback asset; it is not the runtime fallback.

Resend must retain verified SPF/DKIM and the negative-delivery webhook. AgentMail must retain the intentional support, security, DMARC, and unsubscribe inboxes. Test inbound, support reply, DMARC ingestion, and unsubscribe handling without exposing message contents in logs.

### OpenAI and the hosted browser (cloud computer)

The cloud computer stays off, and `/computer` says it is being set up, until the API service has `OPENAI_API_KEY` and `CLOUD_COMPUTER_BROWSER_WS_URL` and migration `0176_cloud_computer_tasks` is promoted. PDF, Word, and Excel Knowledge uploads use the same OpenAI key through the Responses API. The browser endpoint must be an isolated hosted-browser vendor over `wss://`; never point it at a browser inside BotBound's network. Choose a vendor whose browsers cannot reach private, loopback, or cloud-metadata addresses: BotBound screens navigation and blanks any tab that lands on a private address, but a hostile page's redirects, WebSockets, and workers are only fully contained by the vendor's network. The URL usually carries the vendor token, so treat it as a secret and keep it out of previews.

Before announcing the feature, run one owner task end to end on production: start a task on a paid test account, watch the live screen, take control at an `ask_owner` checkpoint, complete a safe sign-in on a test site, return control to the Bot, stop a second task midway, and confirm the AI allowance ledger shows `computer.browse` entries that settle. Confirm owner-entered values do not appear in task activity, page snapshots, or the redacted screenshot the Bot receives after control returns. `CLOUD_COMPUTER_MODEL` defaults to `gpt-5.6-terra`; select an allow-listed model only after checking its current cost against the account allowance. `CLOUD_COMPUTER_MAX_CONCURRENT` caps browsers per process (default 3). Keep the API at one instance: running tasks live in that process.

### Supabase

All public tables must remain under RLS. Promotion uses append-only Drizzle migrations and verifies the exact journal plus schema effects. BotBound's application ledger is `drizzle.__drizzle_migrations`; the Supabase dashboard's separate migration history may show an older number and is not a reason to replay already-applied DDL. Do not infer safety from a successful rebase or either ledger alone; compare the committed Drizzle journal, the live Drizzle ledger, and concrete schema objects. See [DATABASE_OPERATIONS.md](./DATABASE_OPERATIONS.md#the-migration-journal-is-not-the-whole-history).

BotBound uses its own authentication, not Supabase Auth. Before broad signup acquisition, verify that the deployed BotBound signup and reset flows enforce the HIBP password check and fail closed when screening is unavailable (`src/lib/breached-passwords.ts`). A Supabase Auth leaked-password advisor is not evidence about BotBound's custom auth controls; changing that setting does not certify these flows.

## Self-serve billing control

Self-serve billing is authorized only when all of these align:

1. `WIRELINE_SELF_SERVE_BILLING_ENABLED=true`;
2. `WIRELINE_LAUNCH_DEMO_MODE=false`;
3. Render production identity: explicit `WIRELINE_DEPLOYMENT_ENVIRONMENT=production`, automatic `RENDER=true` and `IS_PULL_REQUEST=false`;
4. automatic `RENDER_GIT_BRANCH=main` and a valid full `RENDER_GIT_COMMIT` matching the certified artifact;
5. the exact release passed provider, schema, artifact, and production verification;
6. the approved cohort and lifecycle evidence are documented.

Legacy Vercel rollback uses `VERCEL_ENV=production` and `VERCEL_GIT_COMMIT_REF=main`
instead of the Render identity fields. Mixed provider metadata is rejected.
A boolean alone never authorizes Preview, a feature branch, another host/project,
or acquisition traffic. Render API traffic additionally requires its own enabled
production-main traffic gate.

To close paid checkout, set `WIRELINE_SELF_SERVE_BILLING_ENABLED=false`, redeploy Production at the intended source SHA, and verify that paid routes fail closed with the customer-safe `BILLING_LAUNCH_NOT_APPROVED` response.

## Rollback and incident response

Determine whether the incident is code, environment, schema, or provider state before acting. A Vercel rollback does not reverse database migrations or external-provider mutations.

For a voice incident, stop new admission to the affected worker and preserve active calls where possible. Roll web and worker back to a compatible reviewed pair; do not terminate the old worker until it drains. Inspect pending claims and durable post-call recovery before retrying uncertain provider actions. A healthy replacement does not recover the media or transcript of a crashed call.

Prefer backward-compatible, append-only schema changes. After rollback, verify the production alias, health endpoint, served source SHA, affected route, provider behavior, and runtime-error stream. Record evidence and the forward fix in [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md).
