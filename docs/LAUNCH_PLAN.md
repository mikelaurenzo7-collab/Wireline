# Wireline launch execution plan

This branch is in hardening mode. The launch path is to make the product feel cohesive, truthful, fast, accessible, and operationally gated before production promotion.

## Immediate launch blockers

1. Keep the branch synchronized with `origin/main` before final review.
2. Keep Vercel preview builds green for the active branch.
3. Keep the GitHub `quality` workflow green.
4. Keep the copy and utility audit clean.
5. Enable Supabase leaked-password protection in Auth settings before public launch.
6. Confirm no Vercel runtime error clusters on the target deployment.
7. Confirm no unresolved critical Vercel Toolbar threads on the target branch.

## Product quality bar

Wireline ships when every visible surface follows the same model:

- **Create**: define the agent, its role, voice, business context, and line ownership.
- **Train**: attach documents, policy, escalation behavior, integrations, and evaluation inputs.
- **Run**: operate calls, texts, follow-up, approvals, handoff, and review loops.

No surface should impersonate real progress. Missing data must be shown as a clear empty state with the next action.

## Required route set

Core public routes:

- `/`
- `/features`
- `/pricing`
- `/showcase`
- `/compare`
- `/for/personal`
- `/for/home-services`
- `/for/medical`
- `/for/legal`
- `/for/real-estate`
- `/for/insurance`
- `/for/restaurants`
- `/for/sales`
- `/about`
- `/blog`
- `/security`
- `/status`
- `/support`
- `/contact`
- `/privacy`
- `/terms`

Core workspace routes:

- `/overview`
- `/studio`
- `/knowledge`
- `/templates`
- `/inbox`
- `/call-logs`
- `/connections`
- `/settings`
- `/settings/apps`
- `/settings/billing`
- `/settings/phone`
- `/settings/team`

## Promotion checklist

Before production promotion:

- GitHub status checks pass on the final commit.
- Vercel preview deployment is READY.
- Required routes return a live app shell and no server error.
- `npm run lint` passes.
- `npm run design:check` passes.
- `npm run copy:check` passes.
- `npm run test:run` passes.
- `npm run test:e2e` passes with Chromium installed.
- Vercel runtime errors are clean for the relevant deployment window.
- Supabase security advisors show no launch-blocking Auth warning.

## First 7 launch days

Daily:

- Check Vercel runtime errors for the last 24 hours.
- Check Supabase Auth logs for unusual signup, login, reset, or password-change spikes.
- Run the copy and utility audit on `main`.
- Walk `/signin`, `/signup`, `/studio`, and `/settings` by keyboard.

Twice weekly:

- Review Vercel Speed Insights for `/`, `/signin`, `/overview`, and `/studio`.
- Review top visited routes in analytics to verify the funnel is being used as intended.

## Non-negotiables

- No seeded customer names, fake phone numbers, fake balances, fake readiness percentages, or fake account data on production surfaces.
- No client-side provider keys, billing authority, OAuth secrets, system prompts, or model routing authority.
- No browser extension broad host permissions or persistent content scripts.
- No native claim that a capability is live until the entitlement and hardware flow are verified.
