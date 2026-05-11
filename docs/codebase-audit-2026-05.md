# Wireline Codebase Audit — May 2026

## Scoreboard

| Dimension                    | Grade | Score |
|------------------------------|-------|-------|
| **Architecture**             | A−    | 91    |
| **Security**                 | B+    | 87    |
| **Code Quality / TypeScript**| B−    | 78    |
| **Test Coverage**            | B     | 82    |
| **CI / DevOps**              | B     | 83    |
| **Performance / Bundle**     | B+    | 85    |
| **Documentation**            | A−    | 90    |
| **Compliance (TCPA/SOC 2)**  | B+    | 86    |
| **Overall**                  | **B+**| **85**|

---

## 1. Architecture — A− (91)

### Strengths

- **Dual-provider design** (Claude primary, Gemini fallback) is well-documented
  and enforced by AGENTS.md constraints. Neither provider can be silently removed.
- **Modular service layer** in `src/lib/` with clean separation: `claude-brain`,
  `action-engine`, `tcpa-consent`, `tenant-quotas`, `job-queue`, `soc2-controls`,
  CRM adapters, Twilio, Apollo, DocuSign.
- **Route extraction** into `src/routes/` (15 routers) keeps domain boundaries
  visible: agents, campaigns, fleet, audit, insights, compliance, billing, etc.
- **Supabase RLS** + application-level `user_id` enforcement provides defense in
  depth for multi-tenant data isolation (plus a static test that parses
  `server.ts` for missing `user_id` scoping).
- **Job queue** (`job-queue.ts` / `job-worker.ts`) replaces inline blocking
  Claude calls with durable, retryable Postgres-backed jobs.
- **Integration registry** (`integrations-registry.ts`) is the single source
  of truth for every external service, mirrored into `.env.example`, README,
  OpenAPI, and the Admin health panel.

### Weaknesses

- **`server.ts` is a 6,024-line monolith.** Despite 15 extracted routers, the
  majority of route handlers, middleware wiring, and inline logic still lives in
  a single file. This is the single largest architectural risk: merge conflicts,
  cognitive load, and difficulty onboarding new contributors.
- **No controller/handler layer.** Routes mix HTTP concerns (parsing, status
  codes) with domain logic (DB queries, Claude calls). Extracting handlers into
  per-domain modules would reduce `server.ts` to ~500 lines of middleware +
  mounting.
- **`api/index.ts` re-exports the full Express app.** This works on Vercel but
  means cold-start pays for the entire monolith; no route-level code splitting
  on the server.

### Recommendations

1. **Extract remaining inline routes** from `server.ts` into domain routers
   (appointments, knowledge, settings, email, outbound, Claude recipes,
   dashboard, contacts, nav). Target: `server.ts` < 800 lines.
2. **Introduce a handler factory** for the auth → validate → execute → respond
   pattern to reduce boilerplate and enforce consistent error handling.

---

## 2. Security — B+ (87)

### Strengths

- **Auth middleware** (`authenticateUser`) validates JWT via Supabase on every
  protected route. Failures are audit-logged.
- **RBAC** via `createRbacMiddleware` / `requirePermission` with role hierarchy
  from `soc2-controls.ts`.
- **Webhook verification:** Stripe uses `constructEvent` (raw body); Vapi uses
  timing-safe compare; outgoing webhooks are HMAC-SHA256 signed.
- **Intake keys** are SHA-256 hashed at rest; plaintext shown only once.
- **Secret vault** (`secret-vault.ts`) uses AES-256-GCM with versioned envelope.
- **SSRF protection** at webhook registration: DNS resolution to reject private
  IPs (`webhook-validators.ts`).
- **CSP** is production-hardened; no `unsafe-inline`/`unsafe-eval` (tested).
- **Gitleaks + CodeQL** run in CI.
- **0 npm audit vulnerabilities.**

### Findings

| ID   | Severity | Finding |
|------|----------|---------|
| S-1  | **High** | Outbound webhook delivery reads `hook.secret` (null for vault-backed rows) instead of decrypting `secret_encrypted`. New webhooks are delivered **unsigned**. |
| S-2  | Medium   | `hostnameResolvesToPrivate` is defined but never called at delivery time — DNS rebinding after registration can redirect to internal IPs. |
| S-3  | Medium   | OpenAPI docs say `X-Wireline-Signature: sha256=<hex>`; code sends bare hex without prefix. Consumers following the docs will fail verification. |
| S-4  | Medium   | Quota enforcement is **fail-open** on DB/RPC failure — intentional for availability but allows quota bypass when counters break. |
| S-5  | Low      | Vapi webhook uses a single shared secret; any caller with the secret can trigger behavior for any known `agentId` UUID. |
| S-6  | Low      | `vite.config.ts` defines `process.env.GEMINI_API_KEY` for the client bundle. Currently unused client-side but risks leakage if a future import touches it. |
| S-7  | Low      | `ErrorBoundary` renders `error.message` in a `<details>` block — minor info leak if messages contain sensitive data. |

### Recommendations

1. **Fix S-1 immediately:** Update `attemptWebhookDelivery` to decrypt
   `secret_encrypted` via `decryptSecret` when `hook.secret` is null.
2. **Fix S-2:** Call `hostnameResolvesToPrivate` in `fetchWithTimeout` or at
   the delivery path.
3. **Fix S-3:** Prefix signature with `sha256=` to match docs.
4. **Document S-4** tradeoff explicitly; consider a circuit-breaker that
   switches to fail-closed after N consecutive RPC failures.

---

## 3. Code Quality / TypeScript — B− (78)

### Strengths

- **0 TypeScript errors** on `npx tsc --noEmit`.
- **0 ESLint errors** (793 warnings, all `no-explicit-any` or `no-unused-vars`).
- **No `@ts-ignore` or `@ts-expect-error`** anywhere in the codebase.
- **Zod** used extensively for input validation (`form-validators.ts`, `schemas.ts`,
  `action-types.ts`).
- **Strict pilot** via `tsconfig.strict.json` — intentional incremental rollout
  on security-critical modules (vault, RBAC, quotas, SOC 2).

### Weaknesses

| Finding | Detail |
|---------|--------|
| **793 ESLint warnings** | 100% are `no-explicit-any` or `no-unused-vars`. |
| **`server.ts`: 241 `any` usages** | Largest concentration. Express `req`/`res` and Supabase responses typed as `any`. |
| **`ClaudeRecipes.tsx`: 47 `any`** | All recipe results untyped. |
| **No generated DB types** | No `src/types/database.ts` from `supabase gen types`. All Supabase responses are `any`-cast at use sites. |
| **Large components** | 6 components exceed 800 lines; `ClaudeRecipes` (1,710), `OutboundDialer` (1,351), `AdminSettings` (1,311). |
| **Phone normalization** duplicated | `sanitizePhone` (vapi-helpers), `normalizePhoneTail` (contact-profile), `normalizePhone` (crm-service) — three implementations of similar logic. |
| **`pg` dependency unused** | Listed in `package.json` but no TypeScript imports. |

### Recommendations

1. **Generate Supabase types** (`supabase gen types typescript`) and replace
   `any` at DB boundaries. This alone eliminates ~100+ `any` usages.
2. **Expand `tsconfig.strict.json` include list** — add `claude-brain.ts`,
   `action-engine.ts`, `webhook-helpers.ts`, `stripe-helpers.ts`.
3. **Split large components:** `ClaudeRecipes` → per-recipe files;
   `AdminSettings` → tab components; `OutboundDialer` → list/dial/campaign
   subcomponents.
4. **Consolidate phone normalization** into `src/lib/phone.ts`.
5. **Audit `pg` dependency** — remove if truly unused or document why it's kept.

---

## 4. Test Coverage — B (82)

### Strengths

- **58 test files, 858 tests, all passing** in 10.3s.
- **Strong domain coverage:** `tenant-quotas` (extensive), `soc2-controls`,
  `claude-brain` (cost model), `form-validators`, `audit-routes` (supertest),
  `openapi-spec` (drift detection).
- **Innovative static tests:** `tenancy-isolation.test.ts` parses `server.ts`
  to enforce `user_id` scoping on authenticated routes.
  `production-readiness.test.ts` mirrors startup env validation.
- **Component smoke tests** mount heavy screens with mocked dependencies.

### Gaps

| Area | Status | Risk |
|------|--------|------|
| `action-engine.ts` | **No tests** | Core orchestration for all Action Engine tasks |
| `twilio-service.ts` | **No tests** | SMS/WhatsApp/Lookup paths |
| `stripe-helpers.ts` | **No tests** | Billing source of truth |
| `gemini-brain.ts` | **No tests** | Legacy voice path |
| `job-queue.ts` | **Only backoff constants** | No enqueue/dequeue/retry tests |
| `tcpa-consent.ts` | **Narrow** | Few scenarios for a large compliance surface |
| API routes | **Indirect only** | No full-app supertest suite; only extracted routers tested |
| Components | **~15%** | 8 test files for 58 component files |
| Coverage thresholds | **Not enforced** | `v8` configured but not run in CI |

### Recommendations

1. **Add tests for `action-engine.ts`** — highest-risk untested module.
2. **Add tests for `twilio-service.ts`** and `stripe-helpers.ts`.
3. **Expand `job-queue.test.ts`** beyond backoff constants to cover
   enqueue/claim/retry.
4. **Expand `tcpa-consent.test.ts`** — add edge cases: unknown state, marketing
   vs. servicing, opt-out phrase variations.
5. **Add `vitest run --coverage` to CI** with a minimum threshold (start at 40%,
   ratchet up).

---

## 5. CI / DevOps — B (83)

### Strengths

- **CI pipeline** (`ci.yml`): `npm ci` → `tsc --noEmit` → `vitest run` → `npm
  run build` on every push/PR to `main`.
- **Gitleaks** (secret scanning) on push + weekly schedule.
- **CodeQL** (JS/TS SAST) on push + weekly schedule.
- **Vercel deploy** via `vercel.json` with production crons, CSP headers, and
  serverless rewrites.
- **Docker** multi-stage build with non-root user and health checks.
- **`npm run verify`** combines lint + tests + build in one command.

### Gaps

| Finding | Impact |
|---------|--------|
| **ESLint not in CI** | 793 warnings not gated; `lint:eslint` is manual-only |
| **Prettier not in CI** | `format:check` is manual-only |
| **No pre-commit hooks** | No `.husky/` — formatting/lint drift between commits |
| **Gitleaks/CodeQL only on `main`** | PRs to `master` (if used) are not scanned |
| **No coverage enforcement** | Coverage configured but not collected or gated |
| **No E2E tests** | No Playwright/Cypress for critical UI flows |
| **`server.ts` excluded from ESLint** | `npm run lint:eslint` runs `eslint src/` only |

### Recommendations

1. **Add `lint:eslint` and `format:check` to CI.** Convert `any` warnings to
   errors incrementally (start with new files only).
2. **Add coverage collection** (`vitest run --coverage`) and set a floor.
3. **Install Husky + lint-staged** for pre-commit formatting.
4. **Include `server.ts`** in ESLint scope.

---

## 6. Performance / Bundle — B+ (85)

### Strengths

- **Code-split by route:** Every major screen is a lazy-loaded chunk (Vite +
  React Router `lazy()`).
- **Manual chunks** for heavy vendors: `@sentry`, `@vapi-ai`, `motion`,
  `lucide-react`, `react`/`react-dom`.
- **No recharts in the critical path** — only loads in InsightsView/AdminSettings.
- **Reasonable bundle sizes:** Entry `index.js` is 341 KB (95 KB gzipped).
  Largest route chunk is `FleetSettings` at 83 KB.
- **Cache-Control** per-route type: long TTL for static, `no-store` for API.
- **Slow-request logging** (5s threshold) in production.

### Concerns

| Finding | Impact |
|---------|--------|
| **No list virtualization** | `KnowledgeBaseManager` loads all rows client-side. Large tenants will have performance issues. |
| **Limited `useMemo`/`useCallback`** | Heavy screens (1,000+ lines) may re-render excessively |
| **`vendor-react` chunk: 194 KB** | Includes `react-dom`; expected but worth monitoring |
| **`AreaChart` chunk: 349 KB** | recharts + d3; only lazy-loaded but large |
| **Server cold-start** | Full Express app loaded on every Vercel cold start via `api/index.ts` |

### Recommendations

1. **Add `react-window` or `@tanstack/react-virtual`** for knowledge, call logs,
   and outbound lead lists.
2. **Profile re-renders** in `FleetSettings`, `AdminSettings`, `InsightsView`
   with React DevTools; add memoization where measured.
3. **Consider route-level API splitting** for Vercel (multiple serverless
   functions instead of one monolith) to reduce cold-start cost.

---

## 7. Documentation — A− (90)

### Strengths

- **README.md** is comprehensive: architecture, features, deploy (Vercel +
  Docker), integrations, env vars, keyboard shortcuts.
- **AGENTS.md** is detailed and actionable: load-bearing files, deletion rules,
  dependency constraints, build verification, dev server instructions.
- **CLAUDE.md** provides a 12-rule execution contract.
- **OpenAPI spec** (`/api/openapi.json`) covers the partner-facing API subset.
- **`claude-brain.ts`** has strong module-level documentation.
- **`docs/`** contains audit, launch readiness, and UX planning docs.

### Gaps

- No `docs/testing.md` explaining the testing philosophy (static tenancy
  checks, contract mirrors, why not full-app supertest).
- No `CONTRIBUTING.md` or developer onboarding guide.
- API endpoints beyond the OpenAPI subset are undocumented.

---

## 8. Compliance (TCPA / SOC 2) — B+ (86)

### Strengths

- **TCPA module** (`tcpa-consent.ts`): state map with conservative default
  (unknown → two-party), disclosure copy, outbound gate (DNC, express consent
  for marketing), opt-out phrase detection, consent ledger.
- **SOC 2 controls** (`soc2-controls.ts`): RBAC role hierarchy, access review,
  change log, incident response helpers, `looksEncrypted` heuristic.
- **Audit logging** throughout: `AuditLogger` class writes to
  `wireline_audit_log` with event type, severity, resource, IP, user-agent.
- **Data retention** function (`wireline_purge_old_data`) in schema.
- **DNC management** UI and enforcement in dial paths.

### Gaps

- TCPA jurisdiction from area code is heuristic — wrong state → wrong rule.
- No quiet hours or calling-time enforcement.
- SOC 2 `looksEncrypted` is substring-based, not cryptographic verification.
- TCPA tests cover only narrow happy-path scenarios.

---

## Remediation Plan (Priority Order)

### P0 — Fix Before Next Deploy

| Item | Files | Effort |
|------|-------|--------|
| **S-1: Webhook delivery unsigned** | `src/lib/webhook-helpers.ts` | Small: decrypt `secret_encrypted` when `secret` is null |
| **S-3: Signature header mismatch** | `src/lib/webhook-helpers.ts` | Trivial: prefix hex with `sha256=` |

### P1 — This Sprint

| Item | Files | Effort |
|------|-------|--------|
| **S-2: SSRF at delivery time** | `src/lib/webhook-helpers.ts` | Small: call `hostnameResolvesToPrivate` before fetch |
| **Add tests: `action-engine.ts`** | New test file | Medium |
| **Add tests: `twilio-service.ts`** | New test file | Medium |
| **Add `lint:eslint` to CI** | `.github/workflows/ci.yml` | Trivial |
| **Generate Supabase types** | `src/types/database.ts`, update imports | Medium |

### P2 — Next 2 Sprints

| Item | Files | Effort |
|------|-------|--------|
| **Extract routes from `server.ts`** | New router files, `server.ts` | Large: ~15 new routers |
| **Split large components** | `ClaudeRecipes`, `AdminSettings`, `OutboundDialer` | Medium per component |
| **Add coverage to CI** | `vitest.config.ts`, `.github/workflows/ci.yml` | Small |
| **Add list virtualization** | `KnowledgeBaseManager`, `CallLogs`, `OutboundDialer` | Medium |
| **Expand TCPA tests** | `src/lib/tcpa-consent.test.ts` | Medium |
| **Add `stripe-helpers.test.ts`** | New test file | Medium |

### P3 — Backlog

| Item | Files | Effort |
|------|-------|--------|
| **Consolidate phone normalization** | New `src/lib/phone.ts` | Small |
| **Remove `pg` dependency** (if unused) | `package.json` | Trivial |
| **Remove Gemini key from Vite define** | `vite.config.ts` | Trivial |
| **Expand `tsconfig.strict.json`** | Config only | Small |
| **Add Husky pre-commit hooks** | New `.husky/` | Small |
| **Add E2E tests** (Playwright) | New `e2e/` | Large |
| **Route-level Vercel splitting** | `api/` directory restructure | Large |
| **Add `CONTRIBUTING.md`** | New file | Small |

---

## Metrics Snapshot

| Metric | Value |
|--------|-------|
| TypeScript errors | **0** |
| ESLint errors | **0** |
| ESLint warnings | **793** |
| npm audit vulnerabilities | **0** |
| Test files | **58** |
| Tests | **858** |
| Test pass rate | **100%** |
| Test duration | **10.3s** |
| Build time | **5.2s** (Vite) + 24ms (esbuild) |
| Entry bundle (gzip) | **94.9 KB** |
| Server bundle | **667.6 KB** |
| `server.ts` lines | **6,024** |
| `any` usages in `server.ts` | **241** |
| Total `any` warnings | **793** |
| Lib modules with tests | **~56%** |
| Components with tests | **~15%** |
| CI checks | typecheck, vitest, build, gitleaks, codeql |
