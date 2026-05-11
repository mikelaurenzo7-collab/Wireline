# Wireline Launch Readiness — Implementation Status

This document tracks the implementation of the pre-launch security and operational readiness items from the comprehensive launch plan.

---

## ✅ Completed (7 of 10 Top Priority Items)

### 1. ✅ Lock CSP — Remove unsafe-inline/unsafe-eval
**Status:** COMPLETE  
**PR Commits:**
- Removed `'unsafe-inline'` and `'unsafe-eval'` from script-src in `vercel.json`
- Added Cross-Origin-Opener-Policy, Cross-Origin-Resource-Policy, Origin-Agent-Cluster headers
- Created automated test in `src/__tests__/csp-security.test.ts` to enforce no unsafe-* directives
- Express's nonce-based CSP in `src/lib/csp.ts` remains the production source of truth

**Impact:** Blocks XSS attacks via inline script injection

---

### 3. ✅ Make PRODUCTION_CHECK=1 Deploy Gate
**Status:** COMPLETE  
**PR Commits:**
- Updated `.github/workflows/ci.yml` to run `PRODUCTION_CHECK=1` as a hard fail
- Added `WIRELINE_DATA_KEY` and `CRON_SECRET` to recommended vars in `scripts/check-prod-env.mjs`
- CI now fails if recommended vars are missing, preventing incomplete deploys

**Impact:** Prevents deploys with missing critical configuration (webhooks, cron auth, vault encryption)

---

### 4. ✅ Add Security Tooling (CodeQL + Gitleaks + Blocking Audit)
**Status:** COMPLETE  
**PR Commits:**
- Added `.github/workflows/codeql.yml` for TypeScript/JavaScript security scanning (weekly + on PRs)
- Added `.github/workflows/gitleaks.yml` for secret detection (weekly + on PRs)
- Created `scripts/check-audit-exemptions.mjs` to fail CI on unexempted high/critical npm vulns
- Added `.audit-exemptions` file for documented exceptions (reviewed quarterly)
- Dependabot was already enabled

**Impact:** Continuous security scanning catches vulnerabilities and leaked secrets before production

---

### 6. ✅ Implement Account Data Export and Deletion (GDPR/CCPA)
**Status:** COMPLETE (with documented Phase 1.5 TODO for grace period)  
**PR Commits:**
- Added `POST /api/account/export` endpoint that exports all user data from 30+ wireline_* tables as JSON
- Enhanced `DELETE /api/user/account` documentation with warnings and recovery procedures
- Documented TODO for 30-day soft-delete grace period (requires schema changes)

**Impact:** GDPR/CCPA compliance — users can export and delete their data

**Remaining Work (Phase 1.5):**
- Add `wireline_deletion_queue` table for soft-delete grace period
- Add cron job to execute deferred deletions
- Add `POST /api/account/cancel-deletion` endpoint

---

### 8. ✅ Define Vercel Cron Entries
**Status:** COMPLETE  
**PR Commits:**
- Added `crons` section to `vercel.json`:
  - `/api/jobs/sweep` runs every 5 minutes
  - `/api/insights/daily-brief/schedule` runs at 08:00 UTC daily
- Created `src/__tests__/job-queue-monitoring.test.ts` to verify cron config and document monitoring strategy

**Impact:** Job queue sweeps automatically on Vercel; no manual operator intervention needed

---

### 9. ✅ Document PITR Restore Drill
**Status:** COMPLETE (runbook provided; drill must be executed by operator)  
**PR Commits:**
- Created `scripts/backup-schema.sh` for on-demand schema backups
- Created `scripts/restore-drill.md` with step-by-step PITR restore procedure
- Documented RTO/RPO measurement methodology

**Impact:** Operator can measure and document RTO/RPO before launch; drill validates backup integrity

**Next Step:** Operator must run the drill once before launch and quarterly thereafter

---

## ✅ Additional Completions Since First Draft

(The original draft of this file under-reported progress. Verified against the codebase on 2026-05-11.)

### 2. ✅ Tenant-Isolation Integration Test
**Status:** COMPLETE
**Files:**
- `src/lib/tenancy-isolation.test.ts` — static analysis that scans `server.ts` for every `app.<verb>("/api/...")` and asserts authenticated routes touching `wireline_*` tables filter by `user_id`. Maintains an explicit `TENANCY_ALLOWLIST` for routes that legitimately cross tenants (intake-by-API-key, public catalogs, webhooks).
- `src/lib/tenant-isolation-integration.test.ts` — boots a representative Express app via supertest with two fixture users (USER_A, USER_B), a chainable Supabase-shaped mock that enforces `user_id` filters, and asserts cross-tenant isolation + IDOR prevention across agents, calls, settings, leads, and fleet tasks.

**Impact:** Both the static and runtime axes are guarded. Every new authenticated route is forced (at CI time) to scope by `user_id` or be allowlisted with a written justification.

---

### 5. ✅ Request-ID Propagation
**Status:** COMPLETE
**Files:**
- `server.ts:174-185` — Express middleware mints a request id (honoring inbound `X-Request-Id` if it matches `[A-Za-z0-9._-]{1,64}`, otherwise `randomUUID()`), stamps it on `res.locals.requestId`, and emits it as the `X-Request-Id` response header.
- `server.ts:240-257` — slow-request logger reads `res.locals.requestId` so every slow-path log line is correlatable.
- `src/lib/request-id.test.ts` — coverage.
- Audit logger and Sentry context wired through the same correlation id.

**Impact:** Every request gets a stable id end-to-end; client traces can flow through.

---

### 7. ✅ Data-Retention TTL Purge Job
**Status:** COMPLETE
**Files:**
- `supabase_schema.sql` — `wireline_purge_old_data` Postgres function + `retention_days_*` columns on `wireline_settings`.
- `src/lib/job-worker.ts:213` — `purge_old_data` job dispatches `db.rpc('wireline_purge_old_data', { p_user_id, p_retention_days })`.
- `src/lib/data-retention.test.ts` — JobType registration + retention-days validation coverage.
- `POST /api/account/purge-old-data` exposes a manual trigger; sweep schedules nightly purges.

**Impact:** GDPR/CCPA retention limits enforced, unbounded growth bounded. Minimum allowed retention is 90 days.

---

## 🚧 In Progress / Remaining

### 10. 🟡 Code Quality Infrastructure (ESLint + Prettier + Husky + Decompose server.ts)
**Status:** IN PROGRESS — 15 router modules already extracted into `src/routes/*` (agent, audit, campaign, compliance, fleet, health, insights, job, oauth, openapi, qa, quota, soc2, stripe, vapi). `server.ts` reduced from ~11,000 → 5,953 lines. ESLint config in place (`eslint.config.mjs`), Prettier in place (`.prettierrc`).
**Complexity:** VERY HIGH (remaining work refactors the still-large `server.ts`)

**What's Needed:**
1. ~~Install and configure ESLint + typescript-eslint + eslint-plugin-react + eslint-plugin-react-hooks~~ — done.
2. Install Prettier + lint-staged + Husky for pre-commit hooks (Prettier installed; lint-staged + Husky pending).
3. Continue decomposing `server.ts` into the remaining modules under `src/routes/`:
   - `auth.ts` — login, OAuth, signup
   - `agents.ts` — CRUD for agents, directives, knowledge
   - `calls.ts` — Vapi webhooks, call logs, signal presence
   - `claude.ts` — all `/api/claude/*` endpoints
   - `insights.ts` — topics, failure-modes, daily-brief
   - `intake.ts` — lead intake API
   - `billing.ts` — Stripe endpoints
   - `webhooks.ts` — outbound webhooks manager
   - `oauth.ts` — Google/Microsoft OAuth flows
   - `soc2.ts` — audit logs, role management
   - `quotas.ts` — quota checks
   - `jobs.ts` — job queue endpoints
4. Add ban-list rules:
   - `no-console` (use `log.*` instead)
   - Ban `as any` (write proper types)
   - Ban `req: any, res: any` (use typed Express handlers)

**Why It Matters:** Code quality prevents bugs; modular routes are easier to test and review

**Recommended Approach:**
- Split incrementally (one module per PR) to avoid giant diffs
- Extract shared types first: `src/types/server.ts` (AuthedRequest, RouteHandler<T>)
- Each module exports an Express Router; `server.ts` becomes app composition only
- Target: no file > 800 LOC (enforced via ESLint rule)

---

## 📋 Phase 1 Remaining Items (Beyond Top 10)

These are from the full Phase 1 checklist but not in the top-10 critical path:

### 1.2 Close the multi-tenant data-leak risk
- [ ] Static analysis test that fails the build if `db.from('wireline_*').insert()` omits `user_id`
- [ ] Migrate sequential string PKs to UUIDv4 (audit which tables, then ALTER)
- (Partially covered by tenant-isolation integration test in item #2)

### 1.4 Verify Supabase PITR is enabled
- [ ] Operator must log into Supabase dashboard and confirm PITR is enabled
- [ ] Document retention period (7 days Pro, 30 days Enterprise)
- (Documented in `scripts/restore-drill.md` but operator must verify)

### 1.5 GDPR/CCPA bare minimum
- [x] Data export — DONE
- [x] Data deletion — DONE (hard delete; soft-delete TODO for Phase 1.5)
- [ ] Data-retention policy — TODO (item #7 above)
- [ ] PII-redaction option — TODO (item #7 above)

### 1.7 Logging & Correlation
- [ ] Generate request-id — TODO (item #5 above)
- [ ] Wire structured logs to a sink — TODO (Datadog/Logtail/Axiom config)

### 1.8 Backup & DR Runbook
- [x] PITR runbook — DONE
- [ ] Operator must run actual restore drill once before launch

---

## 🎯 Summary: Pre-Launch Checklist

Before accepting the first paying customer:

- [x] 1. Lock CSP (no unsafe-*)
- [x] 2. Tenant-isolation integration test (static + runtime — both axes covered)
- [x] 3. PRODUCTION_CHECK=1 deploy gate
- [x] 4. CodeQL + Gitleaks + blocking audit
- [x] 5. Request-id propagation (log sink wiring is operator-side configuration)
- [x] 6. Account export/deletion (export done; soft-delete TODO for Phase 1.5)
- [x] 7. Data-retention TTL purge job
- [x] 8. Vercel cron entries
- [x] 9. PITR restore drill documentation (operator must run drill)
- [~] 10. ESLint + Prettier + decompose server.ts (~15 routers extracted; remainder ongoing)

**Bonus: ✅ Public OpenAPI 3.1 spec** served at `GET /api/openapi.json`
(`src/lib/openapi-spec.ts`, `src/routes/openapi-routes.ts`). Unlocks
auto-generated client SDKs, partner onboarding, contract tests, and
AI-agent framework consumption (Claude Desktop, Cursor, custom GPTs).

**9 of 10 complete; #10 actively in progress.** The remaining operator-side
items are the PITR drill execution and structured-log sink configuration.

---

## 🚀 Next Steps

1. **Merge this PR** to get the completed items into main
2. **Create follow-up issues** for items #2, #5, #7, #10
3. **Run the PITR restore drill** (operator task, not code) — follow `scripts/restore-drill.md`
4. **Phase 2 begins** after these 10 items are done (E2E tests, OpenAPI spec, billing completeness, observability)

---

## 📚 References

- Full launch plan: [problem statement in PR description]
- CSP test: `src/__tests__/csp-security.test.ts`
- Cron test: `src/__tests__/job-queue-monitoring.test.ts`
- PITR runbook: `scripts/restore-drill.md`
- Audit exemptions: `.audit-exemptions`
- Security workflows: `.github/workflows/codeql.yml`, `.github/workflows/gitleaks.yml`
