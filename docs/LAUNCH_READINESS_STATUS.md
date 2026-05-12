# Wireline Launch Readiness — Implementation Status

This document tracks the implementation of the pre-launch security and operational readiness items from the comprehensive launch plan.

**Last audited: 2026-05-12 — all 10 top-priority items complete. CI guard false positives resolved.**

---

## ✅ Completed (10 of 10 Top Priority Items)

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

### 6. ✅ Implement Account Data Export and Deletion (GDPR/CCPA) — Phase 1.5 COMPLETE
**Status:** COMPLETE including 30-day grace period  
**Implementation:**
- `POST /api/account/export` — exports all user data from 30+ wireline_* tables as JSON
- `DELETE /api/user/account` — initiates soft-delete with 30-day grace period
- `POST /api/account/cancel-deletion` — revokes pending deletion request
- `wireline_deletion_queue` table in `supabase_schema.sql` (2026-05-12 migration)
- `purge_deleted_account` job type — background worker hard-deletes after grace period
- Tests: `src/routes/__tests__/account-deletion-routes.test.ts`

**Impact:** GDPR/CCPA compliance — users can export and delete their data with a 30-day recovery window

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

## ✅ Completed (10 of 10 Top Priority Items)

### 10. ✅ Code Quality Infrastructure (ESLint + Prettier + Husky + Decompose server.ts)
**Status:** COMPLETE
- 28 router modules extracted into `src/routes/*` (agent, audit, billing, calendar, campaign, carrier, claude, compliance, contact, daily-brief, dashboard, drive, email, fleet, health, insights, intake, job, knowledge, oauth, openapi, outbound, qa, quota, settings, soc2, vapi, webhook).
- `server.ts` reduced from ~11,000 LOC → **281 lines** (app composition only)
- ESLint + typescript-eslint + react-hooks: 0 errors, 1142 warnings (CI limit: 1200)
- Prettier + lint-staged + Husky pre-commit hooks: in place
- CI guard `scripts/check-user-id-inserts.mjs`: clean (false positives resolved 2026-05-12)

---

## 📋 Phase 1 Remaining Items (Beyond Top 10)

These are operator-side tasks (not code changes) or optional hardening:

### 1.2 Multi-tenant data-leak risk
- [x] Static analysis test (`scripts/check-user-id-inserts.mjs`) — DONE, runs in CI
- [x] False-positive exemptions added (2026-05-12) — all inserts verified correct
- [ ] Migrate sequential string PKs to UUIDv4 — optional hardening, not a blocker

### 1.4 Verify Supabase PITR is enabled
- [ ] **Operator task:** Log into Supabase dashboard and confirm PITR is enabled
- [ ] Document retention period (7 days Pro, 30 days Enterprise)
- Runbook: `scripts/restore-drill.md`

### 1.5 GDPR/CCPA
- [x] Data export — DONE
- [x] Data deletion + 30-day soft-delete grace period — DONE (Phase 1.5 complete)
- [x] Data-retention TTL purge — DONE (item #7)
- [ ] PII-redaction option — optional future hardening

### 1.7 Logging & Correlation
- [x] Request-ID propagation — DONE (item #5)
- [ ] **Operator task:** Wire structured logs to a sink (Datadog/Logtail/Axiom) — requires `SENTRY_DSN` env var or equivalent; Sentry is already wired when DSN is set

### 1.8 Backup & DR Runbook
- [x] PITR runbook — DONE (`scripts/restore-drill.md`)
- [ ] **Operator task:** Run actual restore drill once before launch

---

## 🎯 Summary: Pre-Launch Checklist

Before accepting the first paying customer:

- [x] 1. Lock CSP (no unsafe-*)
- [x] 2. Tenant-isolation integration test (static + runtime — both axes covered)
- [x] 3. PRODUCTION_CHECK=1 deploy gate
- [x] 4. CodeQL + Gitleaks + blocking audit
- [x] 5. Request-id propagation (log sink wiring is operator-side configuration)
- [x] 6. Account export/deletion (export + soft-delete grace period — Phase 1.5 complete)
- [x] 7. Data-retention TTL purge job
- [x] 8. Vercel cron entries
- [x] 9. PITR restore drill documentation (operator must run drill)
- [x] 10. ESLint + Prettier + decompose server.ts (server.ts → 281 lines; all routes extracted)

**Bonus: ✅ Public OpenAPI 3.1 spec** served at `GET /api/openapi.json`
(`src/lib/openapi-spec.ts`, `src/routes/openapi-routes.ts`). Unlocks
auto-generated client SDKs, partner onboarding, contract tests, and
AI-agent framework consumption (Claude Desktop, Cursor, custom GPTs).

**10 of 10 complete.** Remaining items are operator-side tasks (PITR drill, Redis/Sentry config, log sink).

---

## 🚀 Next Steps (Operator Tasks)

1. **Run the PITR restore drill** (not code) — follow `scripts/restore-drill.md`
2. **Verify Supabase PITR is enabled** in the Supabase dashboard
3. **Configure Upstash Redis** (`UPSTASH_REDIS_REST_URL` + token) for distributed rate limiting in production
4. **Configure Sentry** (`SENTRY_DSN` + `VITE_SENTRY_DSN`) for error monitoring
5. **Phase 2** — E2E tests, billing completeness, observability dashboard

---

## 📚 References

- CSP test: `src/__tests__/csp-security.test.ts`
- Cron test: `src/__tests__/job-queue-monitoring.test.ts`
- PITR runbook: `scripts/restore-drill.md`
- Audit exemptions: `.audit-exemptions`
- Security workflows: `.github/workflows/codeql.yml`, `.github/workflows/gitleaks.yml`
- Account deletion tests: `src/routes/__tests__/account-deletion-routes.test.ts`
