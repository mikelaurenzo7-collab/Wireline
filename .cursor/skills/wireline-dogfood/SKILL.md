---
name: wireline-dogfood
description: >-
  Exhaustive production dogfood QA for Wireline at trywireline.com — real demo
  account, multi-angle route/chat/Stitch testing, bug hunting, and world-class
  UX/UI audits. Use when asked to dogfood, smoke-test prod, QA the live product,
  find bugs, or polish the operator console toward flawless quality.
---

# Wireline dogfood

Ruthlessly exercise **https://trywireline.com** (or local when iterating fixes).
Goal: zero regressions, zero dead ends, world-class operator UX.

Load **wireline-design** for UI/UX criteria. Use **run-wireline** only when
debugging against `localhost:3000`.

## Environment choice

| Target | When |
|--------|------|
| **Production** (`https://trywireline.com`) | Default. Real auth, APIs, Stitch, seeded fleet, billing gates |
| **Local** (`npm run dev`) | After you have a code fix to verify; run `npm run verify` before prod re-check |

Production dogfood beats mocked local QA for functional bugs. Local + `authed-qa.mjs`
is for layout regressions and fast UI iteration.

## Demo account

Credentials (override via env — never commit secrets):

```bash
export DOGFOOD_EMAIL=wireline.demo@trywireline.com
export DOGFOOD_PASSWORD=WirelineDemo!2026
export APP_URL=https://trywireline.com
```

The account is **fully seeded** (agents, channel samples, pipeline). **Do not**
delete agents, re-seed the fleet, or call `/api/admin/seed-demo-account` unless
the user explicitly asks.

## Session reset (start fresh)

Before each dogfood run, clear **only** prior test activity:

```bash
node scripts/dogfood-reset.mjs
# or: node scripts/dogfood-reset.mjs --base https://trywireline.com
```

This clears Director thread + artifacts and demo-flagged call/lead/email/SMS
rows. Agents and core seed data stay intact.

Equivalent manual steps:

```bash
node scripts/clear-demo-director.mjs
# then DELETE /api/admin/demo-data with session cookie
```

## Dogfood workflow

Copy and track:

```
Wireline dogfood @ trywireline.com
- [ ] Reset session (dogfood-reset.mjs)
- [ ] Automated sweep (prod-dogfood + dogfood-director)
- [ ] Design path (`/design` Painter + preview) — if Wireline Design in scope
- [ ] Browser deep-dive (MCP or --headed Playwright)
- [ ] Responsive pass (390 / 834 / 1440)
- [ ] UX/UI audit (wireline-design checklist)
- [ ] Write report → terminals/dogfood-prod/
- [ ] Fix P0/P1 bugs; re-run affected probes
```

### Phase 1 — Automated baseline

```bash
npx playwright install chromium   # once
node scripts/dogfood-reset.mjs
node scripts/prod-dogfood.mjs
node scripts/dogfood-director.mjs
```

For Wireline Design, dogfood `/design` (Painter studio + live preview panel) in Phase 2.

Artifacts land in `terminals/dogfood-prod/` (`report.json`, `screenshots/`).

**Fail the run** on any `report.failed` entry. Treat `warnings` as bugs until
explained (e.g. benign CSP on third-party embeds).

### Phase 2 — Interactive deep-dive (Cursor browser)

Use **`cursor-ide-browser`** MCP so the user can watch prod dogfood in the
Cursor browser panel. Demo account:

```text
wireline.demo@trywireline.com / WirelineDemo!2026
```

Workflow:

1. `browser_navigate` → `https://trywireline.com/signin`
2. `browser_fill` email + password → `browser_click` Sign in
3. `browser_navigate` → `/design` — run a Painter prompt (landing page or app screen)
4. Confirm the **live preview panel** fills on desktop; on mobile use Chat/Preview tabs
5. Optionally `/chat` with Design mode — confirm handoff to `/design` for design-shaped prompts
6. `browser_take_screenshot` for failures → `terminals/dogfood-prod/design/screenshots/`

Design previews render in the **/design studio** or `/design/preview` — not Google Stitch.

Use headed Playwright (`prod-dogfood.mjs`) when you need batch screenshots without the Cursor browser UI.

- Tab order, focus traps, keyboard send in Director
- Hover-only actions on mobile widths
- Empty vs loading vs error states
- Toast copy, confirm dialogs, destructive actions
- Scroll-reveal voids on marketing pages (scroll before judging)
- Network tab: 4xx/5xx, slow endpoints, SSE drops

Login: navigate to `/auth`, sign in with demo credentials, or seed cookie via
API signin (see `scripts/prod-dogfood.mjs` `loginViaApi`).

Dismiss onboarding noise in browser:

```js
localStorage.setItem("wireline_post_signup_dismissed", "true");
localStorage.setItem("wireline_onboarding_celebrated", "true");
```

### Phase 3 — Multi-angle coverage

Full matrix: [coverage.md](coverage.md). Minimum every run:

1. **All sidebar routes** — no sign-in redirect, no error boundary copy
2. **Director** — fleet audit, code snippet, GTM roleplay (in `prod-dogfood.mjs`)
3. **Director API** — code, website/Stitch, routing guards (`dogfood-director.mjs`)
4. **Ops** — Actions + Analytics tabs
5. **Admin** — Growth engine tab
6. **390px mobile** — shell, sidebar, composer, tables don't clip
7. **Console** — zero unexplained `console.error` (ignore aborted fonts/analytics)

### Phase 4 — UX/UI audit (world-class bar)

Apply **wireline-design** + elite-product-designer lens. Flag:

| Severity | Examples |
|----------|----------|
| **P0** | Broken flows, data loss, auth leaks, clipped primary CTA, unreadable contrast |
| **P1** | Off-brand colors, missing empty/loading/error states, touch targets < 44px |
| **P2** | Copy tone, micro-motion, density tuning, nice-to-have polish |

Per screen: hierarchy, scannability, trust (approvals/compliance), Director tone
(specific, operator-facing — not generic AI fluff).

### Phase 5 — Database spot-check (optional)

Use **Supabase MCP** when symptoms point to data (missing seed, stale threads,
wrong tenant isolation):

- Confirm demo user rows exist; dogfood deletes only `demo=true` / seed prefixes
- Never bulk-delete `agents` for the demo account
- Cross-check API responses vs DB when UI shows empty but seed should exist

### Phase 6 — Fix and verify

1. Fix P0 immediately; batch P1 when sensible
2. `npm run verify` for code changes
3. Re-run **only failed probes** + adjacent routes
4. Update report with before/after

## Local layout QA (supplement)

When prod is clean but you changed UI:

```bash
npm run dev
# mocked authed console — no real Stitch
QA_URL=http://localhost:3000 node .claude/skills/run-wireline/authed-qa.mjs
node .claude/skills/run-wireline/driver.mjs viewports --route /chat --full
```

## Report output

Write findings to `terminals/dogfood-prod/dogfood-report.md` using
[report-template.md](report-template.md). Include:

- Run metadata (base URL, date, commit if known)
- Automated scores from `report.json`
- Screenshots paths for failures
- Prioritized bug list with repro steps
- UX improvements with file hints for fixes

## Route reference

| Route | Auth | Dogfood focus |
|-------|------|---------------|
| `/` `/pricing` `/showcase` `/compare` | No | Marketing, scroll-reveal, CTAs |
| `/auth` | No | Sign-in, error states |
| `/chat` | Yes | Director, Stitch gallery, streaming |
| `/agents` `/training` | Yes | Fleet, playbooks, empty states |
| `/ops` `/triage` | Yes | Live ops, tabs, density |
| `/phone` `/sms` `/email` `/pipeline` | Yes | Channel tables, seeded data |
| `/insights` `/integrations` | Yes | Charts, marketplace cards |
| `/admin` | Yes | Settings, Growth tab (`?tab=flywheel`), team/billing |
| `/admin/growth` | Yes | Redirect → `/admin?tab=flywheel` |
| `/ops/actions` | Yes | Redirect → `/ops?tab=intel` |

`/director` and `/settings` are **not** routes — expect redirect/404.

**Tab aliases:** `/ops?tab=actions` → Actions (`intel`); `/admin?tab=growth` → Growth (`flywheel`).

## Strict rules

1. **Production first** unless actively fixing local code
2. **Reset before run** — never pile dogfood messages onto a dirty thread
3. **Never clear agents** on the demo account
4. **Fail closed** — ambiguous UI = bug until confirmed intentional
5. **Screenshot failures** — visual evidence in `terminals/dogfood-prod/screenshots/`
6. **No console.log in fixes** — use `log.*` per repo conventions

## Scripts index

| Script | Purpose |
|--------|---------|
| `scripts/dogfood-reset.mjs` | Clear Director + demo dogfood data |
| `scripts/prod-dogfood.mjs` | Login, route sweep, chat roleplay, screenshots |
| `scripts/dogfood-marketing.mjs` | Marketing-only sweep (public routes + viewports) |
| `scripts/dogfood-director.mjs` | API-level Director capability probes |
| `/design` (Painter) | Wireline Design studio + live preview panel |
| `scripts/clear-demo-director.mjs` | Director thread only |
| `.claude/skills/run-wireline/authed-qa.mjs` | Local mocked console layout QA |

Artifacts write to `terminals/dogfood-prod/` (gitignored — local QA output only).

## Related skills

| Skill | When |
|-------|------|
| wireline-design | UX/UI audit criteria and tokens |
| run-wireline | Local dev server + Playwright drivers |
| browser-automation | MCP interactive browsing |
| elite-product-designer | Structured critique and screen specs |
