# Codebase Audit Remediation Plan

BotBound (`wireline`) — findings from a six-surface audit (auth/tenant, billing/Stripe, telephony/webhooks, data/migrations, frontend, dead-code/hygiene). Each finding carries severity, `file:line`, impact, and a concrete remediation. Ordered so the highest-severity, lowest-risk wins land first.

> DB changes must follow `docs/DATABASE_OPERATIONS.md`: append-only migrations, `npm run db:health` first, verify live schema read-only before DDL, exact-head green preview before merge. Shared Supabase Postgres is production data.

---

## Severity summary

| Severity | Count | Highest-risk themes |
| --- | --- | --- |
| HIGH | 6 | Twilio webhook unsigned bypass; tenant-isolation fail-open; contradictory FKs; Drizzle schema missing live columns/tables |
| MEDIUM | 15 | Meta lead silent drop; spend-reservation leak; weak scrypt; JWT secret leniency; stale entitlement mirrors; frontend state bugs |
| LOW | ~20 | Missing indexes, dead code, `as any` clusters, read-only transactions, cent rounding |

---

## Workstream 1 — Security (blocker before any public exposure)

### 1.1 (HIGH) Twilio webhooks accept unsigned requests when `TWILIO_AUTH_TOKEN` is unset outside production
- **Where:** `src/lib/twilio-webhook-auth.ts:95-97`.
- **Why:** When `!authToken`, non-production returns `{ok:true}`. A dev/preview server exposed via a public tunnel (ngrok/cloudflared) for Twilio testing accepts forged POSTs, performing tenant-scoped writes (DNC opt-out/opt-in, `smsMessages`/`smsThreads`/`consentLog`, usage-alert emails, `callLogs` writes) with zero auth.
- **Fix:** Fail closed whenever the token is missing — never auto-allow. Introduce an explicit, narrow dev bypass env (e.g. `TWILIO_WEBHOOK_DISABLE_AUTH=1` + `NODE_ENV!==production`) that also emits a loud startup warning, and remove the blanket `{ok:true}` fallthrough.
- **Validation:** `npm run lint:server`; add a unit test that `evaluateTwilioWebhookAuth` rejects when `authToken` undefined in every runtime. Grep confirms all route call sites already gate on `.ok` (verified).

### 1.2 (HIGH) Tenant isolation fails OPEN to the RLS-bypassing owner role
- **Where:** `src/lib/tenant-context-scope.ts:15-18`, `src/lib/server-context.ts:149-151,179-181`, `src/lib/tenant-pool-transaction.ts:84-87`.
- **Why:** Empty `AsyncLocalStorage` context resolves to `{kind:"root"}`, which dispatches to the raw pool (no `SET LOCAL ROLE wireline_server`, no `app.current_user_id`). There is no `FORCE ROW LEVEL SECURITY` anywhere (grep: 0 hits), and table owners bypass RLS. A forgotten `tenantStore.run()` (or a new job/webhook querying before resolving the user) silently gains cross-tenant read/write instead of failing.
- **Fix (incremental, non-breaking):**
  1. Add `FORCE ROW LEVEL SECURITY` to tenant tables via append-only migration so even the owner role is fenced (this is the real backstop).
  2. In `resolveTenantDatabaseScope`, distinguish "no context" from "explicit system context". Default no-context to a scoped-but-unidentified role (`SET LOCAL ROLE wireline_server` with empty GUC) so tenant RLS casts to no user and returns zero rows, rather than root.
  3. Reserve root only for an explicit reviewed allow-list (`withRootScope()` wrapper or an explicit `{kind:"system"}` marker) on sign-in bootstrap, provider callbacks, and verified webhooks.
- **Validation:** `npm run tenant-insert:check`, `npm run authz:check`, `npm run server:bootstrap:check`, plus a targeted test asserting a query outside tenant context sees no rows.

### 1.3 (MEDIUM) scrypt uses Node's default weak cost parameters
- **Where:** `src/lib/auth-service.ts:75,82,91,101`.
- **Why:** Defaults are `N=16384, r=8, p=1`; OWASP recommends `N=2^17 (131072)`. ~8x cheaper to brute-force than the floor.
- **Fix:** Pass explicit `{N: 131072, r: 8, p: 1}` (or stronger). Existing hashes must still verify: `scrypt` params are not self-describing, so introduce a stored-params path or a one-time rehash-on-login upgrade using a marker (prefix/column) so old hashes keep verifying while new hashes use the stronger cost. Keep async scrypt on the request path.
- **Validation:** `npm run test:run` for `auth-service.test.ts`; manual login against a legacy-password test account.

### 1.4 (MEDIUM) Short `INTERNAL_JWT_SECRET` is only warned, not rejected
- **Where:** `src/lib/auth-service.ts:35-36`, `src/lib/internal-jwt-secret.ts:19-31`.
- **Why:** HS256 tokens are forgeable offline with a weak secret. Production should fail closed at <32 bytes.
- **Fix:** In `requireInternalJwtSecret()`, enforce `>= 32` chars in production (warn-only in local/dev). Consider dropping the silent `SUPABASE_JWT_SECRET` fallback or emitting a hard error when both are ambiguous.
- **Validation:** `npm run check-prod-env`; unit test for the length gate.

### 1.5 (MEDIUM) CSRF same-origin gate trusts forwarded-host headers
- **Where:** `src/middleware/same-origin.ts:58-75`.
- **Why:** `selfOrigin()` derives the self origin from raw `x-forwarded-host`/`x-forwarded-proto`/`Host`. With a misconfigured proxy these are attacker-influenceable, weakening the origin check that backs `SameSite=Lax`.
- **Fix:** Resolve self-origin from the configured allow-list (`APP_URL`/`CORS_ORIGINS`/`resolveCanonicalAppUrl()`), falling back to forwarded headers only when the allow-list is empty. Reject rather than trust unknown forwarded hosts in production.
- **Validation:** `npm run csp:check`, `npm run security:routes:check`.

### 1.6 (LOW) parseCookieHeader throws URIError on malformed percent-encoding
- **Where:** `src/lib/session-cookie.ts:53`.
- **Why:** A malicious/self-set `Cookie` with bad `%` encoding forces 500s on the user's own requests.
- **Fix:** Wrap `decodeURIComponent` in try/catch; skip or store the raw value on failure.

### 1.7 (LOW) Signup and reset-password rate limits are IP-only
- **Where:** `src/middleware/rate-limit-middleware.ts:238-263,365-393`.
- **Why:** No per-email component; distributed IPs / shared NAT bypass or over-block.
- **Fix:** Add a per-email key alongside IP for signup and reset-password. Ensure the distributed email limiter fails closed (currently `emailRateLimiter` fails open when no distributed limiter configured).

---

## Workstream 2 — Telephony / webhook correctness

### 2.1 (MEDIUM) Meta leadgen webhook returns 200 and silently drops on signature failure
- **Where:** `src/routes/meta-webhook-routes.ts:204-213`, `:78-108`.
- **Why:** Missing/rotated `META_APP_SECRET` (or any mismatch) turns every lead delivery into `200 OK` with no processing and no alert — silent data loss, Meta never retries.
- **Fix:** On persistent mismatch, log an error and page (existing `reportError`/Sentry surface) instead of only `log.warn`. Distinguish missing-secret (503 `unavailable`, so Meta retries) from genuine mismatch (still 200 to stop Meta's retry storm, but with a loud operational alert + counter for rate-of-failure alerting).

### 2.2 (MEDIUM) `reserved_before_provider` spend reservations leak permanently on crash
- **Where:** `src/middleware/audit-middleware.ts:493-527`, `src/routes/openai-realtime-routes.ts:62-78`, `src/routes/openai-sip-routes.ts:419-510`.
- **Why:** The MTD cap sums all `auditLog.costUsd` regardless of `accounting_state`. A Vercel freeze between reserve and commit/release leaves `reserved_before_provider` rows that count against the tenant's hard cap for the rest of the month.
- **Fix:** Add a TTL reclaim (mirror the `stripe-event-claim` 15-minute lease pattern): a periodic/on-read sweep that marks stale `reserved_before_provider` rows `released` (or excludes them from the MTD sum) after N minutes. Ensure the SIP and realtime commit paths are resilient to the reservation already being reclaimed.

### 2.3 (LOW) `recordVoiceMetrics` updates call logs without tenant scope
- **Where:** `src/lib/voice-observability.ts:37-48`.
- **Why:** `UPDATE ... WHERE vapiCallId = $1` has no `userId` filter. Currently dead code (no callers), but a latent cross-tenant write if wired to an untrusted `vapiCallId`.
- **Fix:** Add `userId` to the signature and the `WHERE`. Wire it correctly or delete it.

### 2.4 (LOW) SMS outbound DNC skips the Redis failsafe that voice consults
- **Where:** `src/lib/twilio-service.ts:267-278` vs `src/lib/compliance.ts:51-61`.
- **Why:** Legacy `STOP` (no `OptOutType`) that fails to persist writes the failsafe for voice, but SMS `blockedByDnc` checks only `dncList`.
- **Fix:** Have `blockedByDnc` also consult `isDncFailsafeBlocked` so SMS/WhatsApp honor the disaster-window suppression.

### 2.5 (LOW) `referOpenAISipCall` accepts arbitrary `sip:` target URIs
- **Where:** `src/lib/voice/openai-sip-session.ts:376-396`.
- **Why:** Non-phone destinations flow raw trimmed strings into the `REFER target_uri` as long as they start with `sip:` — no host allow-list.
- **Fix:** Restrict REFER targets to `tel:`/E.164, or an explicit configured SIP host allow-list.

### 2.6 (LOW) Missing `OPENAI_WEBHOOK_SECRET` surfaces as 401 not 503
- **Where:** `src/lib/standard-webhook-auth.ts:97-98`, `src/routes/openai-sip-routes.ts:304-316`.
- **Why:** Misconfiguration masquerades as "invalid signature". Mirror `resend-webhook-routes.ts:39-45`, which maps missing secret to 503.

---

## Workstream 3 — Data / migrations (schema integrity)

> These are the most delicate. Do them one at a time with read-only verification first.

### 3.1 (HIGH) `ON DELETE SET NULL` FK on `NOT NULL` columns
- **Where:** `drizzle/migrations/0015_add_fk_constraints.sql` (16,30,44,58,72,86,100,114,128,142,156,170,184) + `0039_tenant_user_id_not_null.sql:115-135`.
- **Why:** A direct `DELETE FROM wireline_users` raises SQLSTATE 23502 (Postgres writes NULL into NOT NULL). Erasure works only because `purgeAccount` manually deletes children first, but the FK is a latent landmine that mis-documents the invariant.
- **Fix:** Append-only migration converting the remaining `SET NULL` user FKs to `ON DELETE CASCADE` (mirroring `0160`/`0162`, which already did this for `audit_log`/`subscriptions`). Confirm none of the affected tables is intentionally preserved after user deletion.

### 3.2 (HIGH) Drizzle schema omits live columns → `db:push`/`db:generate` would DROP them
- **Where:** `src/db/schema.ts:21-23` (never re-exports `security-schema.ts`), `drizzle.config.ts:14`.
- **Why:** `wireline_users.session_revoked_before` (0120) and `session_version` (0127) exist only in `security-schema.ts:4-11`; `wireline_team_members.invitation_token_hash/invitation_expires_at/accepted_at` only in `security-schema.ts:30-42`. `schema.ts`'s `users`/`teamMembers` (via `schema-base.ts`) lack them.
- **Fix:** Re-export `security-schema.ts` from `schema.ts` (or merge the security columns into `schema-base`), so the canonical schema graph matches the live DB and Drizzle Kit stops planning `DROP COLUMN`.

### 3.3 (HIGH) Customer-data tables have no Drizzle model
- **Where:** `wireline_organizations`, `wireline_memberships`, `wireline_director_profile` — reached only via raw `sql.raw()` in `src/lib/account-deletion.ts:35-143` and `src/routes/account-export-guard-routes.ts:151-154`.
- **Why:** Untyped, un-migrated, and the deletion/export registries assume columns (`organization_id`) absent from any Drizzle table.
- **Fix:** Add `pgTable` models for these tables (or mark them intentionally out-of-band with a documented reason). Reconcile the deletion/export column lists against the real DDL.

### 3.4 (MEDIUM) Duplicate/shadowed table definitions
- **Where:** `src/db/schema.ts:38,172,195` shadow `schema-base.ts` `settings`/`spendBudgets`/`subscriptions`; `subscriptions` is defined three times (`schema.ts`, `schema-base.ts`, `security-schema.ts:19-28`).
- **Why:** Editors touching the shadowed `schema-base` copy see no effect; `schema-base` `spendBudgets` still declares stale defaults (`0`/`false`) vs live `1.50`/`true`.
- **Fix:** Consolidate to one canonical definition per table (keep the correct `schema.ts` defaults), delete the shadowed copies, update all importers.

### 3.5 (MEDIUM) Competing FKs on `wireline_team_members`
- **Where:** `0015` (SET NULL, lines 156/170) vs `0120` (CASCADE, lines 52-76, no drop of 0015).
- **Why:** Two FKs with different delete actions on the same column — the exact hazard `0162` guards against for `subscriptions`.
- **Fix:** In the 3.1 migration, drop the legacy `fk_team_members_*` constraints and keep the CASCADE ones.

### 3.6 (MEDIUM) Migration journal/snapshot inconsistency
- **Where:** `drizzle/migrations/meta/_journal.json` (72 entries, stops at 0173) vs 177 `.sql` files; snapshots stop at `0071`.
- **Why:** `drizzle-kit migrate` (journal-driven) silently skips ~100 unjournalled siblings. A developer assuming `db:migrate` runs everything will be wrong.
- **Fix:** Either journal the out-of-band backlog (risky against live DB) or — safer — promote `scripts/check-migration-drift.mjs` into a required gate (already part of intent, ensure it runs in `verify`/`verify:full` and CI) and document the migration model in `CONTRIBUTING.md`/`docs/DATABASE_OPERATIONS.md`.

### 3.7 (LOW) Missing indexes on tenant/FK columns
- **Where:** `schema-base.ts:613-633` (`agent_lessons.user_id`), `:1373` (`outbound_leads.agent_id`), `:248-262` (`recap_artifacts.user_id`).
- **Why:** RLS + purge-by-user full scans under load.
- **Fix:** Append-only migration adding btree indexes on the user-scoped columns that participate in RLS/delete-by-user.

### 3.8 (LOW) Read-only work wrapped in transactions
- **Where:** `src/lib/daily-brief.ts:42`, `src/lib/private-agent-test.ts:68`, `src/lib/agent-text-reply.ts:142`, `voice/openai-live-agent-service.ts:282`, `voice/openai-phone-agent-runtime.ts:336`.
- **Why:** Adds round trips and pins pooled connections with no atomicity benefit; `serialQueryBatch` (`server-context.ts:97-103`) already exists for this.
- **Fix:** Replace read-only `drizzle.transaction(...)` with `serialQueryBatch`.

### 3.9 (LOW) Request-time DDL bootstrap
- **Where:** `src/routes/chatgpt-mcp-routes.ts:305-333`, `src/routes/browser-handoff-routes.ts:85-104`.
- **Why:** `CREATE POLICY`/`GRANT` on the request path — catalog writes outside migrations.
- **Fix:** Move these into an idempotent append-only migration (or a startup bootstrap), not per-request.

---

## Workstream 4 — Billing / entitlements

### 4.1 (MEDIUM) Hardcoded fallback Stripe price IDs make `configured` lie
- **Where:** `src/lib/plan-catalog.ts:44,185-186,216-217,247-248,279-280,379-383,462-487`.
- **Why:** `configuredPriceId()` falls back to a hardcoded `price_*` literal when env is unset, so `configured` reports `true` for paid plans even when the live price was rotated. Checkout still fails closed via `resolveStrictFounderPriceId`, so this is a UI/ops signal-integrity gap, not a money leak.
- **Fix:** Treat the fallback as "reference only" — do not derive `configured` from it. `configured` should require the env var (or a successful live Stripe lookup). Extend `scripts/check-stripe-catalog-contract.mjs` to reject hardcoded fallback price IDs in the `configured` path.

### 4.2 (MEDIUM) Stale `settings.maxAgents`/`extraAgents` mirror on terminal/past_due subscriptions
- **Where:** `src/lib/stripe-helpers.ts:655-658,690-691,759-777`, `src/lib/extra-agent-billing.ts:58-71`.
- **Why:** Access gating is correct (via `resolveAgentEntitlement`), but the persisted `maxAgents` stays at paid capacity on cancel/past_due; `reconciledStoredAgentCap` can briefly leak an `explicitGrant` on downgrade/resubscribe.
- **Fix:** Reset `maxAgents`/`extraAgents` to free-tier capacity when the subscription enters a non-granting status, and make `reconciledStoredAgentCap` ignore `storedMaxAgents` when status is terminal.

### 4.3 (LOW) Voice metering and usage snapshot ignore subscription status
- **Where:** `src/lib/voice-usage.ts:218-234,343-386`, `src/lib/workspace-usage-snapshot.ts:83-86`.
- **Why:** Past-due/canceled accounts still report included voice minutes and `live_voice_blocked=false` (advisory inconsistency only; admission is gated elsewhere).
- **Fix:** Gate the included-minutes/blocked computation on `subscriptionStatusGrantsEntitlements`.

### 4.4 (LOW) Shadowed legacy checkout route lacks idempotency key
- **Where:** `src/routes/launch-billing-checkout-routes.ts:214-233`.
- **Why:** Dead (shadowed by `-atomic-routes`), but if registration order changes, a retry mints duplicate sessions; also uses a random `integration_identifier`.
- **Fix:** Delete the dead route (confirmed unmounted/shadowed) or add the idempotency key and stable identifier.

---

## Workstream 5 — Frontend correctness

### 5.1 (MEDIUM) ToastContext side effects inside a `setToasts` updater
- **Where:** `src/contexts/ToastContext.tsx:87-123`.
- **Why:** `setTimeout`, `timers` ref mutation, and `resolvedId` assignment run inside the state updater. StrictMode double-invokes updaters (orphan timers), and the dedup return value is stale (the updater runs later).
- **Fix:** Compute dedup/ids/timer scheduling outside the updater; make the updater pure; schedule auto-dismiss in an effect or immediately (not inside the updater).

### 5.2 (MEDIUM) `AccountContext` active id not user-scoped
- **Where:** `src/contexts/AccountContext.tsx:26,50-56,61,64-100`.
- **Why:** `activeId` initialized from a global `localStorage["wl_active_account"]` and never cleared on user change; second user on a shared browser inherits the prior user's active account (masked only by fallback).
- **Fix:** Scope the storage key by user id; reset `activeId` when `user` becomes null or changes.

### 5.3 (MEDIUM) AuthContext hydration re-fires on intra-portal navigation
- **Where:** `src/contexts/AuthContext.tsx:110-149`.
- **Why:** Effect depends on `location.pathname`; navigating between `/signin`/`/signup` re-runs `migrateLegacyLocalStorage()` (POST with no timeout) and `fetchSessionUser()`, causing duplicate probes and a potential hang.
- **Fix:** Key the migration on a once-per-session flag (not pathname); add abort/timeout to `migrate-session`.

### 5.4 (LOW) `StudioWorkroom` `loadMessages` has no cancellation guard
- **Where:** `src/components/StudioWorkroom.tsx:189-210`.
- **Fix:** Abort in-flight `authFetch` on unmount (AbortController) to avoid setting state on a dead tree.

### 5.5 (LOW) `useRecipeAsync` overlapping-request race
- **Where:** `src/hooks/useRecipeAsync.ts:19-40`.
- **Fix:** Track a request sequence id and discard stale resolutions; abort on unmount.

### 5.6 (LOW) `RouteChangeA11y` permanently mutates `tabindex`
- **Where:** `src/components/RouteChangeA11y.tsx:34-38`.
- **Fix:** Restore the original `tabindex` on cleanup; avoid stealing focus from the active control mid-navigation.

### 5.7 (LOW) `/onboarding` and `/accept-invite` block on session hydration
- **Where:** `src/lib/public-routes.ts:56-60`, `src/lib/workspace-route-scope.ts:26`.
- **Fix:** Confirm whether these should be session-optional; if so add to `isSessionOptionalPublicPath` (or document why they must wait).

---

## Workstream 6 — Dead code & hygiene wins (fast, low-risk)

### 6.1 Delete the one-line re-export wrapper
- **Where:** `src/lib/api.ts:1` (`export * from "./api-base"`).
- **Fix:** Move `api-base.ts` into `api.ts` (or rename), delete the wrapper; update ~70 importers (they already import `api`).

### 6.2 Retire the unmounted video-presenter routes
- **Where:** `src/routes/video-presenter-routes.ts:8` + `video-presenter-routes-base.ts` (both unmounted; base returns 410 everywhere).
- **Fix:** Delete both files and their contract tests (or keep only the terminal 410 sink at `register-api-routes.ts:157-162`). Confirm no external client depends on the old URL before removal.

### 6.3 Rename misnamed `-v2` modules
- **Where:** `agent-routes-v2.ts`, `qa-routes-v2.ts`, `google-drive-sync-v2.ts` (all are the only module of their kind, no `-v1`).
- **Fix:** Drop `-v2`; update `register-api-routes.ts:9,13`, `workspace-knowledge-routes.ts:10`, and the ~20 contract-test path references.

### 6.4 Type-safety hot spots (highest-value `as any` clusters)
- **Where:** `src/lib/integrations.ts` (~14 `as any` dynamic-table CRUD), `src/middleware/require-role.ts:161-211` (`(req as any)`), `src/routes/auth-oauth-routes.ts` (11 `{} as any`), and recurring `.returning()) as any[]` in `dashboard-routes.ts:481,565`, `campaign-routes.ts:105,153`, `cadence-routes.ts:91,124,208,231`, `knowledge-routes.ts:101,132`, `webhook-routes.ts:157,239`.
- **Fix:** Model the dynamic-table union in `integrations.ts`; use `AuthenticatedRequest` augmentation in `require-role.ts`; type `bridgeRedirect`'s parameter; use typed `.returning<...>()`.

### 6.5 Reconcile the "dark-only" CSS contradiction
- **Where:** `src/styles/letterpress-polish.css:14` (asserts "dark-only", plus copper-wire utilities at 412/435/934) vs `CODEBASE_HEALTH.md:63-66` (cool-obsidian dark + near-white light; no copper palette).
- **Fix:** Remove the copper/dark-only residue and migrate to the Letterpress token system; update the 4 contract tests that pin it.

---

## Suggested execution order

1. **WS1.1 + WS1.2** (Twilio unsigned bypass, tenant fail-open) — security blockers.
2. **WS3.1/3.2/3.3/3.5** (FK contradiction, Drizzle schema completeness) — data integrity; each as its own append-only migration with `db:health` before/after.
3. **WS2.1 + WS2.2** (Meta silent drop, spend-reservation leak) — data loss / availability.
4. **WS1.3/1.4/1.5** (scrypt cost, JWT secret, CSRF origin) — hardening.
5. **WS4.1/4.2** (billing signal integrity, stale mirrors).
6. **WS5.1/5.2** (frontend state bugs).
7. **WS6** (dead code, renames, `as any` cleanup) — batch these last as they touch many files.
8. Remaining LOW items opportunistically.

## Validation gates

- DB work: `npm run db:health` before and after; read-only `npm run db:drift`; exact-head green preview.
- Security: `npm run authz:check`, `npm run tenant-insert:check`, `npm run security:routes:check`, `npm run csp:check`.
- Billing: `npm run stripe:catalog:check`, `npm run verify:contracts`.
- Full: `npm run lint`, `npm run lint:server`, `npm run lint:eslint`, `npm run test:run`, `npm run build`, `npm run smoke:server` (sequential per AGENTS.md to avoid OOM); `npm run verify:full` before merge for release-impacting changes.

## Risks & notes

- **1.2 (tenant fail-open)** is the most architecturally sensitive change. Land `FORCE ROW LEVEL SECURITY` first (pure backstop), then tighten `resolveTenantDatabaseScope` incrementally with a system-path allow-list; do not flip to fail-closed wholesale without auditing every `tenantStore.run()` call site and every provider-callback/webhook path.
- **3.x migrations** target shared production data — verify live schema read-only, commit append-only, and confirm no table in the FK conversion is intentionally preserved post-deletion.
- **6.5 (CSS)** is cosmetic but touches 4 pinned contract tests; keep visual regression run (`npm run visual:qa`/`design:check`) green.

## Open questions for the implementer to confirm against live state

1. Which of the `ON DELETE SET NULL` tables (3.1) are legitimately intended to survive user deletion (none expected, but confirm)?
2. Are `wireline_organizations`/`memberships`/`director_profile` (3.3) still in use, or are they retired tenant-era tables that should be dropped instead of modeled?
3. Does any external client still call the retired `video-presenter` URLs (6.2) before deleting them?
