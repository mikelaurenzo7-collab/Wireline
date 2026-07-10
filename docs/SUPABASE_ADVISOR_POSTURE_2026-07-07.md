# Supabase Advisor Posture - 2026-07-07

Last refreshed: **2026-07-10** via Supabase MCP against project `ogenlhodmwvyacvnrsnj` (`us-east-2`, active healthy, Postgres 17).

## Security

Supabase security advisors currently report one warning:

- `auth_leaked_password_protection` - Supabase Auth leaked-password protection is disabled.

Wireline does not use Supabase Auth for sign-up, sign-in, password reset, session minting, or session verification. The active password-verification path is Wireline-owned custom auth with Have I Been Pwned k-anonymity screening, documented in `docs/security/auth-password-controls.md`.

Decision: keep Wireline's custom breached-password control as the production control. Enabling Supabase Auth leaked-password protection is still acceptable as a defense-in-depth dashboard setting, but it is not the active app control and the current connector does not expose an Auth config write.

Remediation reference: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Performance

Supabase performance advisors report `unused_index` infos across low-traffic and future-path tables. The 2026-07-10 table inventory confirmed the application tables are present and RLS-enabled, including `wireline_deletion_queue`, `wireline_jobs`, `wireline_call_logs`, `wireline_audit_log`, `wireline_users`, Stripe/billing tables, SMS/email tables, MCP tables, and browser handoff tables.

Decision: do not drop these indexes from a live shared production database solely because the advisor has not observed traffic. Treat each candidate as traffic-evidence work:

- Verify production query plans and call frequency for the owning feature.
- Keep indexes that protect latency on rare but important flows, including auth, OAuth, callbacks, handoff, billing, audit, recovery, DNC, compliance, and account-deletion paths.
- Remove only indexes with a clear write-amplification cost and no current or roadmap-backed read path.
- Never drop an index during a repo cleanup pass unless the exact feature owner, query plan, and rollback path are documented in a migration.

Remediation reference: https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index

## Current external posture

- Project status: active healthy.
- Security advisor posture: one warning, accepted because custom auth owns the relevant control.
- Performance advisor posture: informational; evidence-gated.
- Data safety posture: no data migrations or index drops were applied in this pass.
