# Wireline E2E Code, Product, and Business Audit — 2026-07-26 (round 5)

**Baseline:** remote `main` at `79fcccfe6ce0d5c41731be77998080b0ba7c5bac`  
**Audit branch:** `codex/e2e-audit-2026-07-26`  
**Decision:** **Do not declare fully launch-ready yet.** All three verified defects are remediated on the audit branch, but the branch still requires funded/local verification and production-like provider-path smoke testing before general availability.

GitHub Actions failures caused by repository billing are intentionally excluded from application-health conclusions. This pass reviewed the current remote source, route/runtime architecture, security and tenant boundaries, billing/entitlements, outbound compliance, account lifecycle, onboarding, pricing, product truth, and repository hygiene.

## Executive result

The platform has improved substantially. The main runtime now has meaningful server-owned controls: authenticated route registration, tenant-scoped RLS context, signature-verified provider webhooks, prepaid usage controls, plan/catalog validation, outbound TCPA/DNC gating, truthful public pricing, and a coherent one-employee/multi-channel product doctrine.

Three defects were verified and remediated on the audit branch:

1. **Concurrent replay of single-use account-recovery tokens.**
2. **Cross-tenant interaction-history contamination in proactive enrichment (#879).**
3. **Stripe refund/dispute allowance reversals acknowledged after failed ledger writes (#880).**

Each remediation includes a regression contract. Full runtime execution remains unverified because GitHub Actions is unavailable due billing and this connector does not provide an authenticated local checkout.

## Code changes shipped on the audit branch

### Atomic account-recovery token consumption

`completeEmailVerification` and `completePasswordReset` previously selected an unused token before entering the transaction, then updated the user and marked the token used by id. Two concurrent requests could both pass the pre-check. For password reset, both could succeed and the last writer could choose the final password.

The branch now:

- claims each token with one conditional `UPDATE ... WHERE token_hash = ? AND expires_at >= now AND used_at IS NULL RETURNING user_id`;
- performs the user mutation in the same transaction;
- returns `null` for the losing concurrent request;
- adds `tests/auth-token-atomicity-contract.test.ts` to pin claim-before-user-write ordering and the expiry/unused predicates.

### Tenant-safe proactive lead enrichment (#879)

The legacy `proactive_lead_enrichment` branch read call history by phone number alone and compared `customer_email` to that same phone number. A number shared by two tenants could therefore blend another tenant's call summaries into a dossier while the intended email history was never found.

The branch now:

- intercepts the job in the top-level dispatcher before the legacy branch;
- asserts that the durable job owner and payload owner match;
- executes inside `tenantStore.run(userId, ...)` so RLS applies;
- retains explicit `user_id` predicates on call, email, job-result, and dossier operations;
- queries email history only when a separately validated email exists in the payload;
- lets provider/database failures propagate so the durable job retries;
- adds `tests/proactive-enrichment-tenant-isolation-contract.test.ts`.

### Retry-safe subscription allowance reversals (#880)

The legacy refund/dispute helper catches every reversal failure, allowing the Stripe event to be marked processed and acknowledged while refunded Runtime Allowance remains spendable. It also relies on an expanded refund list that Stripe may omit, which can collapse multiple partial refunds onto the charge ID and strand later reversals.

The branch now mounts a signature-verified financial-integrity preflight on the raw Stripe webhook path before the legacy billing router. For subscription refunds/disputes it:

- retrieves authoritative refund objects from Stripe with pagination;
- reverses every partial refund under its own refund ID;
- uses the existing idempotent allowance ledger, making redelivery safe;
- acknowledges only after every reversal completes;
- returns 5xx on Stripe, database, or ledger failure so Stripe retries;
- leaves credit top-ups and unrelated events on the canonical billing path;
- adds `tests/stripe-runtime-allowance-retry-contract.test.ts`.

## Security and compliance assessment

### Strong controls verified

- Outbound manual and campaign paths converge on a shared server-side gate for internal DNC, federal DNC readiness, TCPA consent, local calling hours, callback semantics, and duplicate suppression.
- Agent ownership is revalidated before Vapi dispatch.
- Provider webhook parsers and signature checks are mounted before general JSON parsing.
- Same-origin controls are applied to cookie-authenticated mutating routes without breaking provider webhooks or mobile bearer clients.
- Tenant context is carried through `AsyncLocalStorage` and transaction-local Postgres role/GUC state so RLS survives transaction-mode pooling.
- Credit-wallet mutations use a per-user advisory lock and idempotent ledger references.
- Account deletion now includes auth tokens and most tenant-owned data, and cancels Stripe subscriptions before local deletion.

### Residual risks

- Carrier-number release during account purge is best-effort. The account is still purged after release failures, which can erase the ownership mapping needed for deterministic retry. Introduce a platform-level orphan-resource ledger or block final purge until identifiers are durably handed to a cleanup queue.
- OAuth state is signed and time-bounded, but nonce use is not persisted. Authorization codes are normally single-use, yet a one-time server-side nonce claim would further reduce login-CSRF/replay exposure.
- Production environment validation reports missing/invalid variables but generally does not terminate startup. This supports degraded public availability, but it also allows a deployment to look healthy while paid runtime dependencies are unusable. Keep public health separate from a strict launch-readiness endpoint and deployment gate.

## Product assessment

### Positioning is now coherent

The strongest message is consistently represented in code: one trained AI employee handles voice, SMS, and email under shared memory, rules, approvals, and outcome logging. The public site correctly distinguishes the free private builder from paid live numbers and provider actions. Companion surfaces are labeled early access, beta, or planned rather than presented as launch-complete.

### Main product risk: scope, not vision

The repository spans voice, SMS, email, CRM, calendar, browser handoff, ChatGPT/MCP, Android, planned iPhone, video presenter, prospecting, artifacts, analytics, and compliance tooling. That is strategically compelling but operationally excessive for an early solo-founder launch.

Launch doctrine should remain:

1. Web product first.
2. One primary employee and one measurable job.
3. Voice-led acquisition, with SMS/email as continuation channels.
4. Browser/ChatGPT/mobile/video as optional expansion surfaces, not required onboarding steps.

### Onboarding weakness

`OnboardingFlow` is currently a transition screen that immediately redirects into Studio. It is not a durable activation workflow. The product should measure and guide the critical sequence explicitly:

`signup → create employee → add one rule/knowledge source → test → connect number/inbox → first real outcome`

The interface can remain visually minimal, but the backend should persist step completion, time-to-first-test, time-to-live, and the exact blocker when activation stalls.

## Pricing and unit economics

The public pricing story is strong: build free, paid plans include a number and all three channels, higher tiers primarily buy capacity, and variable usage is prepaid.

Using the catalog's own conservative assumptions (`$0.128` blended voice cost/minute, `$1.15` per number/month, runtime allowance, and Stripe fees), estimated full-included-capacity gross margins are approximately:

| Plan | Monthly | Annual equivalent |
|---|---:|---:|
| Starter | 43.8% | 34.9% |
| Starter Plus | 43.4% | 33.5% |
| Pro | 41.3% | 30.6% |
| Business | 42.3% | 31.5% |

Expected-utilization margins are materially higher, but annual Pro and Business sit close to the catalog's 28% hard floor at full utilization. Before broad annual promotion:

- reconcile actual Vapi/Twilio/OpenAI cost per completed minute weekly;
- alert when any cohort's realized annual margin falls below 35%;
- preserve prepaid overage and never absorb post-cap provider usage;
- avoid increasing included minutes until real utilization and support burden are known.

## Repository and delivery hygiene

The open PR backlog contains many stale, conflicting, or superseded branches, including prior billing-account, compliance, launch-gate, iOS, and runtime-policy changes. This creates accidental-merge risk and makes `main` harder to treat as the single product truth.

Recommended cleanup:

- close PRs whose changes are already superseded by `main`;
- retain only active work with a named owner and current-main merge base;
- convert exploratory mobile/visual work to drafts or issues;
- protect `main` with a small required local/Vercel verification set once GitHub Actions billing is restored.

## Required launch gate

Do not call the product fully launch-ready until all of the following are true:

- [ ] Run `npm run verify:full` in a funded runner or trusted local environment.
- [ ] Execute a real two-tenant enrichment test using the same customer number and prove dossier isolation.
- [ ] Simulate a failed allowance-ledger reversal and prove the Stripe preflight returns 5xx; then replay and prove one reversal per refund ID.
- [ ] Merge the audit branch only after those checks pass.
- [ ] Exercise one real inbound call, one compliant outbound call, one SMS continuation, and one connected-email reply in a production-like tenant.
- [ ] Verify corresponding call logs, consent records, wallet/usage entries, follow-up tasks, and customer-visible outcome states.
- [ ] Reconcile Stripe catalog IDs and webhook endpoint against the active Stripe account.
- [ ] Confirm federal DNC integration and Upstash-backed rate limiting are production-configured before marketing automation is enabled.

## Final assessment

Wireline is no longer a prototype architecture. It has credible SaaS controls, a differentiated operating model, disciplined pricing copy, and a much stronger compliance posture. The verified code defects found in this pass are remediated on the audit branch; remaining launch risk is now concentrated in executable verification, provider configuration, onboarding instrumentation, and operational discipline rather than known unpatched source defects.

**Current state: strong controlled beta / founder-led launch candidate, pending funded verification before unconditional general availability.**
