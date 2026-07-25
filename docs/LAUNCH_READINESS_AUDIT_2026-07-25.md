# Launch Readiness Audit — 2026-07-25 (evening)

Status: **Active** — deep E2E audit + verified code/ops fixes shipped this pass.

## Live posture (verified)

| Probe | Result |
| --- | --- |
| `GET /api/health` | `ok: true` |
| `GET /api/health/launch-readiness` (monitor token) | overall **100**; `compliance_ready` **degraded** (`FEDERAL_DNC_API_URL+FEDERAL_DNC_API_KEY`) |
| GO capabilities | core / billing / voice / email / oauth **ready** |
| DB `wireline_settings.subscription_status` default | flipped live to **`pending_activation`** (was `'active'`) |
| Tenant mix (shared DB) | 106 `pending_activation`, 19 `trial_expired`, 3 `active` |

## Code fixes shipped

### Security / entitlement

1. **Activation bypass (P0)** — `daily-brief-routes` + `company-identity-routes` settings inserts omitted `subscriptionStatus`; Postgres defaulted to `active` and bypassed `enforceLiveWorkActivation`. Now set `pending_activation` (owner → `active`). Contract expanded.
2. **DB + schema default** — `0113_settings_subscription_status_pending_default.sql` + `schema.ts`; applied on shared Supabase.
3. **Fail-open reads** — `vapi-client` / `vapi-v2` / `phone-line-entitlements` treated missing settings as `active`; now fail closed to `pending_activation`.
4. **QuotaTracker plan map** — Starter was mapped to **business** quotas (25 concurrent dials vs 2). Aligned with `subscriptionPlanToTier`.
5. **Signup timing oracle** — equalize email-taken vs create (`SIGNUP_MIN_DURATION_MS = 500`); race `23505` padded.
6. **CSAT SMS** — now runs `evaluateOutboundDialGate` (`isLiveSessionFollowUp`) instead of a local DNC-only check.

### Honesty / API

7. **SMS inbox** — no longer returns `200 {threads|messages: []}` on failure/404.
8. **Assistants presence/tasks, carrier Vapi sync, lead dossiers** — same empty-success class → proper 5xx.
9. **Email account assign** — `404 Agent not found` no longer remapped to 500.

### Product polish

10. WireAgentLanding headline `$9` → **`$19`** (catalog truth).
11. Contact price fallbacks → **$19 / $39**.
12. Runtime Balance copy wired through UsageMeter / balance card / BillingSettings / Security trust row.
13. Agent objections + Company Identity + changelog: retire customer-facing “dashboard”.
14. Remove unused `IntegrationLogos` marketing strip + dead `ObservabilityDashboard`.
15. DeployAgentModal `assistant-name` → `agent-name`; hard-gate comment matches deferred DNC.
16. Master plan iOS **Beta → Planned** (matches `CLIENT_SURFACES.md`).


17. **Runtime policy / IntegrationLogos** — unused marketing strip removed; contracts assert logo catalog keys directly.
18. **Live voice contract drift** — `code-review-hardening` now reads `OpenAILiveVoiceSandbox` (LiveVoiceSandbox is a re-export).


## Double pass (same evening)

Additional verified fixes landed after a second fierce pass:

1. Stripe webhook never 2xx unfinished `processing` claims (Stripe stops retries after 2xx).
2. Runtime Allowance grant failures rethrow so webhooks retry.
3. Unmapped active Stripe prices refuse plan wipe to null / maxAgents=1.
4. Dead `/billing` payment+dunning links → `/pricing` + `/settings/billing` (+ route redirect).
5. Checkout lists Stripe live subscriptions before opening another session.
6. Forgot-password timing includes email send; `equalizedDuration` pads rejections.
7. Runtime reserve idempotency lookup is tenant-scoped.
8. Manual SMS replies use `evaluateOutboundDialGate`; mark-read returns real errors.
9. Settings GET no longer returns empty `{}` on outage.
10. Live-voice contracts point at OpenAI Realtime implementation.
11. Daily Brief / trial email / sales persona / Runtime Balance customer-copy honesty.
12. Public nav + live-voice reset hit targets ≥44px.

## Ops still open (not code-blockable)

| Item | Notes |
| --- | --- |
| Federal DNCScrub `loginId` | Prod/preview Sensitive env present but **not** vendor-valid (`compliance_ready` degraded; marketing fail-closed). Register business → set real `loginId` on all targets → `npm run dnc:probe`. Development has URL/provider but **no** `FEDERAL_DNC_API_KEY`. |
| `WIRELINE_LAUNCH_DEMO_MODE=true` | Still on production/preview — tags product events as demo. Flip to `false` when admitting first real customer. |
| `VITE_SENTRY_DSN` | Backend `SENTRY_DSN` set; browser DSN still missing (build-time). |
| GitHub Actions spending | CI may be dark; use local `verify` / Vercel build status. |
| Twilio / Stripe working capital | Funding — see `LAUNCH_GURU_PLAYBOOK_2026-07-20.md`. |
| Rotate this session’s Vercel token | User pasted a personal `vcp_` token into chat — revoke after use. |

## Contracts added/extended

- `tests/activation-bootstrap-contract.test.ts` — covers all four settings insert surfaces + schema default
- `tests/auth-signup-enumeration-contract.test.ts`
- `tests/sms-inbox-error-honesty-contract.test.ts`
