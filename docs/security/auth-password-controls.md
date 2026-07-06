# Auth Password Controls

Wireline uses its own email/password account table and internal JWT sessions. It does not use
Supabase Auth for sign-up, sign-in, password reset, session minting, or session verification.

## Decision

Supabase's `auth_leaked_password_protection` advisor is not the active control for Wireline
because that setting protects passwords verified by Supabase Auth. Wireline stores password
hashes in `wireline_users.password_hash`, mints `wireline-internal` HS256 JWTs locally, and serves
them through an HttpOnly `wireline_session` cookie.

The active Wireline control is now server-side breached-password screening in the custom auth
service:

- Sign-up and password reset run through `assertPasswordIsSafe`.
- The check uses the Have I Been Pwned Pwned Passwords k-anonymity range API.
- Wireline sends only the first five characters of the password's SHA-1 hash, never the password
  or the full hash.
- Production and Vercel default to fail-closed if the security check cannot run.
- Local development defaults to permissive mode, and tests default to off so auth tests never call
  the network.
- Emergency override: set `WIRELINE_PASSWORD_BREACH_CHECK=warn` or `off` only during a documented
  incident. The normal production mode is `enforce`.

## Existing session controls

- Password hashes use per-password salts and Node `scrypt`.
- Password reset tokens and email verification tokens are stored as SHA-256 hashes.
- Reset tokens are single-use and expire after one hour.
- Internal JWTs are HS256, issuer `wireline-internal`, audience `authenticated`, and expire after
  two hours.
- Browser sessions use an HttpOnly, Secure-in-production, SameSite=Lax cookie.
- Sign-in, sign-up, forgot-password, reset-password, verification resend, and session migration
  routes are rate-limited.

## Sources

- Supabase password security: https://supabase.com/docs/guides/auth/password-security
- Have I Been Pwned Pwned Passwords API: https://haveibeenpwned.com/API/v3#PwnedPasswords
- NIST SP 800-63B password guidance: https://pages.nist.gov/800-63-4/sp800-63b.html
