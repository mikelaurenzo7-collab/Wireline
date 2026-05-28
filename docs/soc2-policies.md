# Wireline SOC 2 control narrative

Wireline is not SOC 2 Type II certified yet. This document describes the
controls implemented today, the evidence the app can produce, and the gaps
remaining before external attestation. It exists so prospects and operators see
the same honest story.

## Scope

Wireline processes customer call metadata, transcripts, agent configuration,
knowledge sources, OAuth connection records, billing metadata, DNC entries, and
audit events. The current deployment model is a Vercel-hosted application with
Postgres on Supabase, Vapi/ElevenLabs for voice, Anthropic for reasoning,
Stripe for billing, Twilio for SMS, and Resend for transactional email.

## Implemented controls

| Area              | Current control                                                                                                                  | Evidence source                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Access control    | Role-based API middleware gates sensitive routes and fails closed when role lookup fails.                                        | `src/middleware/require-role.ts`                                                              |
| Authentication    | Passwords are hashed with scrypt; OAuth sign-in supports Google, Microsoft, and Yahoo; JWTs are signed by `INTERNAL_JWT_SECRET`. | `src/lib/auth-service.ts`, `src/routes/auth-oauth-routes.ts`                                  |
| Audit logging     | Billing, security, access, and settings changes are written to an append-only audit log.                                         | `src/lib/audit-logger.ts`, `src/routes/soc2-routes.ts`                                        |
| Webhook integrity | Vapi, Stripe, Twilio, Meta, and ElevenLabs webhooks use shared-secret or signature verification.                                 | `src/routes/*webhook*`, `src/routes/vapi-routes.ts`                                           |
| Secrets at rest   | Webhook secrets are encrypted with AES-256-GCM via `WIRELINE_DATA_KEY`; plaintext fallback is not allowed.                       | `src/lib/secret-vault.ts`                                                                     |
| Data deletion     | Account deletion queues and purges user-owned tables with a documented 30-day grace window.                                      | `src/lib/account-deletion.ts`                                                                 |
| Spend controls    | Claude spend and outbound dialing paths have budget/rate gates and trial caps.                                                   | `src/lib/spend-guards.ts`, `src/lib/trial-gate.ts`                                            |
| Public trust      | `/status`, `/security`, `/changelog`, `security.txt`, and `humans.txt` publish operational posture without requiring sign-in.    | `src/components/Status.tsx`, `src/components/Security.tsx`, `public/.well-known/security.txt` |

## Supabase posture

Supabase advisors currently show tables with RLS enabled but missing policies,
tables visible through the GraphQL schema to `anon`/`authenticated`, and a
public executable `SECURITY DEFINER` function. Until those are remediated,
Wireline should describe tenant isolation as **application-enforced with RLS
hardening in progress**, not as complete database-layer isolation.

Remediation should follow Supabase's own linter guidance:

- RLS policy coverage: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- GraphQL exposure: https://supabase.com/docs/guides/database/database-linter?lint=0026_pg_graphql_anon_table_exposed
- Security definer exposure: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable

## Not yet complete

- SOC 2 Type II external audit and observation window.
- Full Supabase RLS policy coverage for every tenant table.
- Removal of unintended GraphQL exposure for tenant-owned tables.
- Hardware-key MFA for operators.
- Paid public bug bounty.
- EU data residency.
- Enterprise SSO/SCIM.

## Operating rule

Marketing, sales agents, and product UI must say **controls implemented / audit
in progress** until attestation is complete. Do not claim SOC 2 certification,
HIPAA certification, or blanket database-layer RLS isolation before those
controls are externally verified.
