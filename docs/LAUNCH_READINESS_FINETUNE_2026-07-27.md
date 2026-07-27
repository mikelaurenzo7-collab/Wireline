# Launch Readiness Fine-Tune — 2026-07-27

Status: **Active** — deep E2E audit across code, product honesty, security residuals, and Vercel ops. Verified wins shipped on this branch; residual ops items called out explicitly.

**Baseline:** `main` after voice-agent positioning PRs (`7562062b` lineage)  
**Branch:** `cursor/launch-readiness-finetune-6dd0`

## Executive result

Wireline remains a strong controlled-beta / founder-led launch candidate. Prior Round-4/5 remediations (token atomicity, enrichment isolation, Stripe allowance retry, MCP RLS, dial-gate honesty) are on `main` and contract-pinned. This pass found and fixed additional verified honesty, security-defense, and product-truth gaps, plus one production env correction.

**Do not declare unconditional GA** until federal DNC vendor credentials are real, browser Sentry is configured, and one live $19 checkout has been exercised end-to-end.

## Code fixes shipped

### Honesty / API truth

1. **`GET /api/carrier/numbers` empty-success** — missing `VAPI_PRIVATE_KEY` now returns **503** instead of `200 { numbers: [] }`.
2. **AdminSettings** — no longer coerces phone/agent failures (or `degraded: true` 503 payloads) into empty inventories; carrier sync toasts on non-OK.
3. **OutcomeLedger / ApprovalInbox / IntakeKeysManager** — non-OK fetches surface errors instead of silent empty lists.
4. **VoiceReliabilityView / Call analytics** — latency recent + analytics tab no longer collapse failures to empty success.
5. **Onboarding `has_voice` / settings `has_vapi_key`** — stopped reading the dead tenant `vapi_private_key` column; report managed platform `VAPI_PRIVATE_KEY` + tenant number binding.

### Security residuals

6. **OAuth state nonce single-use claim** — `verifyAndClaimOAuthState` claims the embedded nonce via Upstash Redis (`SET NX`) after HMAC+TTL verification. All 14 integration OAuth callbacks **and** Google/Microsoft/Yahoo sign-in callbacks updated. Replay of a captured callback URL within the 20-minute TTL is blocked when Redis is available.
7. **Unsafe proactive enrichment dead path** — `job-worker-base.ts` no longer contains the phone-only cross-tenant history reads; it hard-throws if the intercept is ever removed (#879 landmine closed).

### Product / UX polish

8. **Anonymous session probe** — `GET /api/auth/session` returns `200 { user: null }` instead of `401`, silencing public-page console noise. CookieConsent now keys off `body.user`, not bare `ok`.
9. **Voice-agent copy alignment** — verification email, Compare meta, Client Apps, Privacy Policy, StudioWorkroom fallback, and Call Logs fallback use **AI voice agent** on broad/default surfaces.
10. **Docs index** — promoted `ONE-AGENT-STRATEGY.md` to Active (was Active-status but only historically linked).

### Contracts

- `tests/launch-readiness-finetune-2026-07-27-contract.test.ts` pins every fix above.

## Vercel / ops audit (token-verified)

| Item | Finding | Action this pass |
| --- | --- | --- |
| `WIRELINE_LAUNCH_DEMO_MODE` | Was still on Production (prior audits); tags product events as demo | **Set Production to `false`** |
| `FEDERAL_DNC_API_KEY` | **Absent** on all targets (URL+provider present) | Cannot invent vendor `loginId` — marketing outbound stays fail-closed until business registration |
| `SENTRY_DSN` / `VITE_SENTRY_DSN` | **Both absent** (prior docs claimed backend DSN; not in project env now) | Needs a real Sentry project DSN — not inventable here |
| Upstash Redis | Present on Production | Powers rate limits + new OAuth nonce claims |
| Core AI / Twilio / Vapi / Stripe / Resend / DB | Present on Production | Unchanged |

## Verified clean (no change needed)

- Round-5 token atomicity, enrichment intercept, Stripe allowance preflight still present + contracted.
- Outbound dial/SMS paths still converge on `evaluateOutboundDialGate`.
- Federal DNC fail-closed for marketing when vendor unset.
- Activation / entitlement fail-closed to `pending_activation`.
- Public pricing catalog truth ($19 / $39 / $79 / $159).

## Still open (ops / founder, not code-blockable)

1. Register business + set real DNCScrub `FEDERAL_DNC_API_KEY` (`loginId`) on Production/Preview/Development → `npm run dnc:probe`.
2. Add `SENTRY_DSN` + build-time `VITE_SENTRY_DSN`, redeploy.
3. One live Starter checkout → webhook → entitlement → portal → refund.
4. Restore GitHub Actions spending so CI is a real gate again.
5. Rotate the personal Vercel token pasted into chat after this session.

## Final assessment

**Current state: launch-ready for founder-led / design-partner admission after the DNC + Sentry + live-checkout ops checklist.** Code honesty and OAuth replay posture are tighter; demo-mode no longer mis-tags production events.
