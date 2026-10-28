# BotBound SOC 2 control narrative

BotBound is not SOC 2 Type II certified yet. This document describes the
controls implemented today, the evidence the app can produce, and the gaps
remaining before external attestation. It exists so prospects and operators see
the same honest story.

## Scope

BotBound processes customer call metadata, transcripts, agent configuration,
knowledge sources, OAuth connection records, billing metadata, DNC entries,
Computer task activity, and audit events. The current deployment model uses Render for the web/API and persistent voice runtime, with
Postgres on Supabase, Twilio for carrier/numbers/SMS, xAI Grok Voice for live
phone calls (OpenAI Realtime as the fallback and for browser rehearsals), OpenAI
TTS for approved campaign narration, the managed reasoning
chain in `src/lib/ai-models.ts`, Stripe for billing, AgentMail for managed Bot
mailboxes, Resend for transactional email, Browserbase for hosted Computer
sessions, and Sentry for configured error reporting. Live phone calls use xAI's
built-in Grok voices; browser rehearsals use OpenAI's. Optional operator voice-preview pilots
are separate, disabled until their own readiness and processing gates are met.

## Implemented controls

| Area              | Current control                                                                                                                              | Evidence source                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Access control    | Role-based API middleware gates sensitive routes and fails closed when role lookup fails.                                                    | `src/middleware/require-role.ts`                                                                       |
| Authentication    | Passwords are hashed with scrypt; OAuth sign-in supports Google, Microsoft, and Yahoo; JWTs are signed by `INTERNAL_JWT_SECRET`.             | `src/lib/auth-service.ts`, `src/routes/auth-oauth-routes.ts`                                           |
| Audit logging     | Billing, security, access, and settings events use a tenant-scoped audit ledger; financial settlement and erasure have explicit write paths. | `src/lib/audit-logger.ts`, `src/routes/soc2-routes.ts`                                                 |
| Webhook integrity | OpenAI, Stripe, Twilio, Resend, and Meta webhooks use shared-secret or signature verification.                                               | `src/routes/*webhook*`, `src/routes/openai-sip-routes.ts`                                              |
| Secrets at rest   | Webhook secrets are encrypted with AES-256-GCM via `WIRELINE_DATA_KEY`; plaintext fallback is not allowed.                                   | `src/lib/secret-vault.ts`                                                                              |
| Data deletion     | Account deletion queues and purges user-owned tables with a documented 30-day grace window.                                                  | `src/lib/account-deletion.ts`                                                                          |
| Spend controls    | Managed AI spend and outbound dialing paths have budget/rate gates and trial caps.                                                           | `src/lib/spend-guards.ts`, `src/lib/trial-gate.ts`                                                     |
| Public trust      | `/security`, `/trust`, `/changelog`, `security.txt`, and `humans.txt` publish BotBound's posture without requiring sign-in.                  | `src/components/Security.tsx`, `src/components/PublicChangelog.tsx`, `public/.well-known/security.txt` |

## Supabase posture

Application tenant access uses transaction-local `SET LOCAL ROLE wireline_server`
and `app.current_user_id`; Supabase Auth is not the authentication authority.
Committed migrations and passing source checks do not prove the current live
catalog. Before making a broad isolation claim, retain a dated read-only review
of table grants, RLS policies, exposed API schemas and privileged functions for
the actual production database and source revision. See
[DATABASE_OPERATIONS.md](./DATABASE_OPERATIONS.md).

When the current review identifies a corresponding issue, use Supabase's linter
guidance and a reviewed append-only migration rather than assuming historic
advisor output still describes production:

- RLS policy coverage: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- GraphQL exposure: https://supabase.com/docs/guides/database/database-linter?lint=0026_pg_graphql_anon_table_exposed
- Security definer exposure: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable

## Not yet complete

- External SOC 2 Type II attestation and a verified auditor engagement/observation window.
- A retained, complete live review of tenant-table policies, grants, API exposure and privileged functions.
- Operator hardware-key MFA and recovery procedures, confirmed with account-level evidence.
- Organization-enforced enterprise SSO/SCIM; provider sign-in alone does not supply these controls.
- Contract-specific residency commitments across the enabled providers and features.
- A funded public bug bounty, if the business chooses to offer one.

## Audit engagement and observation evidence

No auditor engagement, observation start/end dates or attestation target is
certified by this document. Before publishing those milestones, retain the
signed engagement, agreed scope, observation dates and evidence collection
requirements. A date range in the repository is not an audit observation window.

**Evidence to collect and review:**

- Audit log completeness — sample auth, billing, security and data-access paths; retain receipts and investigate missing writes rather than claiming universal coverage.
- Access control enforcement — role-based middleware, fail-closed JWT verification.
- Change management — retain exact-source command results and review evidence, plus the matching Render web/worker/cron deployments. GitHub Actions is intentionally disabled; automatic CI enforcement is not claimed. Follow [DEPLOYMENT_RUNBOOK.md](./DEPLOYMENT_RUNBOOK.md).
- Incident response — confirm the responsible contact, escalation coverage, severity decisions and completed incident records.
- Data retention — verify scheduled purge jobs actually ran and respected each tenant's configured retention, including failed-job follow-up.

**Evidence collection cadence:**

- **Runtime evidence:** audit log writes, Render deployment/runtime records, Stripe webhook receipts and rate-limit rejection counts. Confirm collection and alert delivery; configuration alone is not evidence of receipt.
- **Per release:** exact-source verification logs, review approval, graceful voice drain and matching Render service revisions.
- **Periodic operator review:** admin access, security advisories, restore/recovery drills, failed jobs, retention runs and applicable calling-compliance records. Record the actual review date, decision and owner.

## Operating rule

Marketing, sales agents, and product UI may describe specific implemented
controls and readiness work. Say an external audit is in progress only when the
engagement and actual work are documented. Do not claim SOC 2 certification,
HIPAA certification, a completed observation window, or blanket provider-region
or database-isolation guarantees without the matching evidence and agreements.
