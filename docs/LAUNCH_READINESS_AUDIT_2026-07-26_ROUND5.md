# Wireline E2E Code, Product, and Business Audit — 2026-07-26 (round 5)

**Baseline:** remote `main` at `79fcccfe6ce0d5c41731be77998080b0ba7c5bac`  
**Audit branch:** `codex/e2e-audit-2026-07-26`  
**Decision:** **Do not declare fully launch-ready yet.** Merge the atomic account-recovery fix, then close issues #879 and #880 before scaling paid acquisition or enabling broad autonomous outreach.

GitHub Actions failures caused by repository billing are intentionally excluded from application-health conclusions. This pass reviewed the current remote source, route/runtime architecture, security and tenant boundaries, billing/entitlements, outbound compliance, account lifecycle, onboarding, pricing, product truth, and repository hygiene.

## Executive result

The platform has improved substantially. The main runtime now has meaningful server-owned controls: authenticated route registration, tenant-scoped RLS context, signature-verified provider webhooks, prepaid usage controls, plan/catalog validation, outbound TCPA/DNC gating, truthful public pricing, and a coherent one-employee/multi-channel product doctrine.

Three defects were verified in this pass:

1. **Fixed on the audit branch — concurrent replay of single-use account-recovery tokens.**
2. **Open P0 (#879) — proactive enrichment can mix cross-tenant interaction history.**
3. **Open P1 (#880) — Stripe refund/dispute allowance reversal failures are acknowledged as processed.**

The first is patched with a claim-first conditional update and regression contract. The other two require changes in larger runtime modules and remain explicit launch blockers.

## Code changes shipped on the audit branch

### Atomic account-recovery token consumption

`completeEmailVerification` and `completePasswordReset` previously selected an unused token before entering the transaction, then updated the user and marked the token used by id. Two concurrent requests could both pass the pre-check. For password reset, both could succeed and the last writer could choose the final password.

The branch now:

- claims each token with one conditional `UPDATE ... WHERE token_hash = ? AND expires_at >= now AND used_at IS NULL RETURNING user_id`;
- performs the user mutation in the same transaction;
- returns `null` for the losing concurrent request;
- adds `tests/auth-token-atomicity-contract.test.ts` to pin claim-before-user-write ordering and the expiry/unused predicates.

## Unresolved verified launch blockers

### P0 — cross-tenant proactive enrichment (#879)

`proactive_lead_enrichment` reads call history using only `customer_number`, without `user_id`. A shared number can therefore contribute another tenant's summaries to the requesting tenant's dossier. The email-history query also compares `customer_email` to the phone number and lacks tenant scoping.

Required before launch:

- scope every read by `p.userId`;
- validate stored job owner against payload owner before tenant reads;
- omit email history unless a validated email is carried in the job payload;
- add a two-tenant runtime test proving isolation.

### P1 — refund/dispute runtime allowance retry integrity (#880)

The Stripe refund/dispute helper catches ledger-reversal failures and returns normally. The outer webhook then marks the event processed and returns 2xx. The reversal ledger is already idempotent, so swallowing the error trades safe retry behavior for permanent financial leakage.

Required before launch:

- propagate reversal failures to the webhook boundary;
- preserve claim rollback so Stripe redelivery can retry;
- test that a failed reversal cannot mark the event processed;
- add reconciliation for refunded subscription charges missing a matching allowance-reversal ledger row.

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

- [ ] Merge the atomic auth-token fix from this audit branch.
- [ ] Resolve #879 and prove two-tenant isolation in the enrichment worker.
- [ ] Resolve #880 and prove Stripe retries on reversal failure.
- [ ] Run `npm run verify:full` in a funded runner or trusted local environment.
- [ ] Exercise one real inbound call, one compliant outbound call, one SMS continuation, and one connected-email reply in a production-like tenant.
- [ ] Verify corresponding call logs, consent records, wallet/usage entries, follow-up tasks, and customer-visible outcome states.
- [ ] Reconcile Stripe catalog ids and webhook endpoint against the active Stripe account.
- [ ] Confirm federal DNC integration and Upstash-backed rate limiting are production-configured before marketing automation is enabled.

## Final assessment

Wireline is no longer a prototype architecture. It has credible SaaS controls, a differentiated operating model, disciplined pricing copy, and a much stronger compliance posture. The remaining risk is concentrated rather than systemic. However, one concentrated defect crosses tenant boundaries and another can create permanent refunded-credit leakage; both are unacceptable at launch scale.

**Current state: strong controlled beta / founder-led launch candidate, not yet unconditional general availability.**
