# Security Policy

## Supported versions

Wireline tracks the latest commit on `main`. Security fixes are not
backported to historical releases — pull `main` to get the latest patch.

## Reporting a vulnerability

**Do not open a public GitHub issue for security reports.**

Instead, email the maintainers directly. Include:

- A description of the issue and its impact
- Steps to reproduce (or a proof-of-concept payload)
- The commit SHA or deployed URL where you observed the problem
- Your name / handle for credit (optional)

We aim to acknowledge reports within **2 business days** and to ship a
fix or mitigation for high-severity issues within **7 days**.

## Scope

In-scope:

- The Wireline web app and its API surface (`/api/*`)
- Authentication, RLS, and session handling via Supabase
- Webhook endpoints (Vapi, Stripe) and their signature verification
- Anything that could allow account takeover, data exfiltration,
  privilege escalation, or unauthenticated AI spend
- Dependencies bundled into the deployed artifact

Out of scope:

- Findings that require physical or local access to a user's device
- Self-XSS that requires the victim to paste attacker-controlled code
  into the browser console
- Issues requiring outdated browsers (anything older than the last two
  Chrome / Firefox / Safari major releases)
- Rate-limit bypass via legitimate operator API keys (those are trusted)
- Reports purely about missing best-practice headers when they don't
  unlock a concrete attack
- Social engineering of staff or users

## Coordination

Please give us a reasonable disclosure window — typically 90 days from
the date of acknowledgment, or sooner if a patch ships first. We're
happy to credit researchers in the release notes once a fix is live.
