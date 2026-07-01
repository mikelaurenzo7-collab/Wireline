# Wireline merge gates

This document defines the branch and production gates for launch hardening.

## Branch gate

Every pull request or branch push that is intended for review must pass:

- GitHub `quality` workflow.
- Vercel preview build.
- TypeScript check.
- Design contract check.
- Copy and utility audit.
- Unit tests.
- Playwright route smoke.

## Quality workflow

The `quality` workflow must:

- run on `pull_request`, branch `push`, and `merge_group` events,
- cancel superseded runs with concurrency,
- install dependencies with `npm ci`,
- install Chromium before Playwright runs,
- upload Playwright reports for failed or cancelled investigations,
- use Node 20 until the repo intentionally moves engine support forward.

## Vercel gate

Before merge:

- Latest branch preview is READY.
- `Vercel – wireline` succeeds.
- `Vercel – v0-project` is not hiding a Wireline blocker.
- Runtime error clusters are clean for the preview window.
- Unresolved critical Toolbar feedback is cleared.

Before production promotion:

- Promote a known green deployment.
- Check runtime errors after promotion.
- Re-run the route smoke against the production hostname.
- Keep a rollback deployment identified.

## Supabase gate

Before launch:

- Security advisors should not show launch-blocking Auth findings.
- Leaked-password protection must be enabled in Supabase Auth settings when plan support allows it.
- Password helper copy must match backend password policy.
- Auth logs must be reviewed during launch week.
- RLS posture must be reviewed for tables exposed to browser clients.

## Human QA gate

Before merge, perform a quick manual pass on:

- `/` on mobile and laptop.
- `/signin` and `/signup` with invalid inputs.
- `/overview` after sign-in.
- `/studio` empty and configured states.
- `/knowledge` empty and trained states.
- `/templates` first impression and card actions.
- `/settings`, `/settings/phone`, `/settings/team`, and `/settings/billing`.

## Release decision

A release is blocked when any of these are true:

- A production surface shows seeded customer data or invented readiness.
- A required route server-errors.
- Auth error messaging fails silently.
- Latest Vercel preview is not READY.
- Supabase security warnings include an unresolved launch-blocking Auth control.
- The quality workflow fails on the final commit.
