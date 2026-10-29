# BotBound Flawless Launch Roadmap & Cutover Runbook

**Document Version**: 1.0.0  
**Effective Date**: 2026-10-29  
**Target Production Origin**: `https://botbound.app`  
**Execution Target**: Render (Web/Worker/Cron), Supabase (PostgreSQL 15/16), Vite 6 (SPA)  
**Classification**: Operational Blueprint & Cutover Standard  

---

## 1. Executive Objective

The objective of this roadmap is to execute a flawless, zero-downtime, fully verified production launch of BotBound. This document coordinates all prioritized remediations (P0/P1/P2), cross-service dependencies, pre-flight environment validations, and exact timeline procedures for the production cutover.

---

## 2. Prioritized Remediation Framework

### 2.1. P0 Blockers — Launch Critical (Pre-Deployment Invariants)
*Must be 100% resolved and verified before initiating any production release step.*

| Task ID | Component | Description | Resolution Status | Verification Gate |
|---|---|---|---|---|
| **P0-1** | `takeover-alerts.ts` | Fix `schema.users.phoneNumber` non-existent column query and `smsResult.messageSid` mismatch. | **RESOLVED** | `npm run lint:server` (Code 0) |
| **P0-2** | `agent-runtime-helpers.ts` | Fix union type inference in `computerNames` & `selectedComputerNames` sets with explicit `<string>`. | **RESOLVED** | `npm run lint:server` (Code 0) |
| **P0-3** | `gemini-media-bridge.ts` | Cast `RESOLVED_GEMINI_LIVE_MODEL as GeminiLiveModel` in `prepareGeminiLiveSessionConfig`. | **RESOLVED** | `npm run lint:server` (Code 0) |
| **P0-4** | `lead-hunter-routes.ts` | Wrap Zod schemas with `{ body: ... }` object matching `ValidationSchemas` middleware signature. | **RESOLVED** | `npm run lint:server` (Code 0) |
| **P0-5** | `voice-bridge.ts` | Remove em-dash `—` from `HOLD_TAKEOVER_FILLERS` line 71 to comply with founder brand copy rule. | **RESOLVED** | `npm run design:check` (Code 0) |
| **P0-6** | Database Pool Headroom | Eliminate un-pooled concurrent connection spikes by serializing tenant snapshot queries within single Drizzle transactions. | **RESOLVED** | `verify:contracts` (411/411 passed) |
| **P0-7** | Serverless Import Safety | Verify server bundle loads cleanly in container environments where database strings are not yet bound. | **RESOLVED** | `npm run smoke:server` (Code 0) |

### 2.2. P1 Compliance, Security & Data Integrity
*Required for customer onboarding, legal compliance, and transactional safety.*

| Task ID | Component | Operational Requirement | Configuration & Action |
|---|---|---|---|
| **P1-1** | Twilio Lookups v2 & Landline Filter | Ensure all outbound voice/SMS calls screen carrier line type via Lookups v2. Landlines must be rejected for SMS without balance waste. | Handled in `src/lib/twilio-service.ts`. Covered by contract tests. |
| **P1-2** | TCPA & Spoken Disclosure | Ensure inbound and outbound voice calls play audible recording disclosures and AI caller identification within the first message. | Handled in `src/routes/twilio-voice-routes.ts` and agent prompts. |
| **P1-3** | CAN-SPAM Postal Address | Verify that every commercial email sent through Resend includes a valid physical postal address and unsubscribe mailto header. | Enforced by `WIRELINE_POSTAL_ADDRESS` and `WIRELINE_UNSUBSCRIBE_MAILTO`. |
| **P1-4** | AgentMail Domain Reputation | Ensure bot email inboxes are provisioned exclusively on verified subdomains (`bots.botbound.app`), never on the apex domain. | Enforced by `AGENTMAIL_DEFAULT_DOMAIN="bots.botbound.app"`. |
| **P1-5** | Stripe Webhook Cryptographic Verification | Ensure all incoming Stripe events are verified with `STRIPE_WEBHOOK_SECRET` before updating customer status or confirming voice sessions. | Enforced in `src/routes/stripe-routes.ts`. |
| **P1-6** | Autonomous Goodwill Wallet Policy | Verify hard upper bounds on autonomous bot refunds ($100/month discretionary cap, $25/resolution max). | Enforced in billing policy manager. |

### 2.3. P2 Operational Hardening & Scalability
*Ensures high availability, fault tolerance, and zero-downtime operations under load.*

| Task ID | Component | Operational Procedure |
|---|---|---|
| **P2-1** | Zero-Downtime Voice Drain | Always execute `node deploy/render/drain-voice.mjs` before deploying a new revision to `botbound-voice`. Wait for active calls to reach zero. |
| **P2-2** | Upstash Redis Distributed Rate Limiting | Guard against brute-force attacks and abuse across API endpoints using Upstash Redis REST token bucket limiter. |
| **P2-3** | Browserbase Concurrency Isolation | Mirror confirmed appointments via `wireline_jobs` background worker, preventing browser automation from blocking active voice streams. |
| **P2-4** | Render Cron Synchronization | Disable all legacy Vercel crons permanently; ensure only Render owns cron scheduling (`RENDER_CRON_ENABLED=true`). |

---

## 3. Environment Prerequisites & Service Dependencies

Before opening production traffic on `botbound.app`, verify the readiness of all external dependencies:

```
[Supabase PostgreSQL]
  ├── Port 5432: Session migrations executed (`npm run db:migrate`)
  ├── Port 6543: PgBouncer pooler active, max connections verified
  └── RLS: Enabled on all tables; wireline_server role operational
         │
[Render Blueprint (render.yaml)]
  ├── botbound-api: Web service, Ohio region, port 10000
  ├── botbound-voice: Persistent Web service, Ohio region, manual deploy
  ├── botbound-jobs-sweep: Cron service, schedule "* * * * *"
  └── botbound-daily-brief: Cron service, schedule "*/15 * * * *"
         │
[Third-Party Service Mesh]
  ├── Twilio: Phone numbers mapped to https://botbound.app/api/twilio/voice
  ├── Stripe: Live catalog active, webhook pointed to /api/stripe/webhook
  ├── Resend: botbound.app DNS records verified (DKIM, SPF, DMARC)
  ├── AgentMail: Dedicated inboxes created on bots.botbound.app
  ├── Google Gemini: Live API key activated for gemini-3.8-live
  ├── xAI: Grok 4.7 reasoning engine key active
  └── Browserbase: Cloud browser project created and API key verified
```

---

## 4. Pre-Launch Verification Runbook

Execute the complete verification sequence in the exact order below. Every command must exit with code 0:

### Step 1: Design System & Brand Copy Guard
```powershell
npm.cmd run design:check
```
*Expected Output*: BotBound Clear System (10 modules) passed, Command Palette passed, Marketing viewport passed, No-em-dash check passed (1,232+ files).

### Step 2: TypeScript Server Compilation
```powershell
npm.cmd run lint:server
```
*Expected Output*: Exits with code 0. Zero compiler errors.

### Step 3: TypeScript Audit Modules Compilation
```powershell
npm.cmd run lint:audit-modules
```
*Expected Output*: Exits with code 0. Zero compiler errors.

### Step 4: Full Codebase Static Analysis
```powershell
npm.cmd run lint
```
*Expected Output*: Exits with code 0. Zero compiler errors.

### Step 5: Master Contract Regression Suite
```powershell
npm.cmd run verify:contracts
```
*Expected Output*: 49 passed test files, 411 passed unit tests.

### Step 6: Server Bundle Build & Import Smoke
```powershell
npm.cmd run build:server
npm.cmd run smoke:server
```
*Expected Output*: `dist/server.cjs` bundled cleanly; smoke test outputs: `server bundle imports without database configuration`.

### Step 7: Custom Voice Bridge & Mirroring Tests
```powershell
npx.cmd vitest run tests/voice-browserbase-bridge.test.ts tests/trade-portal-mirroring.test.ts
```
*Expected Output*: 2 passed test files, 27 passed tests.

### Step 8: Production Environment Readiness Probe
```powershell
npm.cmd run check-prod-env
```
*Expected Output*: Verifies that all required production environment variables are present and correctly formatted.

---

## 5. Cutover Timeline & Runbook

### Phase 1: T-Minus 24 Hours (Preparation & Staging)
1. **Code Freeze**: Freeze all non-launch pull requests on `main`.
2. **Database Backup**: Trigger manual backup snapshot on Supabase Dashboard.
3. **Environment Audit**: Review Render Secret Store against `docs/launch/ENVIRONMENT_VARIABLES_MATRIX.md`. Ensure all keys are populated.
4. **Third-Party Health Check**: Confirm status pages for Twilio, Stripe, Resend, AgentMail, Google Gemini, and Render.

### Phase 2: T-Minus 2 Hours (Infrastructure Synchronization)
1. **Render Blueprint Sync**: Deploy/sync `render.yaml` on Render Dashboard.
2. **Verify Database Connection**: Execute `npm run db:health` to confirm low latency and zero transaction-pool errors.
3. **Confirm DNS & SSL**: Verify TLS certificates for `botbound.app`, `api.botbound.app`, and `bots.botbound.app`.

### Phase 3: Cutover Window (T = 0)
1. **Promote Main Branch**: Merge reviewed launch commit to `main`.
2. **Monitor Auto-Deploy**:
   - `botbound-api` builds and deploys automatically via `autoDeployTrigger: commit`.
   - `botbound-jobs-sweep` and `botbound-daily-brief` crons deploy automatically.
3. **Deploy Voice Media Bridge (`botbound-voice`)**:
   - Run pre-drain script: `node deploy/render/drain-voice.mjs`
   - Wait until `active=0` and `pending=0`.
   - Manually trigger deploy of `botbound-voice` with the new commit SHA.
4. **Health Probe Verification**:
   - `GET https://botbound.app/healthz` -> Expect `200 OK`.
   - `GET https://botbound.app/livez` -> Expect `200 OK`.
   - `GET https://botbound.app/api/health/launch-readiness` (with `HEALTH_MONITOR_TOKEN`) -> Expect `100% Ready`.

### Phase 4: T-Plus 1 Hour (Live Operational Validation)
1. **Live Inbound Call Test**:
   - Dial a provisioned BotBound number.
   - Verify speech synthesis, barge-in response, and conversational status fillers.
2. **Live In-Call Deposit Test**:
   - Request deposit payment link during call.
   - Verify SMS receipt, complete test checkout, and confirm spoken receipt acknowledgement on the call.
3. **Live Appointment & Calendar Booking**:
   - Book an appointment during the call.
   - Verify 5-minute soft hold, confirmation SMS, and AgentMail email receipt containing the `.ics` calendar attachment.
4. **Trade Portal Background Mirroring**:
   - Inspect `wireline_jobs` to verify that the trade portal mirror job enqueued and completed without 409 conflict errors.

### Phase 5: T-Plus 24 Hours (Post-Launch Monitoring)
1. **Cron Execution Audit**: Verify `botbound-jobs-sweep` runs every minute with zero stale job backlogs.
2. **Stripe Webhook Delivery**: Confirm 100% 2xx delivery rate in Stripe Webhook Dashboard.
3. **Error Tracking**: Review Sentry dashboard to ensure error rate remains < 0.01%.

---

## 6. Rollback & Contingency Runbook

In the unlikely event of an unrecoverable P0 incident during cutover:

1. **Traffic Pause**: Set `BOTBOUND_TRAFFIC_ENABLED=false` in Render Dashboard to serve maintenance response.
2. **Voice Service Rollback**:
   - In Render Dashboard, navigate to `botbound-voice`.
   - Click **Rollback** to immediately reinstate the previous known-good deployment SHA.
3. **API Rollback**:
   - Rollback `botbound-api` to previous release SHA.
4. **Database State Invariant**:
   - Database migrations are strictly additive (no destructive drops). Rolling back code does not require rolling back database schema.
5. **Post-Mortem**: Document telemetry, Sentry logs, and provider responses before attempting redeployment.
