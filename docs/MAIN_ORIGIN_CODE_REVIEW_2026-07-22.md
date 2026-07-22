# Main/origin code review — 2026-07-22

Status: **verification branch** — security, integration, error-contract, and operating-documentation hardening.

## Verified defects addressed

1. **Mailbox ownership reassignment**
   - `wireline_email_accounts.email_address` is globally unique.
   - Google, Microsoft, Yahoo, and iCloud connection flows previously updated `user_id` on conflict.
   - A mailbox conflict could therefore transfer the stored connection to a different tenant.
   - All supported providers now use one atomic Postgres upsert whose update predicate requires the existing `user_id` to match the connecting tenant. Cross-tenant conflicts return `409` and never mutate ownership.

2. **OAuth provider response assumptions**
   - Google and Microsoft callbacks could reach credential encryption with a missing access token.
   - Microsoft profile responses were parsed without checking the HTTP status.
   - Required provider fields are now validated before persistence.

3. **Mailbox canonicalization**
   - OAuth-returned addresses were not normalized consistently.
   - Provider connection paths now trim and lowercase mailbox addresses before persistence.

4. **Daily brief Gmail readiness drift**
   - The settings response treated any connected mailbox as Gmail even though sending requires `provider = google`.
   - Readiness now checks an actual Google mailbox.

5. **Daily brief validation masked as server failure**
   - Deliberate `400` validation errors were caught and converted to `500`.
   - `AppError` responses now preserve their intended status and message.

6. **Stale AI runtime error contract**
   - The daily brief implementation emits `AI_RUNTIME_OFFLINE`, while send-now and cron handling still checked the retired `CLAUDE_OFFLINE` contract.
   - The current code is recognized as a `503`/skip condition; the legacy code remains accepted for compatibility.

7. **Operator documentation drift**
   - `AGENTS.md` still described migration `0082_phone_voice_routing.sql` as targeting the wrong table even though the migration now correctly targets `wireline_agents`.
   - Verification guidance now distinguishes GitHub Actions billing startup failures from code failures.

## Verification posture

- Regression contract: `tests/mailbox-and-daily-brief-hardening-contract.test.ts`.
- Preview commit deliberately carries `[launch-deep-audit]` so `scripts/vercel-build.mjs` runs full TypeScript, server TypeScript, audit-module TypeScript, ESLint, and Vitest before the production build.
- GitHub Actions jobs may not start while Actions billing is blocked; that state is infrastructure-only and is not used as the executable code gate for this pass.
