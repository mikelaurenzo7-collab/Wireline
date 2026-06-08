# Wireline dogfood — commission stress matrix

**Rule:** Opening a page is **0% done**. Mark each row **pass / fail / skip (why)**.
A **fail** gets a bug ID in the report. **Skip** only with reason (e.g. 403 founder).

Browser MCP only. **Director Chat (§C)** and **Design beta (§D)** are mandatory every
full run.

---

## A. Auth & session reset

- [ ] `/auth` → sign in with demo credentials (form submit)
- [ ] Session survives sidebar navigation
- [ ] Sign out → protected routes redirect
- [ ] **Chat** → Clear thread (confirm dialog if needed)
- [ ] **Design** → Clear thread

---

## B. App shell

- [ ] Sidebar: all groups (Workspace, Channels, Sales, Fleet, Admin gear)
- [ ] **Design** shows Beta badge
- [ ] TopBar title matches route
- [ ] 390px: hamburger, no horizontal scroll, 44px targets
- [ ] 834px + 1440px layouts sane
- [ ] Skip link / focus visible on Tab
- [ ] Rapid sidebar switch ×3 — no stale content >2s

---

## C. Director Chat (`/chat`) ★ REQUIRED EVERY RUN

### C1. Composer toolbar — click each once

- [ ] Model picker opens and selection sticks
- [ ] Connectors panel
- [ ] Capabilities catalog opens → skill inserts text
- [ ] Coach → select agent → Abilities chip appears
- [ ] Abilities toggle (when coaching)
- [ ] Design mode (BETA) toggle on + off
- [ ] Brand setup panel (Design mode)
- [ ] Account branding toggle (Design mode)
- [ ] Deep mode (Brain) toggle
- [ ] Attach panel / PDF upload if available
- [ ] Enter sends / Shift+Enter newline

### C2. Starter prompts — click → send → wait stream end

- [ ] Each **featured** starter on full run (min 3 on regression)
- [ ] Expand **More prompts** → at least one more

### C3. Strategy probes

- [ ] Fleet audit
- [ ] Weekly priorities
- [ ] GTM one-pager
- [ ] Pipeline health
- [ ] Deep fleet dive (with Deep mode on)

### C4. Create probes

- [ ] Business plan
- [ ] Call script
- [ ] Email sequence
- [ ] SOP / playbook
- [ ] Landing page copy
- [ ] Website design (HTML/sitemap)
- [ ] Code & automation (fenced code block)
- [ ] Objection matrix

### C5. Execute / approvals — **approve AND deny**

- [ ] Outbound call proposal → **Approve** one
- [ ] Send text proposal → **Deny** one (or second approve on safe card)
- [ ] Send email proposal
- [ ] Multi-step workflow prompt

### C6. Research

- [ ] Competitor scan (sources if shown)
- [ ] Compliance / TCPA lookup

### C7. Integrations (prompt-level)

- [ ] CRM lookup
- [ ] Shopify order
- [ ] Slack alert
- [ ] Book meeting
- [ ] Enrich lead
- [ ] DocuSign flow

### C8. Coach mode

- [ ] Coach agent selected
- [ ] Tune greeting prompt
- [ ] Toggle capabilities prompt
- [ ] Post-call coaching prompt
- [ ] Return to fleet-only mode

### C9. Creative

- [ ] Logo concepts prompt

### C10. Routing guards — file bug if violated

- [ ] Natural code → code reply, not Painter-only
- [ ] Website prompt → no logo hijack
- [ ] Website without Design mode → handoff or HTML
- [ ] Hero + HTML prompt → substantive reply

### C11. Thread UX

- [ ] Streaming completes; thinking → reply (≤4 min)
- [ ] Artifacts panel (after code)
- [ ] Research sources (after web)
- [ ] Clear thread → empty hero
- [ ] Capability pills on empty state
- [ ] 390px composer usable
- [ ] Double-send same message — thread not corrupted

---

## D. Design beta (`/design`) ★ REQUIRED EVERY FULL RUN

### D1. Painter core

- [ ] Beta badge in sidebar
- [ ] Desktop split pane; mobile Chat/Preview tabs
- [ ] Each Painter starter (full) or min 4 (regression)
- [ ] Long render probe — wait ≤3 min; note live vs HTML fallback
- [ ] Brand setup panel
- [ ] Clear thread → empty state
- [ ] Director handoff from Chat → `/design?prompt=…` when applicable

### D2. Export panel — open Export mode

- [ ] Export panel visible; handoff lanes listed

### D3. OAuth connections

- [ ] **Figma** — Connect → OAuth Allow → redirect `?connected=figma` → account email shown
- [ ] **Canva** — connected or reconnect succeeds
- [ ] **GitHub** — connected or reconnect (allow popup if blocked)

### D4. Export actions

- [ ] **Export to Figma** — ZIP toast + download
- [ ] **Export React + Tailwind** — ZIP toast + download
- [ ] **Send to Canva** — works if image artifact; note if disabled (expected without PNG)
- [ ] **Create GitHub PR** — open flow; complete only if safe test repo

### D5. Integration verify (after UI)

- [ ] `/api/design/integrations` shows `connected: true` for providers tested

---

## E. Live Ops `/ops` — all tabs

- [ ] Live floor (`floor`)
- [ ] Actions (`intel`) — `/ops/actions` redirect
- [ ] Triage (`triage`) — `/triage` redirect
- [ ] Analytics (`analytics`) — chart or empty ≤8s

---

## F. Training `/training` — all tabs

- [ ] Knowledge (`database`)
- [ ] Voices
- [ ] Pronunciation
- [ ] Simulator
- [ ] Flow

---

## G. Insights `/insights` — all groups + views

**Performance:** funnel, goals, heatmap, leaderboard

**Quality:** failures, latency, quality

**Revenue:** attribution, topics, spend

---

## H. Agents `/agents`

- [ ] Templates
- [ ] My Fleet

---

## I. Channels

**Phone** — Call History, Outbound (+ dispatch, campaigns, sequences, callbacks), Appointments

**Email** — inbox + open thread

**SMS** — open thread (do not text real numbers)

**Pipeline** — stages + seeded data

**Contact** — open profile from a row

---

## J. Admin & compliance

**`/admin` tabs:** branding, carrier, subscription, team, flywheel, activity

**Also:** `/integrations`, `/dnc`, `/audit`, `/help`

**`/founder`** (if owner): stats + console — skip with note if 403

---

## K. Marketing (logged out) — optional

`/`, `/pricing`, `/showcase`, `/compare`, `/about`, `/support`, `/developers`, `/blog`, `/for/*`

Only when user scopes marketing.

---

## L. Redirects & edges

- [ ] `/director` → `/chat`
- [ ] `/billing` → subscription tab
- [ ] Invalid route → 404
- [ ] Empty required form → validation message
- [ ] Cancel mid-dialog — no partial corrupt state

---

## M. Observability — hunt errors

- [ ] No core `/api/*` **500** on happy paths exercised
- [ ] Streams complete or error toast (not silent hang)
- [ ] OAuth errors surfaced in UI (not raw JSON page)
- [ ] Console errors tied to visible UI break → bug ID

---

## N. UX regressions (file as P2 unless blocking)

- [ ] P0 surfaces: Director, shell, Painter
- [ ] Cream/velvet tokens; no orphan blues
- [ ] Empty / loading / error states
- [ ] Director copy operator-specific

---

## O. Regression — re-run full §C + §D when touching

`DirectorWorkspace.tsx`, `director/*`, `pages/Design.tsx`, `DirectorStitchPreviewStudio.tsx`,
`design-export-routes.ts`, `figma-service.ts`, `oauth/*`, `director-routes.ts`,
`director-design-orchestrator.ts`, `AppShell`, `Sidebar`, `index.css`,
`wireline-director-design.ts`, `wireline-painter-design.ts`, auth/seed paths

---

## Coverage tally (copy to report)

```
Must rows attempted: __ / __
Director toolbar: __ / 11
Director probes sent: __
Approvals: approve ☐  deny ☐
Design export lanes: __ / 6
Ops tabs: __ / 4
Training tabs: __ / 5
Insights views: __ / 9
Admin tabs: __ / 6+
Bugs filed: P0 __  P1 __  P2 __
```
