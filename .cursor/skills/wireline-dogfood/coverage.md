# Wireline dogfood — coverage matrix

Use this checklist for thorough runs. Mark each item pass / fail / skip with reason.

## A. Authentication & session

- [ ] Sign-in with demo credentials succeeds
- [ ] Session persists across route changes (no surprise `/auth` redirect)
- [ ] Sign-out works; protected routes redirect
- [ ] Owner role sees admin routes
- [ ] Onboarding modals dismissed; no blocking overlays on core work

## B. Marketing (session-optional)

Marketing routes must render without waiting on `/api/auth/session` hydration.

| Route | Checks |
|-------|--------|
| `/` | Hero, nav, scroll-reveal sections render after scroll, CTA links |
| `/pricing` | Plan cards, contact-sales path, mobile sticky CTA clearance |
| `/showcase` | Demo lines load |
| `/compare` | Table readable at 390px |
| `/about` `/support` `/developers` `/blog/*` `/for/*` | Forms, links, no 404 assets |

## C. App shell (all authenticated routes)

- [ ] Sidebar: active state, labels, collapse on mobile
- [ ] TopBar: title matches route, actions reachable
- [ ] 390px: hamburger, no horizontal scroll, 44px touch targets
- [ ] 834px tablet: two-column layouts don't crush
- [ ] 1440px desktop: no excessive dead space (see authed-qa flex diagnostic)
- [ ] Dark mode toggle (if exposed): tokens stay on-brand

## D. Route sweep (production)

Run via `prod-dogfood.mjs` or manual browser:

| Route | Deep checks |
|-------|-------------|
| `/chat` | Composer, starter prompts, send, stream, clear thread |
| `/ops` | Default view + Actions tab + Analytics tab (`?tab=actions` aliases to `intel`; `/ops/actions` redirects) |
| `/agents` | Fleet list, agent cards, create/edit entry points |
| `/training` | Playbooks, empty state if cleared |
| `/phone` | Call log table, seeded rows visible |
| `/sms` | Thread list, message preview |
| `/email` | Inbox threads, open thread |
| `/pipeline` | Stages, seeded showcase badge |
| `/insights` | Charts load, no blank panels |
| `/integrations` | Marketplace grid, connect CTAs |
| `/admin` | Tabs load + **Growth** tab (`?tab=flywheel`; `?tab=growth` and `/admin/growth` redirect) |
| `/triage` | Queue renders |

Per route: no "Something went wrong", error boundary, or < 40 chars body text.

## E. Director — UI probes (`prod-dogfood.mjs`)

| Probe | Validates |
|-------|-----------|
| fleet-audit | Fleet context, prioritized recommendations |
| code-snippet | Code block in reply, Zod/TS quality |
| gtm-roleplay | Long-form advisory, no stream interrupt |

Also manually:

- [ ] Capability chips / accessory bar
- [ ] File attach (if enabled)
- [ ] Approval cards when integration proposes action
- [ ] Artifacts panel after code/website deliverables
- [ ] Clear thread → empty state copy

## F. Director — API probes (`dogfood-director.mjs`)

| Probe | Validates |
|-------|-----------|
| code | POST reply with code |
| code-natural | No erroneous Stitch routing |
| website | Stream → Stitch or HTML deliverable |
| not-logo | Website ask doesn't hijack logo approval |
| hero-not-creative | Hero+HTML → Stitch or fleet LLM |
| opus-auto | General fleet summary |

## G. Wireline Design (`/design` Painter studio)

- [ ] Prompt sends; Painter working state
- [ ] Live preview panel fills (desktop) or Preview tab (mobile)
- [ ] Preview tabs: Screenshot / Live HTML / Export
- [ ] Device frame renders; no permanent spinner
- [ ] Screenshots saved under `terminals/dogfood-prod/design/`

## H. Channel & ops workflows

- [ ] Phone: filter/search, row expand, demo badge on seeded calls
- [ ] SMS: thread open, reply composer (don't send real SMS unless intended)
- [ ] Email: thread detail, HTML/plain rendering
- [ ] Pipeline: drag or stage actions if implemented
- [ ] Triage: item actions, priority indicators
- [ ] Ops Actions: proposed vs live distinction clear

## I. Integrations & admin

- [ ] Integration cards: logo, status, connect flow opens
- [ ] Admin billing tab: plan display, no crash on missing Stripe in dev
- [ ] Team invite UI (don't spam real invites in prod)
- [ ] Growth engine panel content loads

## J. Error & edge cases

- [ ] Invalid route → sensible 404 or redirect
- [ ] Double-submit send in Director → no duplicate chaos
- [ ] Network offline mid-stream → recoverable error toast
- [ ] Long thread scroll performance
- [ ] `prefers-reduced-motion`: no essential info in motion-only cues

## K. Observability

- [ ] Browser console: catalog errors (classify CSP/font vs real bugs)
- [ ] Network: no 500 on core `/api/*` during sweep
- [ ] SSE `/api/director/messages/stream` completes with `done` event

## L. UX/UI quality (wireline-design)

Per P0 surface in `wireline-design/surfaces.md`:

- [ ] Purple + cream only; no new off-brand hues
- [ ] `wl-panel` / tokens over ad-hoc `bg-white/10`
- [ ] Section labels use `app-section-title` or `wl-label`
- [ ] Empty states: helpful copy + primary action
- [ ] Loading: skeleton or spinner with context
- [ ] Error: actionable retry, not raw stack traces
- [ ] Tables: sticky header, zebra optional, mobile card fallback
- [ ] Director copy: specific, operator-facing

## M. Regression triggers

Re-run full matrix when touching:

- `DirectorWorkspace.tsx`, `director/*`
- `AppShell`, `Sidebar`, `TopBar`
- `director-routes.ts`, `director-stitch-service.ts`
- `src/index.css`, `wireline-director-design.ts`
- Auth, session, or demo seed paths
