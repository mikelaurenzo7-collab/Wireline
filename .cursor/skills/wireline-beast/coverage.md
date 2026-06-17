# Wireline Beast — authenticated E2E coverage

**Scope:** Signed-in operator product only. **Out of scope:** marketing (`/pricing`,
`/showcase`, public blog), logged-out landing pages.

**Prefer journeys first:** [operator-journeys.md](operator-journeys.md) covers the
product stories; this file is the **exhaustive supplement** so nothing is missed.

Mark each **pass / fail / skip**. Browser only — no scripts. **Director (§C) is
mandatory every full run.**

---

## Journey quick map

| Journey | Sections hit |
|---------|--------------|
| J1 Morning command | A, B, C (partial), G, E floor |
| J2 Floor hour | E, B |
| J3 Fleet audit | C |
| J4 Triage → contact | E triage, I contact |
| J5 Pipeline execute | I pipeline, C5 |
| J6 Integrations | J integrations, C7 |
| J7 Compliance | J DNC/audit, C5–C6 |
| J8 Painter | D |
| J9 First 15 min | A, B, C, H, J help |

---

## A. Session setup

- [ ] `/auth` → sign in with demo credentials (form submit)
- [ ] Lands on `/ops` (or intended post-auth surface)
- [ ] Session survives sidebar navigation
- [ ] **Chat** → Clear thread (confirm if pending approvals)
- [ ] **Design** → Clear thread
- [ ] Optional: sign out → protected route redirects (only if testing auth)

---

## B. App shell (design bar on every route)

- [ ] Sidebar groups: Workspace, Channels, Sales, Fleet, Admin (gear)
- [ ] **Design** nav shows Beta badge
- [ ] TopBar title matches route after click
- [ ] **1440px:** main content not clipped under expanded rail (see regression-watch DF-001)
- [ ] **390px:** hamburger opens nav; no horizontal page scroll
- [ ] **834px:** spot-check one workspace route
- [ ] Keyboard shortcuts (desktop): `g` `r` → Chat, `g` `d` → Ops, `g` `p` → Phone
- [ ] Tab focus visible; skip link if present
- [ ] Route transition: no stale previous page content >2s (DF-005)

---

## C. Director Chat (`/chat`) ★ REQUIRED

### C1. Composer toolbar (click every chip)

- [ ] Model picker
- [ ] Connectors panel
- [ ] Capabilities catalog → tap skill → composer filled
- [ ] Coach → select agent → Abilities chip
- [ ] Abilities toggle (when coaching)
- [ ] Design mode (BETA) toggle
- [ ] Brand setup panel
- [ ] Account branding toggle
- [ ] Deep (Brain) toggle
- [ ] Attach / PDF if available
- [ ] Enter sends; Shift+Enter newline

### C2. Starter prompts (click → send → stream completes)

Minimum 3; full run = all featured + one from **More prompts**:

- [ ] What agent should I hire first?
- [ ] Audit my fleet — what should I fix first?
- [ ] Set up a sales agent for my business
- [ ] Draft a one-page plan for my company
- [ ] Research competitors and pricing in my market
- [ ] Build a follow-up sequence for missed calls
- [ ] Write a support playbook for angry callers
- [ ] Generate logo concepts for my brand
- [ ] Design a website with HTML I can copy
- [ ] Review recent calls and coach my agents
- [ ] Help me set up compliant collections outreach

### C3. Strategy probes

| Prompt | Pass |
|--------|------|
| `Audit my fleet — what should I fix first?` | Stream completes; substantive reply |
| `What should my team focus on this week based on recent calls?` | |
| `Draft a one-page GTM plan for my business` | |
| `Analyze my outbound pipeline — where are deals stalling?` | |
| Deep on + `Do a deep dive on my fleet performance over the last 30 days` | |

### C4. Create probes

| Prompt | Pass |
|--------|------|
| `Draft a one-page business plan for my company` | |
| `Write a phone script for booking HVAC estimates` | |
| `Draft a 3-email follow-up sequence for missed calls` | |
| `Write an SOP for how agents should handle billing disputes` | |
| `Write homepage hero and three sections for my HVAC company` | |
| `Design a new website for my business — sitemap, section copy, and a mobile-first HTML prototype` | |
| `Write a TypeScript Express route with Zod validation that accepts a lead intake payload` | Fenced code |
| `Build an objection handling matrix for price, timing, and competition` | |

### C5. Execute / approvals ★ must approve + deny

| Prompt | Pass |
|--------|------|
| `Call Jordan Lee back about tomorrow's estimate` | ProposalCard |
| `Text the lead we spoke with yesterday a booking link` | |
| `Email the customer a summary of our call and next steps` | |
| `Look up their Shopify order, text them the status, and log it in CRM` | Staged or approval |
| **Approve** one safe card | Toast + thread update |
| **Deny** another card | Toast + thread update |

### C6. Research

- [ ] `Research competitors and pricing in my market` (sources panel if shown)
- [ ] `What are the latest TCPA rules for outbound SMS to leads?`

### C7. Integrations (prompt-level)

- [ ] CRM: `Find this caller in HubSpot and summarize their deal stage`
- [ ] Shopify: `Look up order #1042 in Shopify and draft a status update`
- [ ] Slack: `Post a Slack alert when a hot lead calls twice in one day`
- [ ] Calendar: `Check my calendar availability Thursday afternoon and draft a booking confirmation`
- [ ] Enrich: `Enrich alex.rivera@northstarmfg.com with Apollo and draft a cold opener`
- [ ] DocuSign: `Draft a standard NDA follow-up and prepare it for DocuSign`

### C8. Coach mode

- [ ] Coach → pick agent (e.g. Casey)
- [ ] `Make Ava's greeting warmer and mention same-day service`
- [ ] `Turn on calendar booking and SMS for my sales agent`
- [ ] `Review Ava's last 5 calls and suggest script improvements`
- [ ] Return to fleet-only mode

### C9. Creative

- [ ] `Generate 3 logo concepts for my home services brand`

### C10. Routing guards

| Prompt | Must NOT happen |
|--------|-----------------|
| `I need a small function that checks if an email address looks valid.` | Painter-only, no code |
| `Design a new website for my plumbing business with booking CTA.` | Logo hijack |
| Website **without** Design mode | Handoff to `/design` or inline HTML |
| Same website **with** Design mode | Inline design path |

### C11. Thread UX

- [ ] Phases: connecting → **preparing** → thinking → reply (DF-002)
- [ ] No eternal "Connecting to Director" >4 min
- [ ] No persistent degraded banner on fresh thread (DF-003)
- [ ] Artifacts panel after code deliverable
- [ ] Research sources after web probe
- [ ] Clear thread → empty hero
- [ ] Capability pills on empty state
- [ ] Long reply scrolls; approval cards 44px on 390px
- [ ] `/chat?agent=<id>` legacy URL → coach mode

---

## D. Painter / Design (`/design`)

- [ ] Beta badge; separate thread from Director
- [ ] Desktop: chat + live preview split
- [ ] Mobile: Chat / Preview tabs
- [ ] Starters (click each or minimum 2):
  - Mobile-first landing page for a local service business
  - Three-step onboarding flow with progress and validation
  - Ops dashboard with KPI cards and live activity feed
  - Pricing page with three tiers and feature comparison
  - Appointment booking flow with calendar and confirmation
  - Help center with search, categories, and article layout
- [ ] Render probe: `Design a one-page landing for a debt relief firm — hero, trust strip, FAQ, contact CTA.` (≤3 min)
- [ ] Brand setup → second prompt reflects profile
- [ ] Clear thread → empty state
- [ ] Chat handoff: website prompt in Director → `/design?prompt=…` if applicable

---

## E. Live Ops `/ops` — click every tab

| Tab | ID | Test |
|-----|-----|------|
| Live floor | `floor` | Pulse metrics, call cards or quiet state |
| Actions | `intel` | Action queue; proposed vs live |
| Triage | `triage` | Queue grid, priority indicators |
| Analytics | `analytics` | Charts or empty state |

Redirects (URL bar only): `/ops/actions` → Actions; `/triage` → Triage; `/cockpit` → floor.

---

## F. Training `/training` — every tab

| Tab | ID | Test |
|-----|-----|------|
| Knowledge | `database` | Entries or empty state |
| Voices | `voices` | Voice picker |
| Pronunciation | `pronunciation` | Rules table |
| Simulator | `simulator` | Run UI |
| Flow | `flow` | Flow editor |

Redirect: `/knowledge` → Knowledge tab.

---

## G. Insights `/insights` — every sub-view

**Performance:** funnel, goals, heatmap, leaderboard

**Quality:** failures, latency, quality

**Revenue:** attribution, topics, spend

Each: chart loads or designed empty state.

---

## H. Agents `/agents`

- [ ] Templates — gallery, deploy CTA
- [ ] My Fleet — agent cards, edit entry points

---

## I. Channels & sales

### Phone `/phone`

| Tab | Sub-views (outbound) |
|-----|----------------------|
| Call History | Expand row, demo badge |
| Outbound | dispatch, campaigns, sequences, callbacks |
| Appointments | upcoming / history |

### Email `/email`

- [ ] Inbox list → open thread → body renders

### SMS `/sms`

- [ ] Thread list → open thread (do not send real SMS unless intended)

### Pipeline `/pipeline`

- [ ] Stages visible; seeded showcase; card actions if any

### Contact profile

- [ ] From phone or pipeline row → `/contact/:number` timeline

---

## J. Admin & compliance

### `/admin` — click every tab

| Tab | `?tab=` | Test |
|-----|---------|------|
| Branding | `branding` | Logo, colors, voice |
| Carrier | `carrier` | Phone numbers |
| Billing | `subscription` | Plan, usage |
| Team | `team` | Members, roles |
| Growth | `flywheel` | Growth engine |
| Activity | `activity` | Activity log |
| DNC | `dnc` | Block list |
| Audit | `audit` | Audit log |

Also via sidebar: `/integrations`, `/dnc`, `/audit`, `/help`

Redirects: `/billing` → subscription; `/admin/growth` → flywheel; `/account` → subscription.

### Integrations `/integrations`

- [ ] Marketplace grid → open card → connect modal

### Help `/help`

- [ ] Articles / search

### Founder `/founder`

- [ ] Skip if 403; else stats + operator console

---

## K. In-app authenticated public pages

| Route | Test |
|-------|------|
| `/status` | Status content |
| `/changelog` | Changelog |
| `/security` | Security content |

---

## L. Redirects & edges (URL bar allowed)

| URL | Expected |
|-----|----------|
| `/director` | → `/chat` |
| `/dashboard` `/command` `/live` | → `/ops` |
| `/logs` | → `/phone` |
| `/outbound` | → `/phone?tab=outbound` |
| `/appointments` | → phone appointments |
| `/inbox` | → `/email` |
| `/invalid-path` | 404 page |
| Double-send in Director | No corrupt thread |

---

## M. Observability (CDP)

- [ ] Console errors catalogued (ignore third-party fonts/analytics)
- [ ] No unexplained `/api/*` 5xx
- [ ] Director SSE reaches terminal UI state
- [ ] Optional: `--wireline-rail-w` vs `main` padding-left at 1440

---

## N. Design bar (see design-bar.md)

- [ ] P0 surfaces: Director, shell, Painter
- [ ] Cream/velvet; no new orphan blues
- [ ] Empty / loading / error / streaming states
- [ ] Operator-specific copy (not generic AI slop)
- [ ] shadcn patterns on forms, tables, dialogs

---

## O. Moat & trust (see trust-moat.md)

- [ ] M1–M7 routing guards
- [ ] Trust ladder: intent → proposal → decision on execute
- [ ] Live vs proposed on Ops Actions
- [ ] Demo badges on seeded data when visible
- [ ] Self-improvement loop (launch gate only)

---

## P. Production sign-off

- [ ] P0 journeys J1, J2, J3, J8 pass
- [ ] All sections A–O attempted or skip documented
- [ ] [scorecard.md](scorecard.md) total ≥ 85, no dim < 3
- [ ] Zero open P0 (or user accepted in report)
- [ ] `dogfood-report.md` + `scorecard.json` saved
- [ ] Screenshots for every fail → `terminals/dogfood-prod/screenshots/`

---

## Q. Re-run full checklist when touching

`DirectorWorkspace.tsx`, `director/*`, `pages/Design.tsx`, `director-routes.ts`,
`director-design-orchestrator.ts`, `useStreamingChat.ts`, `director-store.ts`,
`AppShell.tsx`, `Sidebar.tsx`, `index.css`, `wireline-director-design.ts`,
`wireline-painter-design.ts`, auth/session paths.
