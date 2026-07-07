# Supabase Advisor Posture - 2026-07-07

Project checked: `ogenlhodmwvyacvnrsnj` (`us-east-2`, active healthy).

## Security

Supabase security advisors currently report one warning:

- `auth_leaked_password_protection` - Supabase Auth leaked-password protection is disabled.

Wireline does not use Supabase Auth for sign-up, sign-in, password reset, session minting, or session verification. The active password-verification path is Wireline-owned custom auth with Have I Been Pwned k-anonymity screening, documented in `docs/security/auth-password-controls.md`.

Decision: keep Wireline's custom breached-password control as the production control. Enabling Supabase Auth leaked-password protection is still acceptable as a defense-in-depth dashboard setting, but it is not the active app control and the current connector does not expose an Auth config write.

Remediation reference: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Performance

Supabase performance advisors report `unused_index` infos across low-traffic and future-path tables.

Decision: do not drop these indexes from a live shared production database solely because the advisor has not observed traffic. Treat each candidate as traffic-evidence work:

- Verify production query plans and call frequency for the owning feature.
- Keep indexes that protect latency on rare but important flows, including auth, OAuth, callbacks, handoff, billing, audit, and recovery paths.
- Remove only indexes with a clear write-amplification cost and no current or roadmap-backed read path.

Remediation reference: https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index
