# Wireline Composer 2.5 Certification

**Date:** 2026-07-05  
**Branch:** `main` (pre-push certification run)  
**Baseline:** `db5e72b6` → certification commit (this release)

## Summary

Composer 2.5 certification closes the runtime-policy migration, enforces the full verification ladder in CI, ships honest dual-voice PSTN routing for presenter agents, extends the activation funnel taxonomy, adds post-create wizard persistence tests, and wires Business custom-presence consent FTUX.

## Verification ladder

| Step | Command | Result |
|------|---------|--------|
| Lint (client) | `npm run lint` | ✅ pass |
| Lint (server) | `npm run lint:server` | ✅ pass |
| Design contract | `npm run design:check` | ✅ pass |
| Stripe catalog | `npm run stripe:catalog:check` | ✅ pass (9 setup / 8 recurring) |
| AuthZ matrix | `npm run authz:check` | ✅ 0 violations (189 scanned) |
| Server bootstrap | `npm run server:bootstrap:check` | ✅ pass |
| CSP drift | `npm run csp:check` | ✅ pass |
| Runtime policy | `npm run runtime:policy:check` | ✅ pass (no `claude-*.ts` in `src/lib`) |
| API error shape | `npm run api-error:check` | ✅ 0 legacy responses |
| Unit + contract tests | `npm run test:run` | ✅ **221** tests |
| Product contracts | `npm run verify:contracts` | ✅ 15 tests |
| Production build | `npm run build` | ✅ pass |
| Server smoke | `npm run smoke:server` | ✅ bundle imports |
| Browser extension | `node apps/browser-extension/scripts/build.mjs --check` | ✅ pass |
| Playwright E2E | `CI=1 npm run test:e2e` | ✅ 35 passed, 12 skipped (design-gold), 1 flaky signup (passes on retry) |

`verify:full` composes lint → policy → api-error → test:run → build → smoke and is now enforced in [`.github/workflows/verify-full.yml`](../.github/workflows/verify-full.yml).

## Phase deliverables

### Runtime migration (P0)

- Added [`src/lib/structured-runtime-models.ts`](../src/lib/structured-runtime-models.ts)
- Removed legacy [`src/lib/claude-models.ts`](../src/lib/claude-models.ts)
- Contract: [`tests/structured-runtime-policy-contract.test.ts`](../tests/structured-runtime-policy-contract.test.ts)
- Moved PSTN voice policy tests to [`tests/vapi-voice-model-policy.test.ts`](../tests/vapi-voice-model-policy.test.ts)

### Dual-voice PSTN honesty (P1)

- Schema: `phone_voice_id`, `phone_voice_provider` on `agents` + migration `0082_phone_voice_routing.sql`
- Vapi factory uses phone voice when `voiceProvider === "presenter"`
- Fast Start auto-provisions default Vapi curated phone voice for presenter picks
- Studio hides PSTN warning when phone voice is configured

### FTUX / activation (P1)

- Behavioral tests: [`tests/wireline-create-flow.test.ts`](../tests/wireline-create-flow.test.ts)
- Playwright: [`tests/e2e/fast-start-activation.spec.ts`](../tests/e2e/fast-start-activation.spec.ts)

### Design (P1)

- Paper theme semantic aliases in [`src/styles/theme-light.css`](../src/styles/theme-light.css)
- Removed raw `bg-black/[0.04]` demo chip in Auth directory

### Funnel taxonomy (P2)

- Events: `agent_created`, `post_create_wizard_step_completed`, `first_call_completed`, `upgrade_to_paid`
- Contract updated in [`tests/product-events-contract.test.ts`](../tests/product-events-contract.test.ts)

### Business custom presence (P2)

- [`src/components/video-presenter/CustomPresenceConsentPanel.tsx`](../src/components/video-presenter/CustomPresenceConsentPanel.tsx) — rights → capture → review FTUX
- Wired in [`AgentPresenceLivePreview.tsx`](../src/components/AgentPresenceLivePreview.tsx) → `videoPresenterConsentStatus`

## Live ops proof

| Check | Result | Notes |
|-------|--------|-------|
| Production `/api/health` | ✅ HTTP 200 | `https://trywireline.com/api/health` |
| Local `verify:full` | ✅ green | See table above |
| Supabase security advisors | ⚠️ review | Leaked-password protection — see advisor output below |
| Live Stripe micro-transaction | ⏳ operator | Requires owner credentials; catalog contract green locally |
| Vercel READY post-push | ⏳ pending | Confirm after `git push origin main` |
| Sentry DSN | ⏳ operator | Document in Vercel env if not set |

### Supabase security advisor (2026-07-05)

Run `get_advisors(security)` on 2026-07-05:

- **WARN** `auth_leaked_password_protection` — Leaked password protection disabled.  
  Remediation: [Password strength and leaked password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)

## Merge criteria checklist

- [x] `runtime:policy:check` in `verify:full` and CI workflow
- [x] `npm run verify:full` green (221 tests)
- [x] `npm run test:e2e` green (CI worker, flaky signup retries)
- [x] `api-error:check` green
- [x] Dual-voice PSTN path implemented
- [x] Paper theme contrast tokens extended
- [x] Funnel events contract shipped
- [x] Certification doc signed
- [ ] Ops: Supabase password protection enabled (operator)
- [ ] Ops: Stripe live proof transaction (operator)
- [ ] Vercel production READY after push

## Related docs

- [TAKEOVER_AUDIT_2026-07-05.md](./TAKEOVER_AUDIT_2026-07-05.md)
- [WIRELINE_2026_ROADMAP.md](./WIRELINE_2026_ROADMAP.md)
- [PRESENTER_VENDOR_STRATEGY.md](./PRESENTER_VENDOR_STRATEGY.md)
